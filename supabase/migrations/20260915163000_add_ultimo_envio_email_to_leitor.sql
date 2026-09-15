-- Migration: add_ultimo_envio_email_to_leitor
-- Adiciona a coluna ultimo_envio_email_em para controle e proteção de rate limit no envio de e-mails de acesso

ALTER TABLE public.leitor
  ADD COLUMN IF NOT EXISTS ultimo_envio_email_em timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ultimo_envio_email_em timestamptz;

-- Atualizar aprovar_cadastro_leitor para preencher/atualizar ultimo_envio_email_em
CREATE OR REPLACE FUNCTION public.aprovar_cadastro_leitor(
  p_id_leitor integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth, pg_temp
AS $$
DECLARE
  v_caller_id uuid;
  v_is_staff boolean;
  v_leitor RECORD;
  v_user_id uuid;
  v_normalized_email text;
  v_instance_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_encrypted_pw text;
  v_metadata jsonb;
  v_temp_pw text;
BEGIN
  -- 1. Validar se quem chama é staff (admin ou operador)
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL THEN
    v_is_staff := public.app_is_staff();
    IF NOT v_is_staff THEN
      RAISE EXCEPTION 'Permissão negada: apenas administradores e operadores podem aprovar cadastros.';
    END IF;
  END IF;

  -- 2. Buscar o registro do leitor
  SELECT * INTO v_leitor
  FROM public.leitor
  WHERE id_leitor = p_id_leitor;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leitor com ID % não encontrado.', p_id_leitor;
  END IF;

  v_normalized_email := lower(trim(v_leitor.email));

  -- 3. Verificar se já existe um usuário em auth.users com esse e-mail
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_normalized_email;

  IF v_user_id IS NULL THEN
    -- Criar novo usuário em auth.users
    v_user_id := gen_random_uuid();
    -- Gera senha temporária aleatória de 24 caracteres (o leitor usará o reset/primeiro acesso para definir a definitiva)
    v_temp_pw := encode(gen_random_bytes(18), 'hex');
    v_encrypted_pw := crypt(v_temp_pw, gen_salt('bf', 10));

    v_metadata := jsonb_build_object(
      'nome', trim(v_leitor.nome_do_leitor),
      'full_name', trim(v_leitor.nome_do_leitor),
      'papel', 'leitor',
      'role', 'leitor',
      'app_role', 'leitor',
      'avatar_url', v_leitor.foto,
      'email_verified', true,
      'primeiro_acesso_pendente', true
    );

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
      v_user_id,
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

    -- Inserir em auth.identities
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
      v_user_id,
      v_normalized_email,
      'email',
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_normalized_email,
        'role', 'leitor',
        'app_role', 'leitor',
        'full_name', trim(v_leitor.nome_do_leitor),
        'email_verified', true,
        'primeiro_acesso_pendente', true
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
  END IF;

  -- 4. Garantir registro em public.profiles com senha_redefinida = false e primeiro_acesso_pendente = true
  INSERT INTO public.profiles (
    id,
    email,
    nome,
    full_name,
    papel,
    role,
    avatar_url,
    telefone,
    telefone_fixo,
    bloqueado,
    senha_redefinida,
    primeiro_acesso_pendente,
    created_at
  ) VALUES (
    v_user_id,
    v_normalized_email,
    trim(v_leitor.nome_do_leitor),
    trim(v_leitor.nome_do_leitor),
    'leitor',
    'leitor',
    v_leitor.foto,
    v_leitor.telefone,
    v_leitor.telefone_fixo,
    false,
    false,
    true,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    nome = EXCLUDED.nome,
    full_name = EXCLUDED.full_name,
    telefone = COALESCE(EXCLUDED.telefone, public.profiles.telefone),
    telefone_fixo = COALESCE(EXCLUDED.telefone_fixo, public.profiles.telefone_fixo),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    senha_redefinida = false,
    primeiro_acesso_pendente = true;

  -- 5. Atualizar o leitor: vincular id_auth, marcar status_cadastro = 'ativo', senha_redefinida = false
  UPDATE public.leitor
  SET
    id_auth = v_user_id,
    status_cadastro = 'ativo',
    bloqueado = false,
    senha_redefinida = false,
    primeiro_acesso_pendente = true
  WHERE id_leitor = p_id_leitor;

  -- 6. Gravar histórico
  INSERT INTO public.historico (
    tipo,
    descricao,
    entidade_tipo,
    entidade_id,
    id_leitor,
    usuario_id,
    observacao
  ) VALUES (
    'Aprovação de Cadastro',
    'Cadastro do leitor ' || v_leitor.nome_do_leitor || ' aprovado pela biblioteca.',
    'leitor',
    p_id_leitor::text,
    p_id_leitor,
    v_caller_id,
    'Status atualizado para ativo. Conta de autenticação vinculada com primeiro acesso pendente.'
  );

  RETURN jsonb_build_object(
    'success', true,
    'id_leitor', p_id_leitor,
    'user_id', v_user_id,
    'email', v_normalized_email,
    'nome', v_leitor.nome_do_leitor,
    'primeiro_acesso_pendente', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.aprovar_cadastro_leitor(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aprovar_cadastro_leitor(integer) TO service_role;

-- Função RPC para registrar timestamp de envio de e-mail de acesso/reset
CREATE OR REPLACE FUNCTION public.registrar_envio_email_acesso(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_normalized_email text;
  v_now timestamptz := now();
BEGIN
  v_normalized_email := lower(trim(p_email));
  IF v_normalized_email IS NULL OR v_normalized_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'E-mail inválido');
  END IF;

  UPDATE public.leitor
  SET ultimo_envio_email_em = v_now
  WHERE lower(trim(email)) = v_normalized_email;

  UPDATE public.profiles
  SET ultimo_envio_email_em = v_now
  WHERE lower(trim(email)) = v_normalized_email;

  RETURN jsonb_build_object('success', true, 'timestamp', v_now);
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_envio_email_acesso(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_envio_email_acesso(text) TO service_role;
