-- ============================================================================
-- Migration: 20260918210000_fix_leitor_status_and_reserva_rpc.sql
-- 1. Sincronização de dados em public.leitor entre 'bloqueado' e 'status'
-- 2. Recriar public.atender_reserva com checagem tolerante e coerente de bloqueio
-- 3. Atualizar public.criar_pre_reserva e public.validar_pre_reserva com a mesma checagem coerente
-- ============================================================================

-- 1. Reparo de dados: sincronizar em public.leitor
-- a) onde bloqueado = false e UPPER(status) = 'BLOQUEADO' -> status = 'ATIVO'
UPDATE public.leitor
SET status = 'ATIVO'
WHERE bloqueado = false
  AND UPPER(TRIM(COALESCE(status, ''))) = 'BLOQUEADO';

-- b) onde bloqueado = true -> status = 'BLOQUEADO'
UPDATE public.leitor
SET status = 'BLOQUEADO'
WHERE bloqueado = true
  AND (status IS NULL OR UPPER(TRIM(status)) <> 'BLOQUEADO');

-- ============================================================================
-- 2. Recriar a RPC public.atender_reserva com checagem tolerante e coerente
-- Considerar bloqueado apenas se:
-- COALESCE(v_leitor.bloqueado, false) = true
-- OU (UPPER(TRIM(COALESCE(v_leitor.status, 'ATIVO'))) = 'BLOQUEADO' AND v_leitor.bloqueado IS DISTINCT FROM false)
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

GRANT EXECUTE ON FUNCTION public.atender_reserva(INT, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atender_reserva(INT, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION public.atender_reserva(INT, VARCHAR) TO anon;

-- ============================================================================
-- 3. Atualizar public.criar_pre_reserva com checagem tolerante e coerente
-- ============================================================================
CREATE OR REPLACE FUNCTION public.criar_pre_reserva(
    p_leitor_id INT,
    p_livro_id VARCHAR(50),
    p_operador_nome VARCHAR(255) DEFAULT 'Sistema'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_leitor_status VARCHAR(20);
    v_bloqueado BOOLEAN;
    v_leitor_nome VARCHAR(255);
    v_livro_titulo VARCHAR(255);
    v_pre_reserva_id INT;
    v_pendente_existente INT;
BEGIN
    -- 1. Verificar Leitor
    SELECT nome_do_leitor, COALESCE(status, 'ATIVO'), bloqueado
    INTO v_leitor_nome, v_leitor_status, v_bloqueado
    FROM public.leitor
    WHERE id_leitor = p_leitor_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Leitor com ID % não encontrado.', p_leitor_id;
    END IF;

    -- Validação tolerante e coerente de bloqueio
    IF COALESCE(v_bloqueado, false) = true
       OR (UPPER(TRIM(COALESCE(v_leitor_status, 'ATIVO'))) = 'BLOQUEADO' AND v_bloqueado IS DISTINCT FROM false) THEN
        RAISE EXCEPTION 'O leitor está BLOQUEADO e não pode solicitar livros.';
    END IF;

    IF UPPER(TRIM(COALESCE(v_leitor_status, ''))) = 'INATIVO' THEN
        RAISE EXCEPTION 'O leitor está INATIVO e não pode solicitar livros.';
    END IF;

    -- 2. Verificar Livro
    SELECT titulo_de_livro INTO v_livro_titulo
    FROM public.titulo
    WHERE id_titulo = p_livro_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Livro com código % não encontrado no acervo.', p_livro_id;
    END IF;

    -- 3. Evitar pré-reserva duplicada pendente para o mesmo livro e leitor
    SELECT id INTO v_pendente_existente
    FROM public.pre_reserva
    WHERE leitor_id = p_leitor_id AND livro_id = p_livro_id AND status = 'PENDENTE_VALIDACAO';

    IF FOUND THEN
        RAISE EXCEPTION 'Já existe uma solicitação de pré-reserva pendente de validação para este livro.';
    END IF;

    -- 4. Inserir pré-reserva
    INSERT INTO public.pre_reserva (
        leitor_id,
        livro_id,
        status,
        operador_nome
    ) VALUES (
        p_leitor_id,
        p_livro_id,
        'PENDENTE_VALIDACAO',
        p_operador_nome
    ) RETURNING id INTO v_pre_reserva_id;

    -- 5. Auditoria
    PERFORM public.registrar_auditoria_transicao(
        'pre_reserva',
        v_pre_reserva_id::TEXT,
        NULL,
        'PENDENTE_VALIDACAO',
        NULL,
        p_operador_nome,
        'Criação de pré-reserva pelo leitor',
        jsonb_build_object('livro_id', p_livro_id, 'leitor_id', p_leitor_id, 'titulo', v_livro_titulo)
    );

    RETURN jsonb_build_object(
        'success', true,
        'id', v_pre_reserva_id,
        'status', 'PENDENTE_VALIDACAO',
        'mensagem', 'Pré-reserva criada com sucesso. Aguardando validação do operador.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_pre_reserva(INT, VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_pre_reserva(INT, VARCHAR, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION public.criar_pre_reserva(INT, VARCHAR, VARCHAR) TO anon;

-- ============================================================================
-- 4. Atualizar public.validar_pre_reserva com checagem tolerante e coerente
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validar_pre_reserva(
    p_pre_reserva_id INT,
    p_acao VARCHAR(20), -- 'APROVAR' ou 'REJEITAR'
    p_motivo_rejeicao TEXT DEFAULT NULL,
    p_operador_id VARCHAR(100) DEFAULT NULL,
    p_operador_nome VARCHAR(255) DEFAULT 'Operador'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_pr RECORD;
    v_leitor RECORD;
    v_livro RECORD;
    v_limite_emprestimos INT := 4;
    v_limite_reservas INT := 4;
    v_limite_fila INT := 2;
    v_prazo_dias_uteis INT := 4;
    v_prazo_emprestimo_dias INT := 15;
    v_emprestimos_ativos_count INT;
    v_reservas_ativas_count INT;
    v_total_fila INT;
    v_proxima_posicao INT;
    v_exemplar_disponivel RECORD;
    v_data_limite_retirada TIMESTAMPTZ;
    v_data_prevista_devolucao TIMESTAMPTZ;
    v_novo_emprestimo_id INT;
    v_nova_reserva_id INT;
    v_resultado_fluxo VARCHAR(50);
    v_mensagem_retorno TEXT;
    v_data_agendada DATE;
    v_menor_data_devolucao DATE;
BEGIN
    -- 1. Lock e leitura da pré-reserva
    SELECT * INTO v_pr
    FROM public.pre_reserva
    WHERE id = p_pre_reserva_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pré-reserva ID % não encontrada.', p_pre_reserva_id;
    END IF;

    IF v_pr.status <> 'PENDENTE_VALIDACAO' THEN
        RAISE EXCEPTION 'Esta pré-reserva já foi finalizada com status %.', v_pr.status;
    END IF;

    -- Buscar configurações da Seção 7
    SELECT COALESCE(NULLIF(valor, '')::INT, 4) INTO v_limite_emprestimos
    FROM public.configuracao WHERE chave = 'LIMITE_EMPRESTIMOS_LEITOR';
    IF v_limite_emprestimos IS NULL THEN v_limite_emprestimos := 4; END IF;

    SELECT COALESCE(NULLIF(valor, '')::INT, 4) INTO v_limite_reservas
    FROM public.configuracao WHERE chave = 'LIMITE_RESERVAS_LEITOR';
    IF v_limite_reservas IS NULL THEN v_limite_reservas := 4; END IF;

    SELECT COALESCE(NULLIF(valor, '')::INT, 2) INTO v_limite_fila
    FROM public.configuracao WHERE chave = 'LIMITE_FILA_RESERVAS';
    IF v_limite_fila IS NULL THEN v_limite_fila := 2; END IF;

    SELECT COALESCE(NULLIF(valor, '')::INT, 4) INTO v_prazo_dias_uteis
    FROM public.configuracao WHERE chave = 'PRAZO_RETIRADA_DIAS_UTEIS';
    IF v_prazo_dias_uteis IS NULL THEN v_prazo_dias_uteis := 4; END IF;

    SELECT COALESCE(NULLIF(valor, '')::INT, 15) INTO v_prazo_emprestimo_dias
    FROM public.configuracao WHERE chave = 'PRAZO_EMPRESTIMO_DIAS';
    IF v_prazo_emprestimo_dias IS NULL THEN v_prazo_emprestimo_dias := 15; END IF;

    -- Caso AÇÃO seja REJEITAR
    IF UPPER(p_acao) = 'REJEITAR' THEN
        UPDATE public.pre_reserva
        SET status = 'REJEITADO',
            motivo_rejeicao = COALESCE(p_motivo_rejeicao, 'Rejeitado pelo operador.'),
            operador_id = p_operador_id,
            operador_nome = p_operador_nome,
            data_validacao = NOW(),
            resultado_fluxo = 'REJEITADO'
        WHERE id = p_pre_reserva_id;

        PERFORM public.registrar_auditoria_transicao(
            'pre_reserva',
            p_pre_reserva_id::TEXT,
            'PENDENTE_VALIDACAO',
            'REJEITADO',
            p_operador_id,
            p_operador_nome,
            p_motivo_rejeicao,
            jsonb_build_object('livro_id', v_pr.livro_id, 'leitor_id', v_pr.leitor_id)
        );

        RETURN jsonb_build_object(
            'success', true,
            'status', 'REJEITADO',
            'mensagem', 'Pré-reserva rejeitada com sucesso.'
        );
    END IF;

    -- Caso AÇÃO seja APROVAR:
    -- 2. Lock do Leitor e Livro
    SELECT * INTO v_leitor
    FROM public.leitor
    WHERE id_leitor = v_pr.leitor_id
    FOR UPDATE;

    -- Validação tolerante e coerente de bloqueio
    IF COALESCE(v_leitor.bloqueado, false) = true
       OR (UPPER(TRIM(COALESCE(v_leitor.status, 'ATIVO'))) = 'BLOQUEADO' AND v_leitor.bloqueado IS DISTINCT FROM false) THEN
        RAISE EXCEPTION 'O leitor está BLOQUEADO e não pode ter solicitações aprovadas.';
    END IF;

    SELECT * INTO v_livro
    FROM public.titulo
    WHERE id_titulo = v_pr.livro_id
    FOR UPDATE;

    -- 3. Validação de Limites por Leitor (Seções 3.1, 3.2 e 6)
    SELECT COUNT(DISTINCT ex.id_titulo) INTO v_emprestimos_ativos_count
    FROM public.emprestimo emp
    JOIN public.exemplar ex ON ex.id_exemplar = emp.id_exemplar
    WHERE emp.id_leitor = v_pr.leitor_id
      AND emp.data_devolucao_real IS NULL
      AND (emp.status IS NULL OR UPPER(emp.status) IN ('ATIVO', 'PENDENTE_RETIRADA', 'AGENDADO'));

    IF v_emprestimos_ativos_count >= v_limite_emprestimos THEN
        RAISE EXCEPTION 'O leitor atingiu o limite de % empréstimos.', v_limite_emprestimos;
    END IF;

    -- Limite de reservas por leitor: no máximo 4 exemplares distintos reservados que não estejam em sua posse
    SELECT COUNT(DISTINCT r.id_titulo) INTO v_reservas_ativas_count
    FROM public.reserva r
    WHERE r.id_leitor = v_pr.leitor_id
      AND (r.status_reserva IN ('Ativa', 'Pronta para Retirada') OR r.status IN ('NA_FILA', 'NOTIFICADO', 'CONTEMPLADO'));

    IF v_reservas_ativas_count >= v_limite_reservas THEN
        RAISE EXCEPTION 'O leitor atingiu o limite de % reservas.', v_limite_reservas;
    END IF;

    -- 4. Verificar se há exemplar DISPONIVEL (com Lock Row-Level)
    SELECT * INTO v_exemplar_disponivel
    FROM public.exemplar
    WHERE id_titulo = v_pr.livro_id
      AND UPPER(status) IN ('DISPONIVEL', 'DISPONÍVEL')
    ORDER BY seq ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        -- FLUXO DE EMPRÉSTIMO COM DISPONIBILIDADE (Seção 4.2)
        -- Exemplar muda para BLOQUEADO; Empréstimo entra em PENDENTE_RETIRADA; inicia prazo de retirada (4 dias úteis)
        v_data_limite_retirada := public.calcular_prazo_dias_uteis(NOW(), v_prazo_dias_uteis);
        v_data_prevista_devolucao := NOW() + (v_prazo_emprestimo_dias || ' days')::INTERVAL;

        -- Atualizar exemplar para BLOQUEADO
        UPDATE public.exemplar
        SET status = 'BLOQUEADO'
        WHERE id_exemplar = v_exemplar_disponivel.id_exemplar;

        -- Inserir Empréstimo
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
            v_exemplar_disponivel.id_exemplar,
            v_pr.leitor_id,
            NOW(),
            v_data_prevista_devolucao,
            'PENDENTE_RETIRADA',
            v_data_limite_retirada,
            0,
            false,
            0
        ) RETURNING id_emprestimo INTO v_novo_emprestimo_id;

        v_resultado_fluxo := 'PENDENTE_RETIRADA';
        v_mensagem_retorno := 'Pré-reserva aprovada! Empréstimo criado em PENDENTE_RETIRADA com exemplar ' ||
                              v_exemplar_disponivel.id_exemplar || '. Prazo de 4 dias úteis para retirada.';

        -- Auditoria exemplar e empréstimo
        PERFORM public.registrar_auditoria_transicao(
            'exemplar',
            v_exemplar_disponivel.id_exemplar,
            'DISPONIVEL',
            'BLOQUEADO',
            p_operador_id,
            p_operador_nome,
            'Bloqueio pré-empréstimo por validação de pré-reserva',
            jsonb_build_object('emprestimo_id', v_novo_emprestimo_id)
        );

        PERFORM public.registrar_auditoria_transicao(
            'emprestimo',
            v_novo_emprestimo_id::TEXT,
            NULL,
            'PENDENTE_RETIRADA',
            p_operador_id,
            p_operador_nome,
            'Empréstimo iniciado aguardando retirada física',
            jsonb_build_object('data_limite_retirada', v_data_limite_retirada, 'exemplar_id', v_exemplar_disponivel.id_exemplar)
        );

    ELSE
        -- FLUXO DE RESERVA / INDISPONIBILIDADE (Seção 4.3)
        -- Verificar fila de reservas do livro com lock
        SELECT COUNT(*) INTO v_total_fila
        FROM public.reserva
        WHERE id_titulo = v_pr.livro_id
          AND (status_reserva IN ('Ativa', 'Pronta para Retirada') OR status IN ('NA_FILA', 'NOTIFICADO'));

        IF v_total_fila >= v_limite_fila THEN
            UPDATE public.pre_reserva
            SET status = 'REJEITADO',
                motivo_rejeicao = 'Não há disponibilidade para mais reservas.',
                operador_id = p_operador_id,
                operador_nome = p_operador_nome,
                data_validacao = NOW(),
                resultado_fluxo = 'FILA_CHEIA'
            WHERE id = p_pre_reserva_id;

            RAISE EXCEPTION 'Não há disponibilidade para mais reservas.';
        END IF;

        v_proxima_posicao := v_total_fila + 1;

        SELECT MIN(emp.data_prevista_devolucao::DATE + 1) INTO v_data_agendada
        FROM public.emprestimo emp
        JOIN public.exemplar ex ON ex.id_exemplar = emp.id_exemplar
        WHERE ex.id_titulo = v_pr.livro_id
          AND emp.data_devolucao_real IS NULL;

        -- Inserir Reserva na Fila
        INSERT INTO public.reserva (
            id_titulo,
            id_leitor,
            data_reserva,
            status_reserva,
            status,
            posicao_fila,
            ordem_fila
        ) VALUES (
            v_pr.livro_id,
            v_pr.leitor_id,
            NOW(),
            'Ativa',
            'NA_FILA',
            v_proxima_posicao,
            v_proxima_posicao
        ) RETURNING id_reserva INTO v_nova_reserva_id;

        v_resultado_fluxo := 'ENTROU_FILA';
        v_mensagem_retorno := 'Livro sem disponibilidade imediata. Pré-reserva aprovada e inserida na fila de reserva (' ||
                              v_proxima_posicao || 'º lugar). Empréstimo agendado para o dia seguinte à devolução.';

        -- Auditoria da reserva
        PERFORM public.registrar_auditoria_transicao(
            'reserva',
            v_nova_reserva_id::TEXT,
            NULL,
            'NA_FILA',
            p_operador_id,
            p_operador_nome,
            'Entrada na fila de reservas',
            jsonb_build_object('posicao_fila', v_proxima_posicao, 'livro_id', v_pr.livro_id, 'data_agendada', v_data_agendada)
        );

    END IF;

    -- Atualizar status da pré-reserva para APROVADO
    UPDATE public.pre_reserva
    SET status = 'APROVADO',
        operador_id = p_operador_id,
        operador_nome = p_operador_nome,
        data_validacao = NOW(),
        resultado_fluxo = v_resultado_fluxo
    WHERE id = p_pre_reserva_id;

    PERFORM public.registrar_auditoria_transicao(
        'pre_reserva',
        p_pre_reserva_id::TEXT,
        'PENDENTE_VALIDACAO',
        'APROVADO',
        p_operador_id,
        p_operador_nome,
        'Validação da pré-reserva concluída',
        jsonb_build_object('resultado_fluxo', v_resultado_fluxo, 'emprestimo_id', v_novo_emprestimo_id, 'reserva_id', v_nova_reserva_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'APROVADO',
        'resultado_fluxo', v_resultado_fluxo,
        'emprestimo_id', v_novo_emprestimo_id,
        'reserva_id', v_nova_reserva_id,
        'mensagem', v_mensagem_retorno
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_pre_reserva(INT, VARCHAR, TEXT, VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validar_pre_reserva(INT, VARCHAR, TEXT, VARCHAR, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION public.validar_pre_reserva(INT, VARCHAR, TEXT, VARCHAR, VARCHAR) TO anon;
