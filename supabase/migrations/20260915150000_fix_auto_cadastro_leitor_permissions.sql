-- Migration: fix_auto_cadastro_leitor_permissions_and_rls
-- Corrige "permission denied for table leitor" concedendo GRANTs adequados para anon e authenticated
-- e ajustando as policies de RLS para inserção e retorno de registros pendentes

-- 1. Garantir permissões de GRANT para as roles anon e authenticated
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Tabela leitor: INSERT para registrar cadastro pendente e SELECT para RETURNING / verificação de pendentes
GRANT INSERT, SELECT ON public.leitor TO anon, authenticated;

-- Sequence leitor_id_leitor_seq para auto-incremento de id_leitor
GRANT USAGE, SELECT ON SEQUENCE public.leitor_id_leitor_seq TO anon, authenticated;

-- Tabela leitor_curso: INSERT, SELECT (e DELETE se necessário para sincronização) para associações do leitor
GRANT INSERT, SELECT, DELETE ON public.leitor_curso TO anon, authenticated;

-- Tabela cursos: anon precisa conseguir ler os cursos disponíveis
GRANT SELECT ON public.cursos TO anon, authenticated;

-- 2. Atualizar policies de RLS na tabela leitor

-- Inserção por anon: apenas cadastros com status 'pendente', sem id_auth, sem bloqueio e sem acesso diretoria
DROP POLICY IF EXISTS "leitor_insert_anon_pending" ON public.leitor;
CREATE POLICY "leitor_insert_anon_pending" ON public.leitor
  FOR INSERT TO anon
  WITH CHECK (
    status_cadastro = 'pendente'
    AND id_auth IS NULL
    AND bloqueado = false
    AND acesso_diretoria = false
  );

-- Inserção por authenticated: próprio usuário, staff ou cadastro pendente
DROP POLICY IF EXISTS "leitor_insert_self_or_staff" ON public.leitor;
CREATE POLICY "leitor_insert_self_or_staff" ON public.leitor
  FOR INSERT TO authenticated
  WITH CHECK (
    (id_auth = auth.uid())
    OR public.app_is_staff()
    OR (status_cadastro = 'pendente' AND id_auth IS NULL)
  );

-- Leitura por anon: permitir SELECT apenas em cadastros pendentes (necessário para .insert().select() e validação sem expor leitores ativos)
DROP POLICY IF EXISTS "leitor_select_anon_pending" ON public.leitor;
CREATE POLICY "leitor_select_anon_pending" ON public.leitor
  FOR SELECT TO anon
  USING (
    status_cadastro = 'pendente'
  );

-- 3. Atualizar policies de RLS na tabela leitor_curso

-- Inserção por anon: permitir associar curso se o leitor for pendente
DROP POLICY IF EXISTS "leitor_curso_insert_anon" ON public.leitor_curso;
CREATE POLICY "leitor_curso_insert_anon" ON public.leitor_curso
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leitor l
      WHERE l.id_leitor = leitor_curso.id_leitor
        AND l.status_cadastro = 'pendente'
    )
  );

-- Deleção por anon: permitir remover associação de curso do leitor se o leitor for pendente (ex: re-submissão/ajuste)
DROP POLICY IF EXISTS "leitor_curso_delete_anon" ON public.leitor_curso;
CREATE POLICY "leitor_curso_delete_anon" ON public.leitor_curso
  FOR DELETE TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.leitor l
      WHERE l.id_leitor = leitor_curso.id_leitor
        AND l.status_cadastro = 'pendente'
    )
  );
