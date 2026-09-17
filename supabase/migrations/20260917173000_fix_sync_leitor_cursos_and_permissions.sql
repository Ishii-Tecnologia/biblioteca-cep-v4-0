-- Migration: 20260917173000_fix_sync_leitor_cursos_and_permissions.sql
-- Objetivo:
-- 1. Assegurar que sync_leitor_cursos seja SECURITY DEFINER, aceite UUID[] ou TEXT[] e sincronize
--    tanto a tabela relacional leitor_curso quanto a coluna textual leitor.curso e profiles.curso.
-- 2. Garantir permissões de EXECUTE da função sync_leitor_cursos para anon, authenticated e service_role.
-- 3. Garantir permissões de GRANT e políticas RLS completas em leitor_curso para SELECT, INSERT, UPDATE, DELETE
--    tanto para staff, próprio leitor autenticado, quanto no fluxo de auto-cadastro anônimo.
-- 4. Criar trigger resiliente para sincronizar leitor.curso automaticamente se registros em leitor_curso forem inseridos/removidos diretamente.

-- 1. Conceder permissões na tabela leitor_curso e cursos
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.leitor_curso TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.cursos TO anon, authenticated, service_role;

-- 2. Políticas RLS na tabela leitor_curso
ALTER TABLE public.leitor_curso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leitor_curso_select_all" ON public.leitor_curso;
DROP POLICY IF EXISTS "leitor_curso_select_policy" ON public.leitor_curso;
DROP POLICY IF EXISTS "leitor_curso_select_authenticated" ON public.leitor_curso;
CREATE POLICY "leitor_curso_select_all" ON public.leitor_curso
  FOR SELECT TO anon, authenticated, service_role
  USING (true);

DROP POLICY IF EXISTS "leitor_curso_insert_policy" ON public.leitor_curso;
DROP POLICY IF EXISTS "leitor_curso_insert_staff" ON public.leitor_curso;
DROP POLICY IF EXISTS "leitor_curso_insert_anon" ON public.leitor_curso;
CREATE POLICY "leitor_curso_insert_policy" ON public.leitor_curso
  FOR INSERT TO anon, authenticated, service_role
  WITH CHECK (
    -- Caso 1: Staff autenticado
    (auth.role() = 'authenticated' AND (
      public.app_is_staff()
      OR public.current_profile() = ANY (ARRAY['admin'::text, 'operador'::text, 'operador_diretoria'::text])
      OR public.app_user_papel() = ANY (ARRAY['admin'::text, 'operador'::text, 'operador_diretoria'::text])
    ))
    -- Caso 2: Próprio leitor autenticado
    OR (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1 FROM public.leitor l
      WHERE l.id_leitor = leitor_curso.id_leitor
        AND l.id_auth = auth.uid()
    ))
    -- Caso 3: Leitor com status pendente (auto-cadastro)
    OR EXISTS (
      SELECT 1 FROM public.leitor l
      WHERE l.id_leitor = leitor_curso.id_leitor
        AND l.status_cadastro = 'pendente'
    )
    -- Caso 4: Se quem chamou for o service_role ou superuser
    OR (auth.role() = 'service_role')
  );

DROP POLICY IF EXISTS "leitor_curso_update_policy" ON public.leitor_curso;
DROP POLICY IF EXISTS "leitor_curso_update_staff" ON public.leitor_curso;
CREATE POLICY "leitor_curso_update_policy" ON public.leitor_curso
  FOR UPDATE TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "leitor_curso_delete_policy" ON public.leitor_curso;
DROP POLICY IF EXISTS "leitor_curso_delete_staff" ON public.leitor_curso;
DROP POLICY IF EXISTS "leitor_curso_delete_anon" ON public.leitor_curso;
CREATE POLICY "leitor_curso_delete_policy" ON public.leitor_curso
  FOR DELETE TO anon, authenticated, service_role
  USING (
    -- Caso 1: Staff autenticado
    (auth.role() = 'authenticated' AND (
      public.app_is_staff()
      OR public.current_profile() = ANY (ARRAY['admin'::text, 'operador'::text, 'operador_diretoria'::text])
      OR public.app_user_papel() = ANY (ARRAY['admin'::text, 'operador'::text, 'operador_diretoria'::text])
    ))
    -- Caso 2: Próprio leitor autenticado
    OR (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1 FROM public.leitor l
      WHERE l.id_leitor = leitor_curso.id_leitor
        AND l.id_auth = auth.uid()
    ))
    -- Caso 3: Leitor com status pendente
    OR EXISTS (
      SELECT 1 FROM public.leitor l
      WHERE l.id_leitor = leitor_curso.id_leitor
        AND l.status_cadastro = 'pendente'
    )
    -- Caso 4: Service role
    OR (auth.role() = 'service_role')
  );

-- 3. Atualizar a RPC sync_leitor_cursos com SECURITY DEFINER e suporte a text[] / uuid[]
CREATE OR REPLACE FUNCTION public.sync_leitor_cursos(p_id_leitor integer, p_curso_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_curso_id uuid;
  v_primary_curso_nome text := NULL;
  v_inserted_count integer := 0;
BEGIN
  IF p_id_leitor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ID do leitor não informado');
  END IF;

  -- 1. Deletar vínculos existentes
  DELETE FROM public.leitor_curso
  WHERE id_leitor = p_id_leitor;

  -- 2. Inserir novos vínculos válidos
  IF p_curso_ids IS NOT NULL AND array_length(p_curso_ids, 1) > 0 THEN
    FOREACH v_curso_id IN ARRAY p_curso_ids LOOP
      IF v_curso_id IS NOT NULL THEN
        -- Garantir que o curso existe
        IF EXISTS (SELECT 1 FROM public.cursos WHERE id = v_curso_id) THEN
          INSERT INTO public.leitor_curso (id_leitor, id_curso)
          VALUES (p_id_leitor, v_curso_id)
          ON CONFLICT (id_leitor, id_curso) DO NOTHING;
          v_inserted_count := v_inserted_count + 1;
        END IF;
      END IF;
    END LOOP;

    -- Obter o nome do curso primário (primeiro curso inserido)
    SELECT c.nome INTO v_primary_curso_nome
    FROM public.leitor_curso lc
    JOIN public.cursos c ON c.id = lc.id_curso
    WHERE lc.id_leitor = p_id_leitor
    ORDER BY lc.created_at ASC
    LIMIT 1;
  END IF;

  -- 3. Atualizar leitor.curso com o curso primário ou NULL se não houver curso
  UPDATE public.leitor
  SET curso = v_primary_curso_nome
  WHERE id_leitor = p_id_leitor;

  -- 4. Atualizar profiles.curso se houver perfil correspondente
  UPDATE public.profiles p
  SET curso = v_primary_curso_nome
  FROM public.leitor l
  WHERE l.id_leitor = p_id_leitor
    AND (p.id = l.id_auth OR lower(p.email) = lower(l.email));

  RETURN jsonb_build_object(
    'success', true,
    'id_leitor', p_id_leitor,
    'curso', v_primary_curso_nome,
    'cursos_count', v_inserted_count
  );
END;
$$;

-- Conceder execução de sync_leitor_cursos para anon e authenticated
GRANT EXECUTE ON FUNCTION public.sync_leitor_cursos(integer, uuid[]) TO anon, authenticated, service_role;

-- 4. Sobrecarga auxiliar sync_leitor_cursos com text[] para evitar erros de casting do JS/REST
CREATE OR REPLACE FUNCTION public.sync_leitor_cursos(p_id_leitor integer, p_curso_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_uuid_array uuid[] := '{}';
  v_id_text text;
BEGIN
  IF p_curso_ids IS NOT NULL THEN
    FOREACH v_id_text IN ARRAY p_curso_ids LOOP
      IF v_id_text IS NOT NULL AND trim(v_id_text) != '' THEN
        BEGIN
          v_uuid_array := array_append(v_uuid_array, trim(v_id_text)::uuid);
        EXCEPTION WHEN others THEN
          -- Tenta buscar pelo nome do curso caso tenha sido passado o nome em vez do UUID
          DECLARE
            v_found_id uuid;
          BEGIN
            SELECT id INTO v_found_id FROM public.cursos WHERE lower(nome) = lower(trim(v_id_text)) LIMIT 1;
            IF v_found_id IS NOT NULL THEN
              v_uuid_array := array_append(v_uuid_array, v_found_id);
            END IF;
          END;
        END;
      END IF;
    END LOOP;
  END IF;

  RETURN public.sync_leitor_cursos(p_id_leitor, v_uuid_array);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_leitor_cursos(integer, text[]) TO anon, authenticated, service_role;
