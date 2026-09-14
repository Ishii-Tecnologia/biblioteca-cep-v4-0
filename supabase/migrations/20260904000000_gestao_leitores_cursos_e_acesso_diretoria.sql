-- Migration: 20260904000000_gestao_leitores_cursos_e_acesso_diretoria.sql
-- Adiciona suporte a cursos da CEP, múltiplos cursos por leitor,
-- flag acesso_diretoria e validação bloqueante no banco para empréstimos e reservas.

-- 1. Tabela de cursos
CREATE TABLE IF NOT EXISTS public.cursos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL UNIQUE,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS em cursos
ALTER TABLE public.cursos ENABLE ROW LEVEL SECURITY;

-- Políticas de cursos:
-- SELECT para autenticados
CREATE POLICY "cursos_select_authenticated"
    ON public.cursos
    FOR SELECT
    TO authenticated
    USING (true);

-- INSERT/UPDATE/DELETE restritos a admin
CREATE POLICY "cursos_insert_admin"
    ON public.cursos
    FOR INSERT
    TO authenticated
    WITH CHECK (public.current_profile() = 'admin' OR public.app_user_papel() = 'admin');

CREATE POLICY "cursos_update_admin"
    ON public.cursos
    FOR UPDATE
    TO authenticated
    USING (public.current_profile() = 'admin' OR public.app_user_papel() = 'admin')
    WITH CHECK (public.current_profile() = 'admin' OR public.app_user_papel() = 'admin');

CREATE POLICY "cursos_delete_admin"
    ON public.cursos
    FOR DELETE
    TO authenticated
    USING (public.current_profile() = 'admin' OR public.app_user_papel() = 'admin');

-- 2. Adicionar coluna curso_principal e acesso_diretoria na tabela leitor e profiles
ALTER TABLE public.leitor
    ADD COLUMN IF NOT EXISTS curso VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS acesso_diretoria BOOLEAN NOT NULL DEFAULT false;

-- Fallback FK curso em leitor referenciando cursos(nome) ON UPDATE CASCADE ON DELETE SET NULL
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'leitor_curso_fkey'
    ) THEN
        ALTER TABLE public.leitor
            ADD CONSTRAINT leitor_curso_fkey
            FOREIGN KEY (curso) REFERENCES public.cursos(nome)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS curso VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS acesso_diretoria BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'profiles_curso_fkey'
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_curso_fkey
            FOREIGN KEY (curso) REFERENCES public.cursos(nome)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Tabela associativa leitor_curso (múltiplos cursos por leitor)
CREATE TABLE IF NOT EXISTS public.leitor_curso (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_leitor INTEGER NOT NULL REFERENCES public.leitor(id_leitor) ON DELETE CASCADE,
    id_curso UUID NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_leitor_curso UNIQUE (id_leitor, id_curso)
);

ALTER TABLE public.leitor_curso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leitor_curso_select_authenticated"
    ON public.leitor_curso
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "leitor_curso_insert_staff"
    ON public.leitor_curso
    FOR INSERT
    TO authenticated
    WITH CHECK (public.app_is_staff() OR public.current_profile() = 'admin');

CREATE POLICY "leitor_curso_update_staff"
    ON public.leitor_curso
    FOR UPDATE
    TO authenticated
    USING (public.app_is_staff() OR public.current_profile() = 'admin')
    WITH CHECK (public.app_is_staff() OR public.current_profile() = 'admin');

CREATE POLICY "leitor_curso_delete_staff"
    ON public.leitor_curso
    FOR DELETE
    TO authenticated
    USING (public.app_is_staff() OR public.current_profile() = 'admin');

CREATE INDEX IF NOT EXISTS idx_leitor_curso_leitor ON public.leitor_curso(id_leitor);
CREATE INDEX IF NOT EXISTS idx_leitor_curso_curso ON public.leitor_curso(id_curso);

-- 4. Função auxiliar: verificar se leitor tem permissão para acervo diretoria
CREATE OR REPLACE FUNCTION public.leitor_tem_acesso_diretoria(p_id_leitor integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_acesso boolean;
    v_id_auth uuid;
    v_papel text;
BEGIN
    SELECT acesso_diretoria, id_auth INTO v_acesso, v_id_auth
    FROM public.leitor
    WHERE id_leitor = p_id_leitor;

    IF v_acesso IS TRUE THEN
        RETURN true;
    END IF;

    -- Se o leitor estiver vinculado a um auth user com papel admin ou operador_diretoria, tem permissão
    IF v_id_auth IS NOT NULL THEN
        SELECT papel INTO v_papel
        FROM public.profiles
        WHERE id = v_id_auth;

        IF v_papel IN ('admin', 'operador_diretoria') THEN
            RETURN true;
        END IF;
    END IF;

    RETURN false;
END;
$$;

-- 5. Atualizar função RPC emprestar_exemplar para validar colecao='diretoria' e acesso_diretoria
CREATE OR REPLACE FUNCTION public.emprestar_exemplar(
    p_id_exemplar character varying,
    p_id_leitor integer,
    p_usuario_sistema character varying DEFAULT 'Sistema'::character varying
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
    SELECT valor_parametro INTO v_prazo_str
    FROM public.parametro_sistema
    WHERE nome_parametro = 'prazo_devolucao_dias';

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
    INSERT INTO public.historico_movimentacao (
        id_exemplar,
        id_leitor,
        tipo_operacao,
        data_hora,
        usuario_sistema,
        detalhes
    ) VALUES (
        p_id_exemplar,
        p_id_leitor,
        'Retirada',
        now(),
        p_usuario_sistema,
        'Empréstimo ID #' || v_id_emprestimo || ' com prazo até ' || to_char(v_data_prevista, 'DD/MM/YYYY')
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Empréstimo realizado com sucesso!',
        'id_emprestimo', v_id_emprestimo,
        'data_prevista_devolucao', v_data_prevista
    );
END;
$$;

-- 6. Trigger de validação bloqueante no banco para empréstimo e reserva
CREATE OR REPLACE FUNCTION public.check_diretoria_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_colecao TEXT;
    v_allowed BOOLEAN;
BEGIN
    -- Se for tabela emprestimo
    IF TG_TABLE_NAME = 'emprestimo' THEN
        SELECT COALESCE(t.colecao, 'geral') INTO v_colecao
        FROM public.exemplar e
        JOIN public.titulo t ON t.id_titulo = e.id_titulo
        WHERE e.id_exemplar = NEW.id_exemplar;

        IF v_colecao = 'diretoria' THEN
            v_allowed := public.leitor_tem_acesso_diretoria(NEW.id_leitor);
            IF NOT v_allowed THEN
                RAISE EXCEPTION 'O leitor selecionado não possui permissão para retirar livros da Diretoria.';
            END IF;
        END IF;

    -- Se for tabela reserva
    ELSIF TG_TABLE_NAME = 'reserva' THEN
        SELECT COALESCE(colecao, 'geral') INTO v_colecao
        FROM public.titulo
        WHERE id_titulo = NEW.id_titulo;

        IF v_colecao = 'diretoria' THEN
            v_allowed := public.leitor_tem_acesso_diretoria(NEW.id_leitor);
            IF NOT v_allowed THEN
                RAISE EXCEPTION 'O leitor selecionado não possui permissão para reservar livros da Diretoria.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_valida_diretoria_emprestimo ON public.emprestimo;
CREATE TRIGGER trg_valida_diretoria_emprestimo
    BEFORE INSERT ON public.emprestimo
    FOR EACH ROW
    EXECUTE FUNCTION public.check_diretoria_permission();

DROP TRIGGER IF EXISTS trg_valida_diretoria_reserva ON public.reserva;
CREATE TRIGGER trg_valida_diretoria_reserva
    BEFORE INSERT ON public.reserva
    FOR EACH ROW
    EXECUTE FUNCTION public.check_diretoria_permission();
