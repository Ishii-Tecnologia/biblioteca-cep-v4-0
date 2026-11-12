-- Corrige as referências de tabelas inexistentes nas funções de empréstimo.
--
-- Problema: public.emprestar_exemplar e public.renovar_emprestimo consultavam
-- public.parametro_sistema (nome_parametro/valor_parametro) e gravavam em
-- public.historico_movimentacao — tabelas que NÃO existem no schema atual.
-- As tabelas reais são public.parametros (chave/valor) e public.historico.
-- Toda chamada a essas RPCs falhava em runtime (relation does not exist),
-- bloqueando o registro e a renovação de empréstimos.
--
-- Correção: apenas nomes de tabela/colunas — a lógica, validações, ordem das
-- etapas e retornos permanecem idênticos.
-- Mapeamento do registro de auditoria em public.historico:
--   tipo_operacao  -> tipo
--   detalhes       -> descricao
--   (constante)    -> entidade_tipo = 'exemplar'
--   id_exemplar    -> entidade_id
--   id_leitor      -> id_leitor
--   usuario_sistema-> observacao ('Operador: <nome>')
--   data_hora      -> created_at (default now(), omitido)

CREATE OR REPLACE FUNCTION public.emprestar_exemplar(p_id_exemplar character varying, p_id_leitor integer, p_usuario_sistema character varying DEFAULT 'Sistema'::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_status VARCHAR(20);
    v_id_titulo VARCHAR(10);
    v_colecao TEXT;
    v_bloqueado BOOLEAN;
    v_acesso_diretoria BOOLEAN;
    v_prazo_dias INT := 15;
    v_prazo_str VARCHAR(255);
    v_data_prevista TIMESTAMPTZ;
    v_id_emprestimo INT;
    v_pendencias_count INT;
    v_reserva_ativa_id INT;
    v_reserva_leitor_id INT;
BEGIN
    -- 1. Validar exemplar
    SELECT e.status, e.id_titulo, COALESCE(t.colecao, 'geral')
    INTO v_status, v_id_titulo, v_colecao
    FROM public.exemplar e
    JOIN public.titulo t ON t.id_titulo = e.id_titulo
    WHERE e.id_exemplar = p_id_exemplar;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Exemplar não encontrado.');
    END IF;

    -- Se for do acervo da diretoria, verificar permissão do operador do sistema
    IF v_colecao = 'diretoria' AND NOT public.app_can_access_diretoria() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Permissão negada para movimentar obras do Acervo Diretoria.');
    END IF;

    -- 2. Validar leitor
    SELECT bloqueado
    INTO v_bloqueado
    FROM public.leitor
    WHERE id_leitor = p_id_leitor;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Leitor não encontrado.');
    END IF;

    IF v_bloqueado THEN
        RETURN jsonb_build_object('success', false, 'message', 'Leitor bloqueado administrativamente para novos empréstimos.');
    END IF;

    -- Regra de bloqueio da diretoria para o leitor:
    IF v_colecao = 'diretoria' THEN
        v_acesso_diretoria := public.leitor_tem_acesso_diretoria(p_id_leitor);
        IF NOT v_acesso_diretoria THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'O leitor selecionado não possui permissão para retirar livros da Diretoria.'
            );
        END IF;
    END IF;

    -- Se estiver reservado, verificar se é para este leitor
    IF v_status = 'Reservado' THEN
        SELECT id_reserva, id_leitor INTO v_reserva_ativa_id, v_reserva_leitor_id
        FROM public.reserva
        WHERE id_titulo = v_id_titulo AND status_reserva = 'Ativa'
        ORDER BY data_reserva ASC
        LIMIT 1;

        IF v_reserva_leitor_id IS DISTINCT FROM p_id_leitor THEN
            RETURN jsonb_build_object('success', false, 'message', 'Este exemplar está reservado para outro leitor da fila.');
        END IF;
    ELSIF v_status != 'Disponivel' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Exemplar com status "' || v_status || '", indisponível para empréstimo.');
    END IF;

    -- Verificar se há atrasos não devolvidos
    SELECT COUNT(*) INTO v_pendencias_count
    FROM public.emprestimo
    WHERE id_leitor = p_id_leitor
      AND data_devolucao_real IS NULL
      AND (atraso = true OR data_prevista_devolucao < now());

    IF v_pendencias_count > 0 THEN
        UPDATE public.leitor SET bloqueado = true WHERE id_leitor = p_id_leitor;
        RETURN jsonb_build_object('success', false, 'message', 'Leitor possui empréstimos em atraso pendentes.');
    END IF;

    -- 3. Obter prazo do sistema
    SELECT valor INTO v_prazo_str
    FROM public.parametros
    WHERE chave = 'prazo_devolucao_dias';

    IF v_prazo_str IS NOT NULL AND v_prazo_str ~ '^[0-9]+$' THEN
        v_prazo_dias := v_prazo_str::INT;
    END IF;

    v_data_prevista := now() + (v_prazo_dias || ' days')::INTERVAL;

    -- 4. Criar registro de empréstimo
    INSERT INTO public.emprestimo (
        id_exemplar,
        id_leitor,
        data_emprestimo,
        data_prevista_devolucao,
        atraso,
        dias_atraso,
        numero_renovacoes
    ) VALUES (
        p_id_exemplar,
        p_id_leitor,
        now(),
        v_data_prevista,
        false,
        0,
        0
    ) RETURNING id_emprestimo INTO v_id_emprestimo;

    -- 5. Atualizar status do exemplar
    UPDATE public.exemplar
    SET status = 'Emprestado'
    WHERE id_exemplar = p_id_exemplar;

    -- 6. Se havia reserva para esse leitor, marcar como Atendida
    IF v_reserva_ativa_id IS NOT NULL THEN
        UPDATE public.reserva
        SET status_reserva = 'Atendida', data_atendimento = now()
        WHERE id_reserva = v_reserva_ativa_id;
    END IF;

    -- 7. Registrar histórico de auditoria
    INSERT INTO public.historico (
        tipo,
        descricao,
        entidade_tipo,
        entidade_id,
        id_leitor,
        observacao
    ) VALUES (
        'Retirada',
        'Empréstimo ID #' || v_id_emprestimo || ' com prazo até ' || to_char(v_data_prevista, 'DD/MM/YYYY'),
        'exemplar',
        p_id_exemplar,
        p_id_leitor,
        'Operador: ' || p_usuario_sistema
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Empréstimo realizado com sucesso!',
        'id_emprestimo', v_id_emprestimo,
        'data_prevista_devolucao', v_data_prevista
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.renovar_emprestimo(p_id_emprestimo integer, p_usuario_sistema character varying DEFAULT 'Sistema'::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_id_exemplar VARCHAR(15);
    v_id_leitor INT;
    v_id_titulo VARCHAR(10);
    v_data_prevista TIMESTAMPTZ;
    v_data_devolucao_real TIMESTAMPTZ;
    v_num_renovacoes INT;
    v_max_renovacoes INT := 1;
    v_max_str VARCHAR(255);
    v_prazo_dias INT := 15;
    v_prazo_str VARCHAR(255);
    v_reservas_count INT;
    v_bloqueado BOOLEAN;
    v_nova_data_prevista TIMESTAMPTZ;
BEGIN
    -- 1. Localizar empréstimo
    SELECT e.id_exemplar, e.id_leitor, e.data_prevista_devolucao, e.data_devolucao_real, e.numero_renovacoes, ex.id_titulo
    INTO v_id_exemplar, v_id_leitor, v_data_prevista, v_data_devolucao_real, v_num_renovacoes, v_id_titulo
    FROM public.emprestimo e
    JOIN public.exemplar ex ON ex.id_exemplar = e.id_exemplar
    WHERE e.id_emprestimo = p_id_emprestimo;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Empréstimo não encontrado.');
    END IF;

    IF v_data_devolucao_real IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este empréstimo já foi encerrado.');
    END IF;

    -- Validar bloqueio do leitor ou atraso
    SELECT bloqueado INTO v_bloqueado FROM public.leitor WHERE id_leitor = v_id_leitor;
    IF v_bloqueado OR now() > v_data_prevista THEN
        RETURN jsonb_build_object('success', false, 'message', 'Renovação bloqueada: o leitor está com atraso ou bloqueado.');
    END IF;

    -- 2. Validar limite de renovações
    SELECT valor INTO v_max_str
    FROM public.parametros
    WHERE chave = 'max_renovacoes';
    IF v_max_str IS NOT NULL AND v_max_str ~ '^[0-9]+$' THEN
        v_max_renovacoes := v_max_str::INT;
    END IF;

    IF v_num_renovacoes >= v_max_renovacoes THEN
        RETURN jsonb_build_object('success', false, 'message', 'Limite máximo de ' || v_max_renovacoes || ' renovação(ões) já foi atingido.');
    END IF;

    -- 3. Validar se há reserva ativa para o título
    SELECT COUNT(*) INTO v_reservas_count
    FROM public.reserva
    WHERE id_titulo = v_id_titulo AND status_reserva = 'Ativa';

    IF v_reservas_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Renovação bloqueada: há leitores na fila de reserva deste título.');
    END IF;

    -- 4. Obter prazo
    SELECT valor INTO v_prazo_str
    FROM public.parametros
    WHERE chave = 'prazo_devolucao_dias';
    IF v_prazo_str IS NOT NULL AND v_prazo_str ~ '^[0-9]+$' THEN
        v_prazo_dias := v_prazo_str::INT;
    END IF;

    v_nova_data_prevista := v_data_prevista + (v_prazo_dias || ' days')::INTERVAL;

    -- 5. Atualizar empréstimo
    UPDATE public.emprestimo
    SET data_prevista_devolucao = v_nova_data_prevista,
        numero_renovacoes = numero_renovacoes + 1
    WHERE id_emprestimo = p_id_emprestimo;

    -- 6. Registrar histórico
    INSERT INTO public.historico (
        tipo,
        descricao,
        entidade_tipo,
        entidade_id,
        id_leitor,
        observacao
    ) VALUES (
        'Renovacao',
        'Renovação #' || (v_num_renovacoes + 1) || ' concedida até ' || to_char(v_nova_data_prevista, 'DD/MM/YYYY'),
        'exemplar',
        v_id_exemplar,
        v_id_leitor,
        'Operador: ' || p_usuario_sistema
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Empréstimo renovado com sucesso!',
        'nova_data_prevista', v_nova_data_prevista,
        'numero_renovacoes', v_num_renovacoes + 1
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.emprestar_exemplar(character varying, integer, character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.renovar_emprestimo(integer, character varying) TO authenticated;
