-- Migration: create_update_user_info_function
-- Permite atualizar com segurança os dados do usuário (nome, email, papel, avatar_url) em public.profiles e auth.users

CREATE OR REPLACE FUNCTION public.update_user_info(
  target_user_id uuid,
  new_name text,
  new_email text,
  new_role text,
  new_avatar_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  caller_id uuid;
  caller_role text;
  v_old_email text;
  v_trimmed_email text;
  v_trimmed_name text;
  v_clean_role text;
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

    -- Apenas administradores podem alterar informações de usuários
    IF caller_role != 'admin' THEN
      RAISE EXCEPTION 'Permissão negada: apenas administradores podem editar informações de usuários.';
    END IF;

    -- Impedir rebaixamento do próprio papel de admin
    IF caller_id = target_user_id AND new_role != 'admin' THEN
      RAISE EXCEPTION 'Ação não permitida: você não pode alterar seu próprio papel de administrador para outro nível.';
    END IF;
  END IF;

  v_trimmed_name := TRIM(new_name);
  v_trimmed_email := LOWER(TRIM(new_email));
  v_clean_role := LOWER(TRIM(new_role));

  IF v_clean_role NOT IN ('admin', 'operador', 'leitor') THEN
    v_clean_role := 'leitor';
  END IF;

  IF v_trimmed_email = '' OR v_trimmed_email IS NULL THEN
    RAISE EXCEPTION 'O e-mail não pode ser vazio.';
  END IF;

  -- 2. Obter o e-mail antigo
  SELECT email INTO v_old_email
  FROM public.profiles
  WHERE id = target_user_id;

  IF v_old_email IS NULL THEN
    SELECT email INTO v_old_email
    FROM auth.users
    WHERE id = target_user_id;
  END IF;

  -- Se o e-mail foi alterado, verificar se já está em uso por outro usuário
  IF v_old_email IS NOT NULL AND v_old_email != v_trimmed_email THEN
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_trimmed_email AND id != target_user_id)
       OR EXISTS (SELECT 1 FROM public.profiles WHERE email = v_trimmed_email AND id != target_user_id) THEN
      RAISE EXCEPTION 'O e-mail informado já está em uso por outro usuário.';
    END IF;
  END IF;

  -- 3. Atualizar em auth.users se existir
  UPDATE auth.users
  SET
    email = v_trimmed_email,
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW(),
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
      'nome', v_trimmed_name,
      'full_name', v_trimmed_name,
      'email', v_trimmed_email,
      'papel', v_clean_role,
      'role', v_clean_role,
      'app_role', v_clean_role,
      'avatar_url', new_avatar_url
    )
  WHERE id = target_user_id;

  -- 4. Atualizar em auth.identities
  UPDATE auth.identities
  SET
    email = v_trimmed_email,
    identity_data = COALESCE(identity_data, '{}'::jsonb) || jsonb_build_object(
      'email', v_trimmed_email,
      'nome', v_trimmed_name,
      'full_name', v_trimmed_name
    ),
    updated_at = NOW()
  WHERE user_id = target_user_id;

  -- 5. Atualizar ou inserir em public.profiles
  INSERT INTO public.profiles (
    id,
    email,
    nome,
    full_name,
    papel,
    role,
    avatar_url
  ) VALUES (
    target_user_id,
    v_trimmed_email,
    v_trimmed_name,
    v_trimmed_name,
    v_clean_role,
    v_clean_role,
    new_avatar_url
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nome = EXCLUDED.nome,
    full_name = EXCLUDED.full_name,
    papel = EXCLUDED.papel,
    role = EXCLUDED.role,
    avatar_url = EXCLUDED.avatar_url;

  -- 6. Atualizar em public.leitor se houver vínculo
  UPDATE public.leitor
  SET
    nome_do_leitor = v_trimmed_name,
    email = v_trimmed_email,
    foto = COALESCE(new_avatar_url, foto)
  WHERE id_auth = target_user_id OR (v_old_email IS NOT NULL AND email = v_old_email);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Dados do usuário atualizados com sucesso.',
    'user_id', target_user_id,
    'email', v_trimmed_email,
    'nome', v_trimmed_name,
    'papel', v_clean_role,
    'avatar_url', new_avatar_url
  );
END;
$$;

-- Permissões de execução
GRANT EXECUTE ON FUNCTION public.update_user_info(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_info(uuid, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_user_info(uuid, text, text, text, text) TO service_role;
