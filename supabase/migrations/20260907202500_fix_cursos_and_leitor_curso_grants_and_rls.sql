-- Migration: 20260907202500_fix_cursos_and_leitor_curso_grants_and_rls.sql
-- Objetivo: Conceder permissões GRANT de DML (SELECT, INSERT, UPDATE, DELETE) para authenticated
-- e SELECT para anon nas tabelas public.cursos e public.leitor_curso,
-- além de alinhar as políticas RLS para permitir gestão por staff (admin e operadores)
-- conforme o padrão das demais tabelas de catálogo/apoio (categorias, authors, titulo).

-- 1. Conceder permissões de acesso ao Postgres (GRANT)
GRANT SELECT ON public.cursos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cursos TO authenticated;
GRANT ALL PRIVILEGES ON public.cursos TO service_role;

GRANT SELECT ON public.leitor_curso TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leitor_curso TO authenticated;
GRANT ALL PRIVILEGES ON public.leitor_curso TO service_role;

-- 2. Alinhar RLS para public.cursos
-- Garantir que RLS está ativo
ALTER TABLE public.cursos ENABLE ROW LEVEL SECURITY;

-- SELECT público/autenticado (catálogo aberto para leitura como categorias/titulo)
DROP POLICY IF EXISTS "cursos_select_authenticated" ON public.cursos;
DROP POLICY IF EXISTS "cursos_select_publico" ON public.cursos;
CREATE POLICY "cursos_select_publico"
    ON public.cursos
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- INSERT: admin ou operador (staff)
DROP POLICY IF EXISTS "cursos_insert_admin" ON public.cursos;
DROP POLICY IF EXISTS "cursos_insert_staff" ON public.cursos;
CREATE POLICY "cursos_insert_staff"
    ON public.cursos
    FOR INSERT
    TO authenticated
    WITH CHECK (public.app_is_staff() OR public.current_profile() = 'admin' OR public.app_user_papel() = 'admin');

-- UPDATE: admin ou operador (staff)
DROP POLICY IF EXISTS "cursos_update_admin" ON public.cursos;
DROP POLICY IF EXISTS "cursos_update_staff" ON public.cursos;
CREATE POLICY "cursos_update_staff"
    ON public.cursos
    FOR UPDATE
    TO authenticated
    USING (public.app_is_staff() OR public.current_profile() = 'admin' OR public.app_user_papel() = 'admin')
    WITH CHECK (public.app_is_staff() OR public.current_profile() = 'admin' OR public.app_user_papel() = 'admin');

-- DELETE: admin ou operador (staff)
DROP POLICY IF EXISTS "cursos_delete_admin" ON public.cursos;
DROP POLICY IF EXISTS "cursos_delete_staff" ON public.cursos;
CREATE POLICY "cursos_delete_staff"
    ON public.cursos
    FOR DELETE
    TO authenticated
    USING (public.app_is_staff() OR public.current_profile() = 'admin' OR public.app_user_papel() = 'admin');

-- 3. Alinhar RLS para public.leitor_curso
ALTER TABLE public.leitor_curso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leitor_curso_select_authenticated" ON public.leitor_curso;
DROP POLICY IF EXISTS "leitor_curso_select_all" ON public.leitor_curso;
CREATE POLICY "leitor_curso_select_all"
    ON public.leitor_curso
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "leitor_curso_insert_staff" ON public.leitor_curso;
CREATE POLICY "leitor_curso_insert_staff"
    ON public.leitor_curso
    FOR INSERT
    TO authenticated
    WITH CHECK (public.app_is_staff() OR public.current_profile() = 'admin' OR public.app_user_papel() = 'admin');

DROP POLICY IF EXISTS "leitor_curso_update_staff" ON public.leitor_curso;
CREATE POLICY "leitor_curso_update_staff"
    ON public.leitor_curso
    FOR UPDATE
    TO authenticated
    USING (public.app_is_staff() OR public.current_profile() = 'admin' OR public.app_user_papel() = 'admin')
    WITH CHECK (public.app_is_staff() OR public.current_profile() = 'admin' OR public.app_user_papel() = 'admin');

DROP POLICY IF EXISTS "leitor_curso_delete_staff" ON public.leitor_curso;
CREATE POLICY "leitor_curso_delete_staff"
    ON public.leitor_curso
    FOR DELETE
    TO authenticated
    USING (public.app_is_staff() OR public.current_profile() = 'admin' OR public.app_user_papel() = 'admin');
