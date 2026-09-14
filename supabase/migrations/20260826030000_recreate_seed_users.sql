-- Recreate seed users (admin@cep.edu.br and leitor@cep.edu.br) with complete auth credentials, identities, and profiles
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

DO $$
DECLARE
  v_admin_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_leitor_id uuid := 'a0000000-0000-0000-0000-000000000002'::uuid;
  v_instance_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_encrypted_pw text;
BEGIN
  -- Hash password with 10 rounds blowfish via crypt / gen_salt (pgcrypto in public schema or extensions)
  v_encrypted_pw := crypt('Skip@Pass', gen_salt('bf', 10));

  -- 1. Inserir ou atualizar admin@cep.edu.br em auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin_id OR email = 'admin@cep.edu.br') THEN
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
      v_admin_id,
      v_instance_id,
      'authenticated',
      'authenticated',
      'admin@cep.edu.br',
      v_encrypted_pw,
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "Profª Helena Vasconcelos", "role": "admin", "app_role": "admin", "email_verified": true}'::jsonb,
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
  ELSE
    UPDATE auth.users
    SET
      encrypted_password = v_encrypted_pw,
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
      raw_user_meta_data = '{"full_name": "Profª Helena Vasconcelos", "role": "admin", "app_role": "admin", "email_verified": true}'::jsonb,
      updated_at = now()
    WHERE email = 'admin@cep.edu.br';
  END IF;

  -- 2. Inserir ou atualizar leitor@cep.edu.br em auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_leitor_id OR email = 'leitor@cep.edu.br') THEN
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
      v_leitor_id,
      v_instance_id,
      'authenticated',
      'authenticated',
      'leitor@cep.edu.br',
      v_encrypted_pw,
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "Lucas Mendes", "role": "leitor", "app_role": "leitor", "email_verified": true}'::jsonb,
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
  ELSE
    UPDATE auth.users
    SET
      encrypted_password = v_encrypted_pw,
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
      raw_user_meta_data = '{"full_name": "Lucas Mendes", "role": "leitor", "app_role": "leitor", "email_verified": true}'::jsonb,
      updated_at = now()
    WHERE email = 'leitor@cep.edu.br';
  END IF;

  -- 3. Inserir em auth.identities para Admin
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
    v_admin_id,
    'admin@cep.edu.br',
    'email',
    jsonb_build_object(
      'sub', v_admin_id::text,
      'email', 'admin@cep.edu.br',
      'role', 'admin',
      'app_role', 'admin',
      'full_name', 'Profª Helena Vasconcelos',
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

  -- 4. Inserir em auth.identities para Leitor
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
    v_leitor_id,
    'leitor@cep.edu.br',
    'email',
    jsonb_build_object(
      'sub', v_leitor_id::text,
      'email', 'leitor@cep.edu.br',
      'role', 'leitor',
      'app_role', 'leitor',
      'full_name', 'Lucas Mendes',
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

  -- 5. Upsert em public.profiles
  INSERT INTO public.profiles (
    id,
    email,
    nome,
    full_name,
    papel,
    role,
    bloqueado,
    created_at
  ) VALUES (
    v_admin_id,
    'admin@cep.edu.br',
    'Profª Helena Vasconcelos',
    'Profª Helena Vasconcelos',
    'admin',
    'admin',
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
    bloqueado = EXCLUDED.bloqueado;

  INSERT INTO public.profiles (
    id,
    email,
    nome,
    full_name,
    papel,
    role,
    bloqueado,
    created_at
  ) VALUES (
    v_leitor_id,
    'leitor@cep.edu.br',
    'Lucas Mendes',
    'Lucas Mendes',
    'leitor',
    'leitor',
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
    bloqueado = EXCLUDED.bloqueado;

  -- 6. Garantir registro de leitor na tabela public.leitor para o leitor de demonstração
  INSERT INTO public.leitor (
    id_auth,
    cpf,
    nome_do_leitor,
    email,
    telefone,
    data_cadastro,
    bloqueado
  ) VALUES (
    v_leitor_id,
    '111.222.333-44',
    'Lucas Mendes',
    'leitor@cep.edu.br',
    '(41) 98888-7777',
    CURRENT_DATE,
    false
  )
  ON CONFLICT (email) DO UPDATE
  SET
    id_auth = EXCLUDED.id_auth,
    nome_do_leitor = EXCLUDED.nome_do_leitor,
    bloqueado = EXCLUDED.bloqueado;

END $$;
