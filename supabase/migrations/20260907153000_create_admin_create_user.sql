-- Migration: create_admin_create_user_rpc
-- Função SECURITY DEFINER para criar usuário com e-mail já confirmado diretamente em auth.users
-- Evita disparo de e-mails de confirmação e contorna o erro "Email rate limit exceeded"

CREATE OR REPLACE FUNCTION public.admin_create_user(
  new_email text,
  new_password text,
  new_nome text,
  new_papel text DEFAULT 'operador',
  new_avatar_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  caller_id uuid;
  caller_role text;
  v_normalized_email text;
  v_new_user_id uuid;
  v_instance_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_encrypted_pw text;
  v_clean_papel text;
  v_metadata jsonb;
BEGIN
  -- 1. Obter identificação de quem está chamando
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

    -- Apenas administradores podem cadastrar novos operadores/administradores por esta rota
    IF caller_role != 'admin' THEN
      RAISE EXCEPTION 'Permissão negada: apenas administradores podem criar usuários diretamente.';
    END IF;
  END IF;

  -- 2. Validações básicas
  v_normalized_email := lower(trim(new_email));
  IF v_normalized_email IS NULL OR v_normalized_email = '' THEN
    RAISE EXCEPTION 'Endereço de e-mail é obrigatório.';
  END IF;

  IF new_password IS NULL OR length(new_password) < 6 THEN
    RAISE EXCEPTION 'A senha provisória deve conter no mínimo 6 caracteres.';
  END IF;

  IF new_nome IS NULL OR trim(new_nome) = '' THEN
    RAISE EXCEPTION 'O nome completo do usuário é obrigatório.';
  END IF;

  v_clean_papel := COALESCE(NULLIF(trim(new_papel), ''), 'operador');

  -- 3. Verificar duplicidade de e-mail
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_normalized_email) THEN
    RAISE EXCEPTION 'O e-mail % já está cadastrado no sistema.', v_normalized_email;
  END IF;

  -- 4. Gerar hash de senha e ID
  v_new_user_id := gen_random_uuid();
  v_encrypted_pw := extensions.crypt(new_password, extensions.gen_salt('bf', 10));

  v_metadata := jsonb_build_object(
    'nome', trim(new_nome),
    'full_name', trim(new_nome),
    'papel', v_clean_papel,
    'role', v_clean_papel,
    'app_role', v_clean_papel,
    'avatar_url', new_avatar_url,
    'email_verified', true
  );

  -- 5. Inserir em auth.users com email_confirmed_at = now() e tokens vazios (conforme diretrizes do GoTrue)
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    email_change_token_current,
    phone,
    phone_change,
    phone_change_token,
    reauthentication_token,
    is_super_admin
  ) VALUES (
    v_new_user_id,
    v_instance_id,
    'authenticated',
    'authenticated',
    v_normalized_email,
    v_encrypted_pw,
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    v_metadata,
    now(),
    now(),
    '',
    '',
    '',
    '',
    '',
    NULL,
    '',
    '',
    '',
    false
  );

  -- 6. Inserir em auth.identities
  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    provider,
    identity_data,
    created_at,
    updated_at,
    last_sign_in_at
  ) VALUES (
    gen_random_uuid(),
    v_new_user_id,
    v_normalized_email,
    'email',
    jsonb_build_object(
      'sub', v_new_user_id::text,
      'email', v_normalized_email,
      'role', v_clean_papel,
      'app_role', v_clean_papel,
      'full_name', trim(new_nome),
      'email_verified', true
    ),
    now(),
    now(),
    now()
  )
  ON CONFLICT (provider_id, provider) DO UPDATE
  SET
    user_id = EXCLUDED.user_id,
    identity_data = EXCLUDED.identity_data,
    updated_at = now();

  -- 7. Inserir / Upsert em public.profiles
  INSERT INTO public.profiles (
    id,
    email,
    nome,
    full_name,
    papel,
    role,
    avatar_url,
    bloqueado,
    created_at
  ) VALUES (
    v_new_user_id,
    v_normalized_email,
    trim(new_nome),
    trim(new_nome),
    v_clean_papel,
    v_clean_papel,
    new_avatar_url,
    false,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    nome = EXCLUDED.nome,
    full_name = EXCLUDED.full_name,
    papel = EXCLUDED.papel,
    role = EXCLUDED.role,
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    bloqueado = false;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_new_user_id,
    'email', v_normalized_email,
    'nome', trim(new_nome),
    'papel', v_clean_papel
  );
END;
$$;

-- Permissões de execução
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text) TO service_role;
