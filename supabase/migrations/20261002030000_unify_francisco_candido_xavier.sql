-- Migration: 20261002030000_unify_francisco_candido_xavier.sql
-- Description: Unificar o autor duplicado "Francisco Candido Xavier" / "Francisco Cândido Xavier"
--              na tabela public.authors, mantendo a grafia COM ACENTO (id: 9c4d76de-dfc1-427a-b128-fdd854885598),
--              atualizando autor_mediunico e o campo composto autor em public.titulo,
--              re-apontando author_id caso exista referência e excluindo o autor duplicado sem acento.

DO $$
DECLARE
  v_kept_author_id UUID := '9c4d76de-dfc1-427a-b128-fdd854885598'::uuid;
  v_dup_author_id UUID := '5476ea53-b465-4879-bd5e-21c434999c06'::uuid;
BEGIN
  -- 1. Em public.titulo, redefinir author_id que aponte para o autor a ser excluído para o mantido
  UPDATE public.titulo
  SET author_id = v_kept_author_id
  WHERE author_id = v_dup_author_id;

  -- 2. Em public.titulo, atualizar autor_mediunico quando normalizado for 'francisco candido xavier'
  --    mas não estiver exatamente com acento 'Francisco Cândido Xavier'
  UPDATE public.titulo
  SET autor_mediunico = 'Francisco Cândido Xavier'
  WHERE (public.normalize_author_name(autor_mediunico) = 'francisco candido xavier'
         OR autor_mediunico ILIKE '%francisco candido xavier%')
    AND autor_mediunico <> 'Francisco Cândido Xavier';

  -- 3. Em public.titulo, corrigir ocorrências de "Francisco Candido Xavier" no campo composto autor
  UPDATE public.titulo
  SET autor = replace(autor, 'Francisco Candido Xavier', 'Francisco Cândido Xavier')
  WHERE autor LIKE '%Francisco Candido Xavier%';

  -- 4. Excluir o autor duplicado sem acento da tabela public.authors
  DELETE FROM public.authors
  WHERE id = v_dup_author_id;

  -- 5. Por garantia de consistência, caso haja outro autor com nome normalizado igual que não seja o mantido
  DELETE FROM public.authors
  WHERE id <> v_kept_author_id
    AND public.normalize_author_name(name) = 'francisco candido xavier';
END $$;
