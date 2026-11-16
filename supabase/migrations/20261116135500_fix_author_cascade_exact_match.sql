-- ============================================================
-- Correção da correspondência de autores nas RPCs de cascade
-- Bug: "Diversos Espírito" (singular) era contado em 41 livros
--      que pertencem a "Diversos Espíritos" (plural), porque
--      cláusulas ILIKE casavam o nome como substring/prefixo
--      parcial do campo "autor".
-- Correção: correspondência EXATA por nome normalizado
--      (lower, sem acentos, trim) via public.normalize_author_name,
--      mantendo apenas o padrão estrutural de espírito psicografado
--      "Nome do Espírito, por " como PREFIXO exato (não substring).
-- Nenhum registro é alterado — apenas a definição das funções.
-- ============================================================

-- ------------------------------------------------------------
-- 1) delete_author_cascade — matching exato
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_author_cascade(p_author_id uuid)
RETURNS jsonb
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

  -- Percorrer APENAS os livros vinculados de forma EXATA a esse autor:
  -- vínculo estrutural por id, igualdade do nome normalizado em
  -- autor_espiritual / autor_mediunico / autor, ou o padrão composto
  -- "Nome do Espírito, por ..." (prefixo exato, nunca substring genérica).
  FOR v_titulo IN
    SELECT id_titulo, titulo_de_livro, autor, autor_espiritual, autor_mediunico, author_id
    FROM public.titulo
    WHERE author_id = p_author_id
       OR public.normalize_author_name(COALESCE(autor_espiritual, '')) = public.normalize_author_name(v_old_author.name)
       OR public.normalize_author_name(COALESCE(autor_mediunico, '')) = public.normalize_author_name(v_old_author.name)
       OR public.normalize_author_name(COALESCE(autor, '')) = public.normalize_author_name(v_old_author.name)
       OR (v_old_author.type = 'ESPIRITO' AND LOWER(TRIM(COALESCE(autor, ''))) LIKE LOWER(TRIM(v_old_author.name)) || ', por %')
  LOOP
    v_new_esp := v_titulo.autor_espiritual;
    v_new_med := v_titulo.autor_mediunico;
    v_new_autor := v_titulo.autor;

    -- Se o autor a ser removido for o autor espiritual (comparação exata normalizada)
    IF public.normalize_author_name(COALESCE(v_new_esp, '')) = public.normalize_author_name(v_old_author.name) THEN
      v_new_esp := NULL;
    END IF;

    -- Se o autor a ser removido for o médium (comparação exata normalizada)
    IF public.normalize_author_name(COALESCE(v_new_med, '')) = public.normalize_author_name(v_old_author.name) THEN
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

    -- Limpar também se autor convencional correspondia ao autor excluído (exato)
    IF public.normalize_author_name(COALESCE(v_new_autor, '')) = public.normalize_author_name(v_old_author.name) THEN
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

-- ------------------------------------------------------------
-- 2) update_author_cascade — matching exato
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_author_cascade(p_author_id uuid, p_new_name text, p_new_type text DEFAULT NULL)
RETURNS jsonb
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

  -- Percorrer APENAS os livros vinculados de forma EXATA a esse autor
  FOR v_titulo IN
    SELECT id_titulo, titulo_de_livro, autor, autor_espiritual, autor_mediunico, author_id
    FROM public.titulo
    WHERE author_id = p_author_id
       OR public.normalize_author_name(COALESCE(autor_espiritual, '')) = public.normalize_author_name(v_old_author.name)
       OR public.normalize_author_name(COALESCE(autor_mediunico, '')) = public.normalize_author_name(v_old_author.name)
       OR public.normalize_author_name(COALESCE(autor, '')) = public.normalize_author_name(v_old_author.name)
       OR (v_old_author.type = 'ESPIRITO' AND LOWER(TRIM(COALESCE(autor, ''))) LIKE LOWER(TRIM(v_old_author.name)) || ', por %')
  LOOP
    v_new_esp := v_titulo.autor_espiritual;
    v_new_med := v_titulo.autor_mediunico;
    v_new_autor := v_titulo.autor;

    -- Se o autor antigo era o autor_espiritual (exato)
    IF public.normalize_author_name(COALESCE(v_new_esp, '')) = public.normalize_author_name(v_old_author.name) THEN
      v_new_esp := v_target_name;
    END IF;

    -- Se o autor antigo era o autor_mediunico (exato)
    IF public.normalize_author_name(COALESCE(v_new_med, '')) = public.normalize_author_name(v_old_author.name) THEN
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
      -- Livro convencional: se autor correspondia ao nome antigo (exato), substitui
      IF public.normalize_author_name(COALESCE(v_new_autor, '')) = public.normalize_author_name(v_old_author.name) THEN
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
