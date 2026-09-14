-- Migration: 20260831180000_fix_authors_rls_and_grants.sql
-- Description: Concede permissões explicitas GRANT para anon e authenticated na tabela authors,
-- e adiciona parâmetros de rótulos de estrutura de autoria com valores padrão.

-- 1. Garantir que as roles da API PostgREST (anon, authenticated, service_role) tenham permissões DML
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.authors TO anon, authenticated, service_role;

-- 2. Garantir políticas RLS permissivas para autores
ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authors_select_all" ON public.authors;
CREATE POLICY "authors_select_all" ON public.authors
  FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "authors_insert_all" ON public.authors;
CREATE POLICY "authors_insert_all" ON public.authors
  FOR INSERT TO public
  WITH CHECK (true);

DROP POLICY IF EXISTS "authors_update_all" ON public.authors;
CREATE POLICY "authors_update_all" ON public.authors
  FOR UPDATE TO public
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "authors_delete_all" ON public.authors;
CREATE POLICY "authors_delete_all" ON public.authors
  FOR DELETE TO public
  USING (true);

-- 3. Inserir parâmetros de sistema para nomes das estruturas de autoria (se não existirem)
INSERT INTO public.parametros (chave, valor, descricao) VALUES
  ('label_estrutura_espirito_medium', 'Espírito + Médium', 'Rótulo da estrutura de autoria para obras psicografadas / mediúnicas.'),
  ('label_estrutura_convencional', 'Autor Convencional', 'Rótulo da estrutura de autoria para autores comuns / encarnados.')
ON CONFLICT (chave) DO NOTHING;
