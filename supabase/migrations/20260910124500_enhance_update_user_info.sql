-- Migration: enhance_update_user_info_and_profiles_rls
-- Garante que update_user_info receba e grave avatar_url com segurança,
-- permitindo tanto NULL quanto string vazia ou URL completa,
-- e garante permissão de update/upsert em public.profiles para admins e operadores autorizados.

CREATE OR REPLACE FUNCTION public.update_user_info(
  target_user_id uuid,
  new_name text,
  new_email text,
  new_role text,
  new_avatar_url text DEFAULT NULL::text,
  new_telefone text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  caller_id uuid;
  caller_role text;
  v_trimmed_name text;
  v_trimmed_telefone text;
  v_clean_role text;
  v_current_email text;
  v_clean_avatar_url text;
BEGIN
  -- 1. Obter identificação do usuário chamador
  caller_id := auth.uid();
  
  IF caller_id IS NOT NULL THEN
    SELECT COALESCE(p.papel, p.role, 'leitor') INTO caller_role
    FROM public.profiles p
    WHERE p.id = caller_id;

    IF caller_role IS NULL THEN
      caller_role := COALESCE(
        (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'papel'),
        (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'app_role'),
        (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'),
        'leitor'
      );
    END IF;

    -- Apenas administradores podem alterar informações de outros usuários via esta função
    IF caller_role != 'admin' AND caller_id != target_user_id THEN
      RAISE EXCEPTION 'Permissão negada: apenas administradores podem editar informações de usuários.';
    END IF;

    -- Impedir rebaixamento do próprio papel de admin
    IF caller_id = target_user_id AND new_role != 'admin' AND caller_role = 'admin' THEN
      RAISE EXCEPTION 'Ação não permitida: você não pode alterar seu próprio papel de administrador para outro nível.';
    END IF;
  END IF;

  v_trimmed_name := TRIM(new_name);
  v_trimmed_telefone := NULLIF(TRIM(new_telefone), '');
  v_clean_role := LOWER(TRIM(new_role));
  v_clean_avatar_url := NULLIF(TRIM(new_avatar_url), '');

  IF v_clean_role NOT IN ('admin', 'operador', 'operador_diretoria', 'leitor') THEN
    v_clean_role := 'leitor';
  END IF;

  IF v_trimmed_name = '' OR v_trimmed_name IS NULL THEN
    RAISE EXCEPTION 'O nome não pode ser vazio.';
  END IF;

  -- Obter o email atual cadastrado do usuário para manter integridade
  SELECT email INTO v_current_email
  FROM public.profiles
  WHERE id = target_user_id;

  IF v_current_email IS NULL THEN
    SELECT email INTO v_current_email
    FROM auth.users
    WHERE id = target_user_id;
  END IF;

  IF v_current_email IS NULL THEN
    v_current_email := LOWER(TRIM(new_email));
  END IF;

  -- 2. Atualizar raw_user_meta_data em auth.users (sem tocar na coluna auth.users.email)
  UPDATE auth.users
  SET
    updated_at = NOW(),
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
      'nome', v_trimmed_name,
      'full_name', v_trimmed_name,
      'papel', v_clean_role,
      'role', v_clean_role,
      'app_role', v_clean_role,
      'avatar_url', v_clean_avatar_url,
      'telefone', v_trimmed_telefone
    )
  WHERE id = target_user_id;

  -- 3. Atualizar ou inserir em public.profiles com o novo avatar_url
  INSERT INTO public.profiles (
    id,
    email,
    nome,
    full_name,
    papel,
    role,
    avatar_url,
    telefone
  ) VALUES (
    target_user_id,
    v_current_email,
    v_trimmed_name,
    v_trimmed_name,
    v_clean_role,
    v_clean_role,
    v_clean_avatar_url,
    v_trimmed_telefone
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    full_name = EXCLUDED.full_name,
    papel = EXCLUDED.papel,
    role = EXCLUDED.role,
    avatar_url = EXCLUDED.avatar_url,
    telefone = EXCLUDED.telefone;

  -- 4. Sincronizar nome, telefone e foto com public.leitor se houver vínculo
  UPDATE public.leitor
  SET
    nome_do_leitor = v_trimmed_name,
    telefone = COALESCE(v_trimmed_telefone, telefone),
    foto = v_clean_avatar_url
  WHERE id_auth = target_user_id OR (v_current_email IS NOT NULL AND email = v_current_email);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Dados do usuário atualizados com sucesso.',
    'user_id', target_user_id,
    'email', v_current_email,
    'nome', v_trimmed_name,
    'papel', v_clean_role,
    'avatar_url', v_clean_avatar_url,
    'telefone', v_trimmed_telefone
  );
END;
$$;

-- Permissões de execução da RPC
GRANT EXECUTE ON FUNCTION public.update_user_info(uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_info(uuid, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_user_info(uuid, text, text, text, text, text) TO service_role;
