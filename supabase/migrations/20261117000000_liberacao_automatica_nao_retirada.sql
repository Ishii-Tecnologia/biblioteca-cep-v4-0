-- ============================================================================
-- Liberação automática por NÃO RETIRADA no prazo (1 dia útil após a data limite)
--
-- Regra pedida:
--  1) Empréstimo em PENDENTE_RETIRADA: se passar 1 dia ÚTIL depois da
--     "limite da retirada" (data_limite_retirada) sem confirmação de retirada,
--     o empréstimo é marcado como EXPIRADO, o exemplar volta a ficar
--     disponível (ou vai para o próximo da fila) e a ocorrência é registrada
--     em public.historico.
--  2) Reserva "Pronta para Retirada" (Reserva Garantida até ...): se passar
--     1 dia ÚTIL depois de data_limite_retirada sem conclusão, a reserva é
--     marcada como 'Expirada', o exemplar volta à biblioteca (ou vai para o
--     próximo da fila) e a ocorrência é registrada em public.historico.
--
-- Tolerância configurável em public.parametros
--   chave: 'tolerancia_liberacao_dias_uteis' (padrão 1)
--
-- Idempotente: só processa linhas ainda em PENDENTE_RETIRADA / Pronta para
-- Retirada; rodar duas vezes não duplica liberação nem log.
-- Disparo: RPC chamado pelas telas staff (/emprestimos, /reservas) no
-- carregamento (não há pg_cron neste projeto).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tolerância padrão (1 dia útil) em public.parametros
-- ---------------------------------------------------------------------------
INSERT INTO public.parametros (chave, valor, descricao)
VALUES (
  'tolerancia_liberacao_dias_uteis',
  '1',
  'Dias úteis de tolerância após a data limite de retirada (empréstimo não retirado ou "Reserva Garantida até" vencida) antes da liberação automática do item para a biblioteca.'
)
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Nova RPC: processar_liberacoes_nao_retiradas
--    (complementa processar_expiracoes_automaticas adicionando a tolerância
--     de 1 dia útil e o log em public.historico)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.processar_liberacoes_nao_retiradas(
    p_operador_nome VARCHAR DEFAULT 'Sistema (Automático)'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row RECORD;
    v_proximo RECORD;
    v_tolerancia INT := 1;
    v_limite_efetivo TIMESTAMPTZ;
    v_liberados INT := 0;
    v_reservas_expiradas INT := 0;
    v_reservas_expiradas_total INT := 0;
    v_detalhes JSONB := '[]'::jsonb;
BEGIN
    -- Tolerância configurável (padrão 1 dia útil)
    BEGIN
        SELECT COALESCE(NULLIF(valor, '')::INT, 1) INTO v_tolerancia
        FROM public.parametros
        WHERE chave = 'tolerancia_liberacao_dias_uteis';
    EXCEPTION WHEN OTHERS THEN
        BEGIN
            SELECT COALESCE(NULLIF(valor, '')::INT, 1) INTO v_tolerancia
            FROM public.configuracao
            WHERE UPPER(chave) = 'TOLERANCIA_LIBERACAO_DIAS_UTEIS';
        EXCEPTION WHEN OTHERS THEN
            v_tolerancia := 1;
        END;
    END;

    IF v_tolerancia IS NULL OR v_tolerancia < 0 THEN
        v_tolerancia := 1;
    END IF;

    -- ===================== 1) EMPRÉSTIMOS NÃO RETIRADOS =====================
    FOR v_row IN
        SELECT emp.id_emprestimo,
               emp.id_exemplar,
               emp.id_leitor,
               emp.data_limite_retirada,
               ex.id_titulo,
               t.titulo_de_livro
        FROM public.emprestimo emp
        JOIN public.exemplar ex ON ex.id_exemplar = emp.id_exemplar
        LEFT JOIN public.titulo t ON t.id_titulo = ex.id_titulo
        WHERE UPPER(emp.status) = 'PENDENTE_RETIRADA'
          AND emp.data_limite_retirada IS NOT NULL
          AND emp.data_devolucao_real IS NULL
          AND emp.data_retirada_real IS NULL
        FOR UPDATE OF emp
    LOOP
        -- Prazo efetivo = data_limite_retirada + 1 dia útil (se ainda não venceu, pula)
        v_limite_efetivo := public.calcular_prazo_dias_uteis(
            v_row.data_limite_retirada,
            GREATEST(v_tolerancia, 1)
        );

        IF v_limite_efetivo IS NULL OR v_limite_efetivo >= NOW() THEN
            CONTINUE; -- ainda dentro da tolerância de 1 dia útil
        END IF;

        -- Marca o empréstimo como EXPIRADO (liberado automaticamente)
        UPDATE public.emprestimo
        SET status = 'EXPIRADO'
        WHERE id_emprestimo = v_row.id_emprestimo
          AND UPPER(status) = 'PENDENTE_RETIRADA';

        IF NOT FOUND THEN
            CONTINUE; -- já processado (idempotência)
        END IF;

        -- Marca reserva "Pronta para Retirada"/CONTEMPLADO/NOTIFICADO associada como EXPIRADO
        UPDATE public.reserva
        SET status = 'EXPIRADO',
            status_reserva = 'Expirada'
        WHERE id_titulo = v_row.id_titulo
          AND id_leitor = v_row.id_leitor
          AND (status IN ('CONTEMPLADO', 'NOTIFICADO') OR status_reserva = 'Pronta para Retirada');

        -- Log da ocorrência em public.historico (entidade = exemplar)
        BEGIN
            INSERT INTO public.historico (tipo, descricao, entidade_tipo, entidade_id, id_leitor, observacao)
            VALUES (
                'Emprestimo Expirado',
                format(
                    'Empréstimo #%s do exemplar %s (" %s") para o leitor #%s foi LIBERADO AUTOMATICAMENTE: não retirado no prazo — data limite de retirada %s vencida com tolerância de 1 dia útil. Exemplar disponível novamente para empréstimo.',
                    v_row.id_emprestimo,
                    v_row.id_exemplar,
                    COALESCE(v_row.titulo_de_livro, v_row.id_titulo),
                    v_row.id_leitor,
                    TO_CHAR(v_row.data_limite_retirada AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                ),
                'exemplar',
                v_row.id_exemplar,
                v_row.id_leitor,
                'Operador: ' || p_operador_nome
            );
        EXCEPTION WHEN OTHERS THEN
            -- Log não bloqueia a liberação
            NULL;
        END;

        v_liberados := v_liberados + 1;

        -- Avança a fila de reservas do título, se houver alguém esperando
        SELECT * INTO v_proximo
        FROM public.reserva
        WHERE id_titulo = v_row.id_titulo
          AND (status = 'NA_FILA' OR status_reserva = 'Ativa')
        ORDER BY COALESCE(posicao_fila, ordem_fila, 1) ASC, created_at ASC
        LIMIT 1
        FOR UPDATE;

        IF FOUND THEN
            UPDATE public.reserva
            SET status = 'CONTEMPLADO',
                status_reserva = 'Pronta para Retirada',
                data_atendimento = NOW(),
                data_limite_retirada = public.calcular_prazo_dias_uteis(NOW(), 4),
                exemplar_reservado_id = v_row.id_exemplar,
                posicao_fila = 0,
                ordem_fila = 0
            WHERE id_reserva = v_proximo.id_reserva;

            BEGIN
                INSERT INTO public.historico (tipo, descricao, entidade_tipo, entidade_id, id_leitor, observacao)
                VALUES (
                    'Fila Avancada',
                    format(
                        'Reserva #%s do leitor #%s foi contemplada automaticamente com o exemplar %s (" %s") liberado por não retirada no prazo pelo leitor anterior. Novo prazo de retirada: %s.',
                        v_proximo.id_reserva,
                        v_proximo.id_leitor,
                        v_row.id_exemplar,
                        COALESCE(v_row.titulo_de_livro, v_row.id_titulo),
                        TO_CHAR(public.calcular_prazo_dias_uteis(NOW(), 4) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                    ),
                    'exemplar',
                    v_row.id_exemplar,
                    v_proximo.id_leitor,
                    'Operador: ' || p_operador_nome
                );
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        ELSE
            -- Ninguém na fila: exemplar volta a ficar DISPONIVEL na biblioteca
            UPDATE public.exemplar
            SET status = 'DISPONIVEL'
            WHERE id_exemplar = v_row.id_exemplar;
        END IF;
    END LOOP;

    -- ============ 2) RESERVAS "PRONTA PARA RETIRADA" NÃO CONCLUÍDAS =========
    FOR v_row IN
        SELECT r.id_reserva,
               r.id_titulo,
               r.id_leitor,
               r.data_limite_retirada,
               r.exemplar_reservado_id,
               t.titulo_de_livro
        FROM public.reserva r
        LEFT JOIN public.titulo t ON t.id_titulo = r.id_titulo
        WHERE r.status_reserva = 'Pronta para Retirada'
          AND r.data_limite_retirada IS NOT NULL
        FOR UPDATE OF r
    LOOP
        v_limite_efetivo := public.calcular_prazo_dias_uteis(
            v_row.data_limite_retirada,
            GREATEST(v_tolerancia, 1)
        );

        IF v_limite_efetivo IS NULL OR v_limite_efetivo >= NOW() THEN
            CONTINUE; -- ainda dentro da tolerância de 1 dia útil
        END IF;

        -- Expira a reserva
        UPDATE public.reserva
        SET status = 'EXPIRADO',
            status_reserva = 'Expirada'
        WHERE id_reserva = v_row.id_reserva
          AND status_reserva = 'Pronta para Retirada';

        IF NOT FOUND THEN
            CONTINUE; -- já processado (idempotência)
        END IF;

        v_reservas_expiradas := v_reservas_expiradas + 1;
        v_reservas_expiradas_total := v_reservas_expiradas_total + 1;

        -- Log da ocorrência em public.historico
        BEGIN
            INSERT INTO public.historico (tipo, descricao, entidade_tipo, entidade_id, id_leitor, observacao)
            VALUES (
                'Reserva Expirada',
                format(
                    'Reserva #%s do título %s (" %s") para o leitor #%s EXPIROU: prazo "Reserva Garantida até" (%s) vencido sem conclusão da retirada, com tolerância de 1 dia útil. Livro novamente disponível na biblioteca.',
                    v_row.id_reserva,
                    v_row.id_titulo,
                    COALESCE(v_row.titulo_de_livro, v_row.id_titulo),
                    v_row.id_leitor,
                    TO_CHAR(v_row.data_limite_retirada AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                ),
                'titulo',
                v_row.id_titulo,
                v_row.id_leitor,
                'Operador: ' || p_operador_nome
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        -- Avança a fila, se houver próximo
        SELECT * INTO v_proximo
        FROM public.reserva
        WHERE id_titulo = v_row.id_titulo
          AND (status = 'NA_FILA' OR status_reserva = 'Ativa')
        ORDER BY COALESCE(posicao_fila, ordem_fila, 1) ASC, created_at ASC
        LIMIT 1
        FOR UPDATE;

        IF FOUND AND v_row.exemplar_reservado_id IS NOT NULL THEN
            UPDATE public.reserva
            SET status = 'CONTEMPLADO',
                status_reserva = 'Pronta para Retirada',
                data_atendimento = NOW(),
                data_limite_retirada = public.calcular_prazo_dias_uteis(NOW(), 4),
                exemplar_reservado_id = v_row.exemplar_reservado_id,
                posicao_fila = 0,
                ordem_fila = 0
            WHERE id_reserva = v_proximo.id_reserva;

            BEGIN
                INSERT INTO public.historico (tipo, descricao, entidade_tipo, entidade_id, id_leitor, observacao)
                VALUES (
                    'Fila Avancada',
                    format(
                        'Reserva #%s do leitor #%s foi contemplada automaticamente com o exemplar %s (" %s") liberado por expiração da "Reserva Garantida até" do leitor anterior. Novo prazo de retirada: %s.',
                        v_proximo.id_reserva,
                        v_proximo.id_leitor,
                        v_row.exemplar_reservado_id,
                        COALESCE(v_row.titulo_de_livro, v_row.id_titulo),
                        TO_CHAR(public.calcular_prazo_dias_uteis(NOW(), 4) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                    ),
                    'exemplar',
                    v_row.exemplar_reservado_id,
                    v_proximo.id_leitor,
                    'Operador: ' || p_operador_nome
                );
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        ELSIF v_row.exemplar_reservado_id IS NOT NULL THEN
            -- Sem próximo na fila: exemplar volta a ficar DISPONIVEL
            UPDATE public.exemplar
            SET status = 'DISPONIVEL'
            WHERE id_exemplar = v_row.exemplar_reservado_id;
        END IF;
    END LOOP;

    v_detalhes := jsonb_build_object(
        'emprestimos_liberados', v_liberados,
        'reservas_expiradas', v_reservas_expiradas_total,
        'tolerancia_dias_uteis', v_tolerancia
    );

    RETURN jsonb_build_object(
        'success', true,
        'emprestimos_liberados', v_liberados,
        'reservas_expiradas', v_reservas_expiradas_total,
        'detalhes', v_detalhes
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.processar_liberacoes_nao_retiradas(VARCHAR) TO authenticated;
