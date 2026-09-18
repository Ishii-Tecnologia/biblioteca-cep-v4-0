-- Migration: 20260918200000_fix_atender_reserva_e_contemplacao.sql
-- Objetivo:
-- 1. Criar RPC public.atender_reserva com lock atômico de exemplar e reserva, cálculo de prazo em dias úteis
--    (tabela configuracao PRAZO_RETIRADA_DIAS_UTEIS e PRAZO_EMPRESTIMO_DIAS), verificação de permissão de diretoria,
--    criação do empréstimo PENDENTE_RETIRADA (ou atribuição de exemplar quando já contemplado/aguardando atendimento),
--    transição de exemplar para BLOQUEADO e auditoria de transição.
-- 2. Atualizar RPC devolver_exemplar_v2 para que, ao contemplar o 1º da fila, garanta status_reserva 'Pronta para Retirada',
--    status 'CONTEMPLADO', exemplar_reservado_id, exemplar em 'BLOQUEADO' e empréstimo 'PENDENTE_RETIRADA'.
-- 3. Garantir que as constraints de status de exemplar e reserva aceitem todos os estados da especificação de forma case-insensitive.
-- 4. Conceder permissões de execução (GRANT EXECUTE) para authenticated e service_role.

DO $$
BEGIN
    -- 1. Garantir que a constraint de status de exemplar aceite case-insensitive
    ALTER TABLE public.exemplar DROP CONSTRAINT IF EXISTS exemplar_status_check;
    ALTER TABLE public.exemplar ADD CONSTRAINT exemplar_status_check
        CHECK (UPPER(status) IN ('DISPONIVEL', 'EMPRESTADO', 'BLOQUEADO', 'RESERVADO', 'MANUTENCAO'));

    -- 2. Garantir que a constraint de status_reserva aceite Pronta para Retirada, Ativa, Atendida, Cancelada, Expirada
    ALTER TABLE public.reserva DROP CONSTRAINT IF EXISTS reserva_status_reserva_check;
    ALTER TABLE public.reserva ADD CONSTRAINT reserva_status_reserva_check
        CHECK (status_reserva IN ('Ativa', 'Pronta para Retirada', 'Atendida', 'Cancelada', 'Expirada'));

    -- 3. Garantir constraint de status de reserva da spec
    ALTER TABLE public.reserva DROP CONSTRAINT IF EXISTS reserva_status_check;
    ALTER TABLE public.reserva ADD CONSTRAINT reserva_status_check
        CHECK (UPPER(status) IN ('NA_FILA', 'NOTIFICADO', 'CONTEMPLADO', 'EXPIRADO', 'CANCELADO', 'ATENDIDA'));
END $$;

-- ============================================================================
-- RPC: atender_reserva
-- Permite ao operador atender uma reserva (esteja ela NA_FILA, CONTEMPLADO, ou Pronta para Retirada),
-- atribuindo um exemplar físico do livro (seja o já vinculado ou um DISPONIVEL/BLOQUEADO/RESERVADO correspondente),
-- criando ou confirmando o empréstimo em PENDENTE_RETIRADA com data_limite_retirada em dias úteis,
-- marcando o exemplar como BLOQUEADO e a reserva como Atendida/CONTEMPLADA.
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
    v_reserva RECORD;
    v_titulo RECORD;
    v_leitor RECORD;
    v_exemplar RECORD;
    v_prazo_retirada_dias INT := 4;
    v_prazo_emprestimo_dias INT := 15;
    v_data_limite_retirada TIMESTAMPTZ;
    v_data_prevista_devolucao TIMESTAMPTZ;
    v_id_emprestimo INT;
    v_has_access BOOLEAN := false;
    v_emp_existente RECORD;
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

    IF v_leitor.bloqueado = true OR UPPER(COALESCE(v_leitor.status, 'ATIVO')) = 'BLOQUEADO' THEN
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
    END IF;

    -- Cenário B: Se não encontrou pelo vínculo anterior, busca um exemplar disponível ou reservado/bloqueado do título
    IF v_exemplar.id_exemplar IS NULL THEN
        -- Primeiro tenta encontrar um exemplar DISPONIVEL
        SELECT * INTO v_exemplar
        FROM public.exemplar
        WHERE id_titulo = v_reserva.id_titulo
          AND UPPER(status) IN ('DISPONIVEL', 'DISPONÍVEL')
        ORDER BY seq ASC
        LIMIT 1
        FOR UPDATE;
    END IF;

    IF v_exemplar.id_exemplar IS NULL THEN
        -- Segundo tenta encontrar um exemplar BLOQUEADO ou RESERVADO sem empréstimo ATIVO em posse física
        SELECT ex.* INTO v_exemplar
        FROM public.exemplar ex
        WHERE ex.id_titulo = v_reserva.id_titulo
          AND UPPER(ex.status) IN ('BLOQUEADO', 'RESERVADO')
          AND NOT EXISTS (
              SELECT 1 FROM public.emprestimo emp
              WHERE emp.id_exemplar = ex.id_exemplar
                AND emp.data_devolucao_real IS NULL
                AND UPPER(COALESCE(emp.status, '')) = 'ATIVO'
          )
        ORDER BY ex.seq ASC
        LIMIT 1
        FOR UPDATE;
    END IF;

    IF v_exemplar.id_exemplar IS NULL THEN
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
        -- Criar novo empréstimo PENDENTE_RETIRADA com 4 dias úteis
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

-- Permissões para a nova função
GRANT EXECUTE ON FUNCTION public.atender_reserva(INT, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atender_reserva(INT, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION public.atender_reserva(INT, VARCHAR) TO anon;

-- ============================================================================
-- ATUALIZAÇÃO: devolver_exemplar_v2
-- Garantir que quando houver leitor na fila:
-- - status_reserva seja 'Pronta para Retirada' E status 'CONTEMPLADO'
-- - exemplar_reservado_id receba o exemplar devolvido
-- - exemplar passe para BLOQUEADO
-- - empréstimo seja criado em PENDENTE_RETIRADA
-- ============================================================================
CREATE OR REPLACE FUNCTION public.devolver_exemplar_v2(
    p_id_exemplar VARCHAR(15),
    p_operador_nome VARCHAR(255) DEFAULT 'Operador'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_emp RECORD;
    v_ex RECORD;
    v_reserva RECORD;
    v_prazo_retirada_dias INT := 4;
    v_data_limite_retirada TIMESTAMPTZ;
    v_novo_emprestimo_id INT;
    v_leitor_contemplado RECORD;
    v_resultado JSONB;
BEGIN
    -- 1. Lock no exemplar
    SELECT * INTO v_ex
    FROM public.exemplar
    WHERE id_exemplar = p_id_exemplar
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exemplar % não encontrado.', p_id_exemplar;
    END IF;

    -- 2. Localizar empréstimo ativo/pendente associado
    SELECT * INTO v_emp
    FROM public.emprestimo
    WHERE id_exemplar = p_id_exemplar AND data_devolucao_real IS NULL
    ORDER BY id_emprestimo DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        -- Encerrar empréstimo como DEVOLVIDO
        UPDATE public.emprestimo
        SET data_devolucao_real = NOW(),
            status = 'DEVOLVIDO'
        WHERE id_emprestimo = v_emp.id_emprestimo;

        PERFORM public.registrar_auditoria_transicao(
            'emprestimo',
            v_emp.id_emprestimo::TEXT,
            v_emp.status,
            'DEVOLVIDO',
            NULL,
            p_operador_nome,
            'Devolução física registrada',
            jsonb_build_object('data_devolucao_real', NOW())
        );
    END IF;

    -- Ler prazo de retirada da Seção 7
    SELECT COALESCE(NULLIF(valor, '')::INT, 4) INTO v_prazo_retirada_dias
    FROM public.configuracao WHERE chave = 'PRAZO_RETIRADA_DIAS_UTEIS';
    IF v_prazo_retirada_dias IS NULL THEN v_prazo_retirada_dias := 4; END IF;

    -- 3. Verificar se há reservas na fila para o livro correspondente (FIFO determinístico)
    SELECT * INTO v_reserva
    FROM public.reserva
    WHERE id_titulo = v_ex.id_titulo
      AND (status_reserva = 'Ativa' OR status = 'NA_FILA')
    ORDER BY COALESCE(posicao_fila, ordem_fila, 1) ASC, created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        v_data_limite_retirada := public.calcular_prazo_dias_uteis(NOW(), v_prazo_retirada_dias);

        -- Exemplar passa para BLOQUEADO (reservado para o 1º da fila)
        UPDATE public.exemplar
        SET status = 'BLOQUEADO'
        WHERE id_exemplar = p_id_exemplar;

        -- Reserva passa para CONTEMPLADO / Pronta para Retirada com o exemplar vinculado
        UPDATE public.reserva
        SET status = 'CONTEMPLADO',
            status_reserva = 'Pronta para Retirada',
            data_atendimento = NOW(),
            data_limite_retirada = v_data_limite_retirada,
            exemplar_reservado_id = p_id_exemplar,
            posicao_fila = 0,
            ordem_fila = 0
        WHERE id_reserva = v_reserva.id_reserva;

        -- Reordenar os demais leitores da fila (FIFO determinístico)
        WITH fila_reordenada AS (
            SELECT id_reserva, ROW_NUMBER() OVER (ORDER BY COALESCE(posicao_fila, ordem_fila, 1) ASC, created_at ASC) as nova_pos
            FROM public.reserva
            WHERE id_titulo = v_ex.id_titulo
              AND id_reserva <> v_reserva.id_reserva
              AND (status_reserva = 'Ativa' OR status = 'NA_FILA')
        )
        UPDATE public.reserva r
        SET posicao_fila = fr.nova_pos,
            ordem_fila = fr.nova_pos
        FROM fila_reordenada fr
        WHERE r.id_reserva = fr.id_reserva;

        -- Criar empréstimo em PENDENTE_RETIRADA para o leitor contemplado
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
            p_id_exemplar,
            v_reserva.id_leitor,
            NOW(),
            NOW() + INTERVAL '15 days',
            'PENDENTE_RETIRADA',
            v_data_limite_retirada,
            0,
            false,
            0
        ) RETURNING id_emprestimo INTO v_novo_emprestimo_id;

        -- Buscar dados do leitor contemplado para retorno e notificação
        SELECT nome_do_leitor, email, telefone INTO v_leitor_contemplado
        FROM public.leitor WHERE id_leitor = v_reserva.id_leitor;

        PERFORM public.registrar_auditoria_transicao(
            'reserva',
            v_reserva.id_reserva::TEXT,
            'NA_FILA',
            'CONTEMPLADO',
            NULL,
            p_operador_nome,
            'Primeiro da fila contemplado na devolução do exemplar',
            jsonb_build_object('exemplar_id', p_id_exemplar, 'data_limite_retirada', v_data_limite_retirada, 'emprestimo_id', v_novo_emprestimo_id)
        );

        PERFORM public.registrar_auditoria_transicao(
            'exemplar',
            p_id_exemplar,
            'EMPRESTADO',
            'BLOQUEADO',
            NULL,
            p_operador_nome,
            'Exemplar bloqueado para leitor contemplado na fila de reservas',
            jsonb_build_object('leitor_id', v_reserva.id_leitor, 'reserva_id', v_reserva.id_reserva)
        );

        v_resultado := jsonb_build_object(
            'success', true,
            'devolvido', true,
            'fila_contemplada', true,
            'reserva_id', v_reserva.id_reserva,
            'leitor_id', v_reserva.id_leitor,
            'leitor_nome', v_leitor_contemplado.nome_do_leitor,
            'leitor_email', v_leitor_contemplado.email,
            'leitor_telefone', v_leitor_contemplado.telefone,
            'data_limite_retirada', v_data_limite_retirada,
            'emprestimo_id', v_novo_emprestimo_id,
            'mensagem', 'Exemplar devolvido. Fila ativa identificada: 1º da fila contemplado com sucesso! Prazo de 4 dias úteis iniciado.'
        );

    ELSE
        -- Fila vazia: exemplar muda para DISPONIVEL
        UPDATE public.exemplar
        SET status = 'DISPONIVEL'
        WHERE id_exemplar = p_id_exemplar;

        PERFORM public.registrar_auditoria_transicao(
            'exemplar',
            p_id_exemplar,
            'EMPRESTADO',
            'DISPONIVEL',
            NULL,
            p_operador_nome,
            'Exemplar devolvido e liberado para novo empréstimo (sem fila)',
            NULL
        );

        v_resultado := jsonb_build_object(
            'success', true,
            'devolvido', true,
            'fila_contemplada', false,
            'mensagem', 'Exemplar devolvido com sucesso e disponível no acervo.'
        );
    END IF;

    RETURN v_resultado;
END;
$$;
