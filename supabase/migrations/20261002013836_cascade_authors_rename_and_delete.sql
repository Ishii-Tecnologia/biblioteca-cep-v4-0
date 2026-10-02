-- Migration: 20261002013836_cascade_authors_rename_and_delete.sql
-- Description: Permite que a coluna autor de public.titulo aceite NULL e implementa funções com SECURITY DEFINER
--              para renomear autor em cascata nos livros e excluir autor desvinculando livros (set null).

-- 1. Permitir que public.titulo.autor seja nulo quando um autor for excluído
ALTER TABLE public.titulo ALTER COLUMN autor DROP NOT NULL;

-- 2. Função RPC para atualizar autor em cascata em public.titulo
CREATE OR REPLACE FUNCTION public.update_author_cascade(
  p_author_id UUID,
  p_new_name TEXT,
  p_new_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_author RECORD;
  v_target_name TEXT;
  v_target_type TEXT;
  v_count INTEGER := 0;
  v_titulo RECORD;
  v_new_esp TEXT;
  v_new_med TEXT;
  v_new_autor TEXT;
BEGIN
  -- Verificar permissão de staff
  IF NOT public.app_is_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permissão negada. Apenas administradores e operadores podem alterar autores.');
  END IF;

  v_target_name := TRIM(COALESCE(p_new_name, ''));
  IF v_target_name = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'O nome do autor não pode ficar vazio.');
  END IF;

  SELECT id, name, type INTO v_old_author
  FROM public.authors
  WHERE id = p_author_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Autor não encontrado.');
  END IF;

  v_target_type := COALESCE(p_new_type, v_old_author.type);

  -- Atualizar o registro do autor na tabela authors
  UPDATE public.authors
  SET name = v_target_name,
      type = v_target_type
  WHERE id = p_author_id;

  -- Percorrer os livros vinculados e atualizar de acordo com o papel do autor
  FOR v_titulo IN
    SELECT id_titulo, titulo_de_livro, autor, autor_espiritual, autor_mediunico, author_id
    FROM public.titulo
    WHERE author_id = p_author_id
       OR LOWER(TRIM(COALESCE(autor_espiritual, ''))) = LOWER(TRIM(v_old_author.name))
       OR LOWER(TRIM(COALESCE(autor_mediunico, ''))) = LOWER(TRIM(v_old_author.name))
       OR LOWER(TRIM(COALESCE(autor, ''))) = LOWER(TRIM(v_old_author.name))
       OR (v_old_author.type IN ('MEDIUM', 'ENCARNADO') AND autor ILIKE '%por ' || v_old_author.name || '%')
       OR (v_old_author.type = 'ESPIRITO' AND autor ILIKE v_old_author.name || ', por %')
  LOOP
    v_new_esp := v_titulo.autor_espiritual;
    v_new_med := v_titulo.autor_mediunico;
    v_new_autor := v_titulo.autor;

    -- Se o autor antigo era o autor_espiritual
    IF LOWER(TRIM(COALESCE(v_new_esp, ''))) = LOWER(TRIM(v_old_author.name)) THEN
      v_new_esp := v_target_name;
    END IF;

    -- Se o autor antigo era o autor_mediunico
    IF LOWER(TRIM(COALESCE(v_new_med, ''))) = LOWER(TRIM(v_old_author.name)) THEN
      v_new_med := v_target_name;
    END IF;

    -- Se existirem autor_espiritual ou autor_mediunico após a substituição
    IF (v_new_esp IS NOT NULL AND TRIM(v_new_esp) <> '') OR (v_new_med IS NOT NULL AND TRIM(v_new_med) <> '') THEN
      IF (v_new_esp IS NOT NULL AND TRIM(v_new_esp) <> '') AND (v_new_med IS NOT NULL AND TRIM(v_new_med) <> '') THEN
        IF v_new_esp ILIKE '%, por %' THEN
          v_new_autor := v_new_esp;
        ELSE
          v_new_autor := TRIM(v_new_esp) || ', por ' || TRIM(v_new_med);
        END IF;
      ELSIF (v_new_esp IS NOT NULL AND TRIM(v_new_esp) <> '') THEN
        v_new_autor := TRIM(v_new_esp);
      ELSE
        v_new_autor := TRIM(v_new_med);
      END IF;
    ELSE
      -- Livro convencional: se autor correspondia ao nome antigo, substitui
      IF LOWER(TRIM(COALESCE(v_new_autor, ''))) = LOWER(TRIM(v_old_author.name)) THEN
        v_new_autor := v_target_name;
      END IF;
    END IF;

    -- Realiza o UPDATE no título
    UPDATE public.titulo
    SET autor = v_new_autor,
        autor_espiritual = v_new_esp,
        autor_mediunico = v_new_med
    WHERE id_titulo = v_titulo.id_titulo;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'author_id', p_author_id,
    'new_name', v_target_name,
    'updated_books_count', v_count
  );
END;
$$;

-- 3. Função RPC para excluir autor desvinculando livros (deixando campo autor vazio/null)
CREATE OR REPLACE FUNCTION public.delete_author_cascade(
  p_author_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_author RECORD;
  v_count INTEGER := 0;
  v_titulo RECORD;
  v_new_esp TEXT;
  v_new_med TEXT;
  v_new_autor TEXT;
BEGIN
  -- Verificar permissão de staff
  IF NOT public.app_is_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permissão negada. Apenas administradores e operadores podem excluir autores.');
  END IF;

  SELECT id, name, type INTO v_old_author
  FROM public.authors
  WHERE id = p_author_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Autor não encontrado.');
  END IF;

  -- Percorrer todos os livros relacionados a esse autor
  FOR v_titulo IN
    SELECT id_titulo, titulo_de_livro, autor, autor_espiritual, autor_mediunico, author_id
    FROM public.titulo
    WHERE author_id = p_author_id
       OR LOWER(TRIM(COALESCE(autor_espiritual, ''))) = LOWER(TRIM(v_old_author.name))
       OR LOWER(TRIM(COALESCE(autor_mediunico, ''))) = LOWER(TRIM(v_old_author.name))
       OR LOWER(TRIM(COALESCE(autor, ''))) = LOWER(TRIM(v_old_author.name))
       OR (v_old_author.type IN ('MEDIUM', 'ENCARNADO') AND autor ILIKE '%por ' || v_old_author.name || '%')
       OR (v_old_author.type = 'ESPIRITO' AND autor ILIKE v_old_author.name || ', por %')
  LOOP
    v_new_esp := v_titulo.autor_espiritual;
    v_new_med := v_titulo.autor_mediunico;
    v_new_autor := v_titulo.autor;

    -- Se o autor a ser removido for o autor espiritual
    IF LOWER(TRIM(COALESCE(v_new_esp, ''))) = LOWER(TRIM(v_old_author.name)) THEN
      v_new_esp := NULL;
    END IF;

    -- Se o autor a ser removido for o médium
    IF LOWER(TRIM(COALESCE(v_new_med, ''))) = LOWER(TRIM(v_old_author.name)) THEN
      v_new_med := NULL;
    END IF;

    -- Recompor campo autor unificado
    IF (v_new_esp IS NOT NULL AND TRIM(v_new_esp) <> '') OR (v_new_med IS NOT NULL AND TRIM(v_new_med) <> '') THEN
      IF (v_new_esp IS NOT NULL AND TRIM(v_new_esp) <> '') AND (v_new_med IS NOT NULL AND TRIM(v_new_med) <> '') THEN
        IF v_new_esp ILIKE '%, por %' THEN
          v_new_autor := v_new_esp;
        ELSE
          v_new_autor := TRIM(v_new_esp) || ', por ' || TRIM(v_new_med);
        END IF;
      ELSIF (v_new_esp IS NOT NULL AND TRIM(v_new_esp) <> '') THEN
        v_new_autor := TRIM(v_new_esp);
      ELSE
        v_new_autor := TRIM(v_new_med);
      END IF;
    ELSE
      -- Nem espiritual nem médium restaram
      v_new_autor := NULL;
    END IF;

    -- Limpar também se autor convencional correspondia ao autor excluído
    IF LOWER(TRIM(COALESCE(v_new_autor, ''))) = LOWER(TRIM(v_old_author.name)) THEN
      v_new_autor := NULL;
    END IF;

    UPDATE public.titulo
    SET autor = v_new_autor,
        autor_espiritual = v_new_esp,
        autor_mediunico = v_new_med,
        author_id = CASE WHEN author_id = p_author_id THEN NULL ELSE author_id END
    WHERE id_titulo = v_titulo.id_titulo;

    v_count := v_count + 1;
  END LOOP;

  -- Agora excluir o autor da tabela authors
  DELETE FROM public.authors
  WHERE id = p_author_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_author_id', p_author_id,
    'deleted_author_name', v_old_author.name,
    'affected_books_count', v_count
  );
END;
$$;

-- 4. Conceder permissão de execução para roles autenticados e service_role
GRANT EXECUTE ON FUNCTION public.update_author_cascade(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_author_cascade(UUID) TO authenticated, service_role;
