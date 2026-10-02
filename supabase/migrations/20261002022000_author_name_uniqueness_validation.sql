-- Migration: 20261002022000_author_name_uniqueness_validation.sql
-- Description: Validação de unicidade de nomes de autores (independente de tipo, insensível a maiúsculas e acentos)
--              Atualiza a RPC update_author_cascade e cria função RPC create_author_safe
--              NÃO descarta nem altera registros existentes para não quebrar a base atual.

-- 1. Função auxiliar para normalizar texto (minúsculas, trim e remoção de acentos/diacríticos comuns em português)
CREATE OR REPLACE FUNCTION public.normalize_author_name(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT translate(
    lower(trim(COALESCE(p_text, ''))),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'
  );
$$;

-- 2. Atualizar update_author_cascade para checar unicidade de nome independente de tipo (exceto o próprio autor)
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
  v_norm_target TEXT;
  v_conflict RECORD;
  v_conflict_type_label TEXT;
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
  v_norm_target := public.normalize_author_name(v_target_name);

  -- Verificar se já existe outro autor com o mesmo nome normalizado, independente do tipo
  SELECT id, name, type INTO v_conflict
  FROM public.authors
  WHERE id <> p_author_id
    AND public.normalize_author_name(name) = v_norm_target
  LIMIT 1;

  IF FOUND THEN
    v_conflict_type_label := CASE v_conflict.type
      WHEN 'ESPIRITO' THEN 'Espírito'
      WHEN 'MEDIUM' THEN 'Médium'
      ELSE 'Autor Convencional'
    END;

    RETURN jsonb_build_object(
      'success', false,
      'code', 'DUPLICATE_NAME',
      'error', format('"%s" já está cadastrado como %s.', v_conflict.name, v_conflict_type_label),
      'conflict_name', v_conflict.name,
      'conflict_type', v_conflict.type
    );
  END IF;

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

-- 3. Função RPC segura para criar novo autor garantindo unicidade de nome
CREATE OR REPLACE FUNCTION public.create_author_safe(
  p_name TEXT,
  p_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clean_name TEXT;
  v_norm_name TEXT;
  v_conflict RECORD;
  v_conflict_type_label TEXT;
  v_new_author RECORD;
BEGIN
  -- Verificar permissão de staff
  IF NOT public.app_is_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permissão negada. Apenas administradores e operadores podem cadastrar autores.');
  END IF;

  v_clean_name := TRIM(COALESCE(p_name, ''));
  IF v_clean_name = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'O nome do autor é obrigatório.');
  END IF;

  IF p_type NOT IN ('ESPIRITO', 'ENCARNADO', 'MEDIUM', 'OUTRO') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo de autor inválido.');
  END IF;

  v_norm_name := public.normalize_author_name(v_clean_name);

  -- Verificar se já existe autor com mesmo nome normalizado em QUALQUER tipo
  SELECT id, name, type INTO v_conflict
  FROM public.authors
  WHERE public.normalize_author_name(name) = v_norm_name
  LIMIT 1;

  IF FOUND THEN
    v_conflict_type_label := CASE v_conflict.type
      WHEN 'ESPIRITO' THEN 'Espírito'
      WHEN 'MEDIUM' THEN 'Médium'
      ELSE 'Autor Convencional'
    END;

    RETURN jsonb_build_object(
      'success', false,
      'code', 'DUPLICATE_NAME',
      'error', format('"%s" já está cadastrado como %s.', v_conflict.name, v_conflict_type_label),
      'conflict_name', v_conflict.name,
      'conflict_type', v_conflict.type
    );
  END IF;

  -- Inserir novo autor
  INSERT INTO public.authors (name, type)
  VALUES (v_clean_name, p_type)
  RETURNING id, name, type, created_at INTO v_new_author;

  RETURN jsonb_build_object(
    'success', true,
    'author', jsonb_build_object(
      'id', v_new_author.id,
      'name', v_new_author.name,
      'type', v_new_author.type,
      'created_at', v_new_author.created_at
    )
  );
END;
$$;

-- 4. Permissões de execução
GRANT EXECUTE ON FUNCTION public.normalize_author_name(TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.update_author_cascade(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_author_safe(TEXT, TEXT) TO authenticated, service_role;
