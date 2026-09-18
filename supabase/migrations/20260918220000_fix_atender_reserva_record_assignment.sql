-- ============================================================================
-- Migration: 20260918220000_fix_atender_reserva_record_assignment.sql
-- Objetivo:
-- Corrigir erro "record 'v_exemplar' is not assigned yet" na RPC public.atender_reserva.
-- Em PL/pgSQL, tentar acessar campos de uma variável RECORD (ex.: v_exemplar.id_exemplar)
-- antes de qualquer SELECT ... INTO bem-sucedido lança a exception 55000 (object_not_yet_assigned).
--
-- Correções implementadas:
-- 1. Usar explicitamente 'public.exemplar%ROWTYPE' para v_exemplar (e records conhecidos)
--    e/ou variável auxiliar scalar (v_id_exemplar VARCHAR(15)) e flag booleana de controle.
-- 2. Garantir que todo acesso a campos só ocorra após confirmação de atribuição.
-- 3. Caso nenhum exemplar físico seja localizado, lançar a mensagem amigável esperada:
--    'Nenhum exemplar disponível para atender esta reserva no momento.'
-- 4. Preservar todas as regras de negócio:
--    - Tolerância a maiúsculas / Title-case ('DISPONIVEL', 'Disponivel', etc.)
--    - Validação tolerante e coerente de bloqueio do leitor
--    - Verificação de acervo da Diretoria
--    - Prazos de retirada em dias úteis (configuracao PRAZO_RETIRADA_DIAS_UTEIS) e empréstimo (PRAZO_EMPRESTIMO_DIAS)
--    - Transição do exemplar para BLOQUEADO e reserva para Atendida / CONTEMPLADO
--    - Criação ou reaproveitamento de empréstimo em PENDENTE_RETIRADA
--    - Reordenação da fila FIFO
--    - Registros de auditoria de transição
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atender_reserva(
    p_id_reserva INT,
    p_operador_nome VARCHAR(255) DEFAULT 'Operador'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_reserva public.reserva%ROWTYPE;
    v_titulo public.titulo%ROWTYPE;
    v_leitor public.leitor%ROWTYPE;
    v_exemplar public.exemplar%ROWTYPE;
    v_exemplar_encontrado BOOLEAN := false;
    v_prazo_retirada_dias INT := 4;
    v_prazo_emprestimo_dias INT := 15;
    v_data_limite_retirada TIMESTAMPTZ;
    v_data_prevista_devolucao TIMESTAMPTZ;
    v_id_emprestimo INT;
    v_has_access BOOLEAN := false;
    v_emp_existente public.emprestimo%ROWTYPE;
BEGIN
    -- 1. Lock e leitura da reserva
    SELECT * INTO v_reserva
    FROM public.reserva
    WHERE id_reserva = p_id_reserva
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reserva ID % não encontrada.', p_id_reserva;
    END IF;

    IF v_reserva.status_reserva = 'Atendida' AND UPPER(COALESCE(v_reserva.status, '')) = 'ATENDIDA' THEN
        RAISE EXCEPTION 'Esta reserva já foi atendida anteriormente.';
    END IF;

    IF v_reserva.status_reserva = 'Cancelada' OR UPPER(COALESCE(v_reserva.status, '')) = 'CANCELADO' THEN
        RAISE EXCEPTION 'Esta reserva está cancelada e não pode ser atendida.';
    END IF;

    -- 2. Lock do título
    SELECT * INTO v_titulo
    FROM public.titulo
    WHERE id_titulo = v_reserva.id_titulo
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Título % não encontrado no acervo.', v_reserva.id_titulo;
    END IF;

    -- 3. Lock do leitor
    SELECT * INTO v_leitor
    FROM public.leitor
    WHERE id_leitor = v_reserva.id_leitor
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Leitor ID % não encontrado.', v_reserva.id_leitor;
    END IF;

    -- Validação tolerante e coerente de bloqueio:
    -- Considera bloqueado apenas se bloqueado=true OU (status='BLOQUEADO' e bloqueado não for explicitamente false)
    IF COALESCE(v_leitor.bloqueado, false) = true
       OR (UPPER(TRIM(COALESCE(v_leitor.status, 'ATIVO'))) = 'BLOQUEADO' AND v_leitor.bloqueado IS DISTINCT FROM false) THEN
        RAISE EXCEPTION 'O leitor está BLOQUEADO e não pode receber empréstimos.';
    END IF;

    -- 4. Verificação de permissão para acervo da diretoria
    IF COALESCE(v_titulo.colecao, 'geral') = 'diretoria' THEN
        v_has_access := COALESCE(v_leitor.acesso_diretoria, false);
        IF NOT v_has_access AND v_leitor.id_auth IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = v_leitor.id_auth AND papel IN ('admin', 'operador_diretoria')
            ) INTO v_has_access;
        END IF;

        IF NOT v_has_access THEN
            RAISE EXCEPTION 'O leitor selecionado não possui permissão para retirar livros da Diretoria.';
        END IF;
    END IF;

    -- 5. Prazos configurados no sistema
    SELECT COALESCE(NULLIF(valor, '')::INT, 4) INTO v_prazo_retirada_dias
    FROM public.configuracao WHERE chave = 'PRAZO_RETIRADA_DIAS_UTEIS';
    IF v_prazo_retirada_dias IS NULL THEN v_prazo_retirada_dias := 4; END IF;

    SELECT COALESCE(NULLIF(valor, '')::INT, 15) INTO v_prazo_emprestimo_dias
    FROM public.configuracao WHERE chave = 'PRAZO_EMPRESTIMO_DIAS';
    IF v_prazo_emprestimo_dias IS NULL THEN v_prazo_emprestimo_dias := 15; END IF;

    v_data_limite_retirada := public.calcular_prazo_dias_uteis(NOW(), v_prazo_retirada_dias);
    v_data_prevista_devolucao := NOW() + (v_prazo_emprestimo_dias || ' days')::INTERVAL;

    -- 6. Seleção do exemplar físico:
    -- Cenário A: A reserva já tem exemplar_reservado_id vinculado
    IF v_reserva.exemplar_reservado_id IS NOT NULL THEN
        SELECT * INTO v_exemplar
        FROM public.exemplar
        WHERE id_exemplar = v_reserva.exemplar_reservado_id
        FOR UPDATE;

        IF FOUND THEN
            v_exemplar_encontrado := true;
        END IF;
    END IF;

    -- Cenário B: Se não encontrou pelo vínculo anterior, busca um exemplar disponível do título
    IF NOT v_exemplar_encontrado THEN
        SELECT * INTO v_exemplar
        FROM public.exemplar
        WHERE id_titulo = v_reserva.id_titulo
          AND UPPER(TRIM(COALESCE(status, ''))) IN ('DISPONIVEL', 'DISPONÍVEL')
        ORDER BY seq ASC
        LIMIT 1
        FOR UPDATE;

        IF FOUND THEN
            v_exemplar_encontrado := true;
        END IF;
    END IF;

    -- Cenário C: Se ainda não encontrou, busca um exemplar BLOQUEADO ou RESERVADO sem empréstimo ATIVO em posse física
    IF NOT v_exemplar_encontrado THEN
        SELECT ex.* INTO v_exemplar
        FROM public.exemplar ex
        WHERE ex.id_titulo = v_reserva.id_titulo
          AND UPPER(TRIM(COALESCE(ex.status, ''))) IN ('BLOQUEADO', 'RESERVADO')
          AND NOT EXISTS (
              SELECT 1 FROM public.emprestimo emp
              WHERE emp.id_exemplar = ex.id_exemplar
                AND emp.data_devolucao_real IS NULL
                AND UPPER(COALESCE(emp.status, '')) = 'ATIVO'
          )
        ORDER BY ex.seq ASC
        LIMIT 1
        FOR UPDATE;

        IF FOUND THEN
            v_exemplar_encontrado := true;
        END IF;
    END IF;

    IF NOT v_exemplar_encontrado OR v_exemplar.id_exemplar IS NULL THEN
        RAISE EXCEPTION 'Nenhum exemplar disponível para atender esta reserva no momento.';
    END IF;

    -- 7. Atualizar exemplar para BLOQUEADO (especificação para aguardo de retirada)
    UPDATE public.exemplar
    SET status = 'BLOQUEADO'
    WHERE id_exemplar = v_exemplar.id_exemplar;

    -- 8. Atualizar a reserva para Atendida
    UPDATE public.reserva
    SET status_reserva = 'Atendida',
        status = 'CONTEMPLADO',
        data_atendimento = NOW(),
        exemplar_reservado_id = v_exemplar.id_exemplar,
        data_limite_retirada = COALESCE(v_reserva.data_limite_retirada, v_data_limite_retirada),
        posicao_fila = 0,
        ordem_fila = 0
    WHERE id_reserva = p_id_reserva;

    -- 9. Reordenar demais leitores da fila FIFO para este título
    WITH fila_reordenada AS (
        SELECT id_reserva, ROW_NUMBER() OVER (ORDER BY COALESCE(posicao_fila, ordem_fila, 1) ASC, created_at ASC) as nova_pos
        FROM public.reserva
        WHERE id_titulo = v_reserva.id_titulo
          AND id_reserva <> p_id_reserva
          AND status_reserva IN ('Ativa', 'Pronta para Retirada')
          AND UPPER(COALESCE(status, '')) NOT IN ('CANCELADO', 'EXPIRADO', 'ATENDIDA')
    )
    UPDATE public.reserva r
    SET posicao_fila = fr.nova_pos,
        ordem_fila = fr.nova_pos
    FROM fila_reordenada fr
    WHERE r.id_reserva = fr.id_reserva;

    -- 10. Verificar se já existe um empréstimo PENDENTE_RETIRADA para este leitor e exemplar
    SELECT * INTO v_emp_existente
    FROM public.emprestimo
    WHERE id_exemplar = v_exemplar.id_exemplar
      AND id_leitor = v_reserva.id_leitor
      AND data_devolucao_real IS NULL
      AND UPPER(COALESCE(status, '')) = 'PENDENTE_RETIRADA'
    ORDER BY id_emprestimo DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        v_id_emprestimo := v_emp_existente.id_emprestimo;
        -- Atualizar prazos se necessário
        UPDATE public.emprestimo
        SET data_limite_retirada = COALESCE(data_limite_retirada, v_data_limite_retirada),
            data_prevista_devolucao = COALESCE(data_prevista_devolucao, v_data_prevista_devolucao)
        WHERE id_emprestimo = v_id_emprestimo;
    ELSE
        -- Criar novo empréstimo PENDENTE_RETIRADA com prazo de retirada em dias úteis
        INSERT INTO public.emprestimo (
            id_exemplar,
            id_leitor,
            data_emprestimo,
            data_prevista_devolucao,
            status,
            data_limite_retirada,
            numero_renovacoes,
            atraso,
            dias_atraso
        ) VALUES (
            v_exemplar.id_exemplar,
            v_reserva.id_leitor,
            NOW(),
            v_data_prevista_devolucao,
            'PENDENTE_RETIRADA',
            v_data_limite_retirada,
            0,
            false,
            0
        ) RETURNING id_emprestimo INTO v_id_emprestimo;
    END IF;

    -- 11. Auditoria
    PERFORM public.registrar_auditoria_transicao(
        'reserva',
        p_id_reserva::TEXT,
        v_reserva.status_reserva,
        'Atendida',
        NULL,
        p_operador_nome,
        'Reserva atendida pelo operador: exemplar liberado para retirada física',
        jsonb_build_object(
            'exemplar_id', v_exemplar.id_exemplar,
            'emprestimo_id', v_id_emprestimo,
            'data_limite_retirada', v_data_limite_retirada
        )
    );

    PERFORM public.registrar_auditoria_transicao(
        'exemplar',
        v_exemplar.id_exemplar,
        v_exemplar.status,
        'BLOQUEADO',
        NULL,
        p_operador_nome,
        'Exemplar bloqueado aguardando retirada da reserva atendida',
        jsonb_build_object(
            'reserva_id', p_id_reserva,
            'leitor_id', v_reserva.id_leitor,
            'emprestimo_id', v_id_emprestimo
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'id_reserva', p_id_reserva,
        'id_emprestimo', v_id_emprestimo,
        'id_exemplar', v_exemplar.id_exemplar,
        'id_leitor', v_reserva.id_leitor,
        'leitor_nome', v_leitor.nome_do_leitor,
        'livro_titulo', v_titulo.titulo_de_livro,
        'status_exemplar', 'BLOQUEADO',
        'status_emprestimo', 'PENDENTE_RETIRADA',
        'data_limite_retirada', v_data_limite_retirada,
        'mensagem', 'Reserva atendida com sucesso! Exemplar ' || v_exemplar.id_exemplar || ' liberado para retirada física.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.atender_reserva(INT, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atender_reserva(INT, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION public.atender_reserva(INT, VARCHAR) TO anon;
