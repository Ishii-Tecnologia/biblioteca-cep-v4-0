-- Migration: delete_leitor_with_auth_and_fix_orphans
-- 1. Cria a função RPC delete_leitor(integer) para excluir leitor e sua conta de autenticação (auth.users / auth.identities / profiles)
-- 2. Atualiza a função check_email_exists para ignorar contas órfãs (usuários em auth.users ou profiles que não possuem registro de leitor e têm papel 'leitor') ou permitir sua reutilização
-- 3. Atualiza admin_create_user para reaproveitar/limpar contas órfãs de papel leitor sem causar duplicate key
-- 4. Limpa as contas órfãs conhecidas que causaram o erro relatado pelo usuário

CREATE OR REPLACE FUNCTION public.delete_leitor(p_id_leitor integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id uuid;
  v_is_staff boolean;
  v_leitor RECORD;
  v_target_user_id uuid;
  v_target_email text;
  v_active_loans integer;
  v_active_reservas integer;
BEGIN
  -- 1. Verificar permissões: staff (admin ou operador) pode excluir
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL THEN
    v_is_staff := public.app_is_staff();
    IF NOT v_is_staff THEN
      RAISE EXCEPTION 'Permissão negada: apenas operadores e administradores podem excluir leitores.';
    END IF;
  END IF;

  -- 2. Buscar o registro do leitor
  SELECT * INTO v_leitor
  FROM public.leitor
  WHERE id_leitor = p_id_leitor;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leitor com ID % não encontrado.', p_id_leitor;
  END IF;

  v_target_email := lower(trim(v_leitor.email));
  v_target_user_id := v_leitor.id_auth;

  -- Se não tinha id_auth gravado, tenta encontrar pelo email em auth.users
  IF v_target_user_id IS NULL AND v_target_email IS NOT NULL AND v_target_email <> '' THEN
    SELECT id INTO v_target_user_id
    FROM auth.users
    WHERE lower(trim(email)) = v_target_email;
  END IF;

  -- Se ainda não achou, tenta achar em public.profiles
  IF v_target_user_id IS NULL AND v_target_email IS NOT NULL AND v_target_email <> '' THEN
    SELECT id INTO v_target_user_id
    FROM public.profiles
    WHERE lower(trim(email)) = v_target_email;
  END IF;

  -- Impedir auto-exclusão se o usuário logado for o próprio leitor
  IF v_caller_id IS NOT NULL AND v_target_user_id IS NOT NULL AND v_caller_id = v_target_user_id THEN
    RAISE EXCEPTION 'Ação não permitida: você não pode excluir o seu próprio usuário logado.';
  END IF;

  -- 3. Verificar se há empréstimos ativos pendentes
  SELECT count(*) INTO v_active_loans
  FROM public.emprestimo
  WHERE id_leitor = p_id_leitor
    AND data_devolucao_real IS NULL;

  IF v_active_loans > 0 THEN
    RAISE EXCEPTION 'Não é possível remover leitor com empréstimos ativos pendentes.';
  END IF;

  -- 4. Verificar reservas ativas pendentes
  SELECT count(*) INTO v_active_reservas
  FROM public.reserva
  WHERE id_leitor = p_id_leitor
    AND status_reserva = 'Ativa';

  IF v_active_reservas > 0 THEN
    RAISE EXCEPTION 'Não é possível excluir leitor com reserva ativa pendente.';
  END IF;

  -- 5. Limpar vínculos de cursos do leitor
  DELETE FROM public.leitor_curso WHERE id_leitor = p_id_leitor;

  -- 6. Limpar reservas não ativas (Cancelada, Atendida, etc.)
  DELETE FROM public.reserva WHERE id_leitor = p_id_leitor;

  -- 7. Limpar empréstimos finalizados vinculados a este leitor
  DELETE FROM public.emprestimo WHERE id_leitor = p_id_leitor;

  -- 8. Limpar histórico vinculado diretamente a este leitor
  DELETE FROM public.historico WHERE id_leitor = p_id_leitor;

  -- 9. Excluir o registro de leitor
  DELETE FROM public.leitor WHERE id_leitor = p_id_leitor;

  -- 10. Se houver conta de autenticação associada (ou pelo id_auth ou pelo e-mail do leitor)
  IF v_target_user_id IS NOT NULL THEN
    -- Limpar histórico vinculado ao usuario_id
    DELETE FROM public.historico WHERE usuario_id = v_target_user_id;

    -- Deletar de profiles
    DELETE FROM public.profiles WHERE id = v_target_user_id;

    -- Deletar de auth.identities
    DELETE FROM auth.identities WHERE user_id = v_target_user_id;

    -- Deletar de auth.sessions
    DELETE FROM auth.sessions WHERE user_id = v_target_user_id;

    -- Deletar de auth.users
    DELETE FROM auth.users WHERE id = v_target_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Leitor e respectiva conta de autenticação excluídos com sucesso.',
    'id_leitor', p_id_leitor,
    'user_id', v_target_user_id,
    'email', v_target_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_leitor(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_leitor(integer) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_leitor(integer) TO service_role;

-- Atualizar delete_user para também limpar com segurança leitor_curso antes de excluir leitor
CREATE OR REPLACE FUNCTION public.delete_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  caller_id uuid;
  caller_role text;
  v_target_email text;
  v_target_name text;
  v_leitor_id integer;
  v_active_loans integer;
BEGIN
  -- 1. Obter identificação de quem está chamando
  caller_id := auth.uid();
  
  -- Verificar papel do chamador
  SELECT COALESCE(p.papel, p.role, 'leitor') INTO caller_role
  FROM public.profiles p
  WHERE p.id = caller_id;

  -- Se não encontrar no profiles, checar claims
  IF caller_role IS NULL THEN
    caller_role := COALESCE(
      (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'papel'),
      (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'app_role'),
      (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'),
      'leitor'
    );
  END IF;

  -- Apenas administradores podem excluir usuários (ou chamadas diretas pelo postgres superuser/service_role)
  IF caller_id IS NOT NULL AND caller_role != 'admin' THEN
    RAISE EXCEPTION 'Permissão negada: apenas administradores podem excluir usuários.';
  END IF;

  -- 2. Segurança: Impedir auto-exclusão
  IF caller_id IS NOT NULL AND caller_id = target_user_id THEN
    RAISE EXCEPTION 'Ação não permitida: você não pode excluir o seu próprio usuário logado.';
  END IF;

  -- 3. Obter dados do usuário alvo
  SELECT email, nome INTO v_target_email, v_target_name
  FROM public.profiles
  WHERE id = target_user_id;

  IF v_target_email IS NULL THEN
    SELECT email INTO v_target_email
    FROM auth.users
    WHERE id = target_user_id;
  END IF;

  IF v_target_email IS NULL AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  -- 4. Verificar se há leitor vinculado e se existem empréstimos ativos
  SELECT id_leitor INTO v_leitor_id
  FROM public.leitor
  WHERE id_auth = target_user_id
     OR (v_target_email IS NOT NULL AND lower(trim(email)) = lower(trim(v_target_email)));

  IF v_leitor_id IS NOT NULL THEN
    SELECT count(*) INTO v_active_loans
    FROM public.emprestimo
    WHERE id_leitor = v_leitor_id
      AND data_devolucao_real IS NULL;

    IF v_active_loans > 0 THEN
      RAISE EXCEPTION 'Não é possível excluir usuário com empréstimos de livros pendentes de devolução.';
    END IF;

    -- Limpar cursos, reservas e empréstimos
    DELETE FROM public.leitor_curso WHERE id_leitor = v_leitor_id;
    DELETE FROM public.reserva WHERE id_leitor = v_leitor_id;
    DELETE FROM public.emprestimo WHERE id_leitor = v_leitor_id;
    DELETE FROM public.leitor WHERE id_leitor = v_leitor_id;
  END IF;

  -- 5. Limpar histórico vinculado a este usuário
  DELETE FROM public.historico WHERE usuario_id = target_user_id;

  -- 6. Deletar do profiles
  DELETE FROM public.profiles WHERE id = target_user_id;

  -- 7. Deletar de auth.identities
  DELETE FROM auth.identities WHERE user_id = target_user_id;

  -- 8. Deletar de auth.sessions
  DELETE FROM auth.sessions WHERE user_id = target_user_id;

  -- 9. Deletar de auth.users
  DELETE FROM auth.users WHERE id = target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Usuário e dados vinculados excluídos com sucesso.',
    'user_id', target_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_user(uuid) TO service_role;

-- 3. Atualizar check_email_exists para tratar contas órfãs:
-- Se o email existir em auth.users ou profiles, mas NÃO existir em leitor E o papel for 'leitor',
-- removemos a conta órfã para permitir o novo cadastro sem erro de chave duplicada.
CREATE OR REPLACE FUNCTION public.check_email_exists(check_email text, exclude_user_id uuid DEFAULT NULL::uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  normalized_email text := LOWER(TRIM(check_email));
  exists_flag boolean := false;
  v_orphan_user_id uuid;
  v_orphan_role text;
  v_has_leitor boolean;
BEGIN
  IF normalized_email IS NULL OR normalized_email = '' THEN
    RETURN false;
  END IF;

  -- Verificar se existe leitor com este e-mail
  SELECT EXISTS(
    SELECT 1 FROM public.leitor
    WHERE LOWER(TRIM(email)) = normalized_email
      AND (exclude_user_id IS NULL OR id_auth IS NULL OR id_auth <> exclude_user_id)
  ) INTO v_has_leitor;

  IF v_has_leitor THEN
    RETURN true;
  END IF;

  -- Se não existe leitor, verificar se existe usuário em auth.users
  SELECT id INTO v_orphan_user_id
  FROM auth.users
  WHERE LOWER(TRIM(email)) = normalized_email
    AND (exclude_user_id IS NULL OR id <> exclude_user_id)
  LIMIT 1;

  IF v_orphan_user_id IS NOT NULL THEN
    -- Obter papel do perfil ou metadata
    SELECT COALESCE(papel, role, 'leitor') INTO v_orphan_role
    FROM public.profiles
    WHERE id = v_orphan_user_id;

    IF v_orphan_role IS NULL THEN
      SELECT COALESCE(
        raw_user_meta_data->>'papel',
        raw_user_meta_data->>'app_role',
        raw_user_meta_data->>'role',
        'leitor'
      ) INTO v_orphan_role
      FROM auth.users
      WHERE id = v_orphan_user_id;
    END IF;

    -- Se a conta for de 'leitor' e não há registro na tabela leitor, trata-se de uma conta órfã!
    -- Excluímos a conta órfã automaticamente para limpar o cadastro e permitir o novo registro.
    IF v_orphan_role = 'leitor' THEN
      DELETE FROM public.profiles WHERE id = v_orphan_user_id;
      DELETE FROM auth.identities WHERE user_id = v_orphan_user_id;
      DELETE FROM auth.sessions WHERE user_id = v_orphan_user_id;
      DELETE FROM auth.users WHERE id = v_orphan_user_id;
      RETURN false;
    ELSE
      -- É conta de staff (admin, operador, etc.), então o e-mail realmente está em uso
      RETURN true;
    END IF;
  END IF;

  -- Checar em profiles isoladamente caso não esteja em auth.users
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE LOWER(TRIM(email)) = normalized_email
      AND (exclude_user_id IS NULL OR id <> exclude_user_id)
      AND COALESCE(papel, role, 'leitor') != 'leitor'
  ) INTO exists_flag;

  IF exists_flag THEN
    RETURN true;
  ELSE
    -- Se havia perfil órfão de leitor sem auth.users, limpa-o
    DELETE FROM public.profiles
    WHERE LOWER(TRIM(email)) = normalized_email
      AND COALESCE(papel, role, 'leitor') = 'leitor';
    RETURN false;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_email_exists(text, uuid) TO anon, authenticated, service_role;

-- 4. Atualizar admin_create_user para reaproveitar/limpar contas órfãs se um leitor novo for cadastrado pelo admin/operador
CREATE OR REPLACE FUNCTION public.admin_create_user(
  new_email text,
  new_password text,
  new_nome text,
  new_papel text DEFAULT 'operador'::text,
  new_avatar_url text DEFAULT NULL::text
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
  v_existing_id uuid;
  v_existing_role text;
  v_has_leitor boolean;
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

    -- Apenas administradores e operadores podem cadastrar usuários diretamente
    IF caller_role NOT IN ('admin', 'operador', 'operador_diretoria') THEN
      RAISE EXCEPTION 'Permissão negada: apenas administradores e operadores podem criar usuários.';
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

  -- 3. Verificar duplicidade de e-mail ou limpar órfãos
  SELECT id INTO v_existing_id
  FROM auth.users
  WHERE lower(email) = v_normalized_email;

  IF v_existing_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.leitor
      WHERE lower(trim(email)) = v_normalized_email
         OR id_auth = v_existing_id
    ) INTO v_has_leitor;

    SELECT COALESCE(papel, role, 'leitor') INTO v_existing_role
    FROM public.profiles
    WHERE id = v_existing_id;

    IF v_clean_papel = 'leitor' AND NOT v_has_leitor AND (v_existing_role = 'leitor' OR v_existing_role IS NULL) THEN
      -- Conta de autenticação órfã de leitor sem registro em public.leitor: limpar para permitir novo cadastro
      DELETE FROM public.profiles WHERE id = v_existing_id;
      DELETE FROM auth.identities WHERE user_id = v_existing_id;
      DELETE FROM auth.sessions WHERE user_id = v_existing_id;
      DELETE FROM auth.users WHERE id = v_existing_id;
    ELSE
      RAISE EXCEPTION 'O e-mail % já está cadastrado no sistema.', v_normalized_email;
    END IF;
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

  -- 5. Inserir em auth.users com email_confirmed_at = now() e tokens vazios (GoTrue compliant)
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

GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text) TO service_role;

-- 5. Limpeza imediata de contas órfãs conhecidas que não possuem correspondência em leitor
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Percorrer usuários em auth.users com papel 'leitor' ou sem papel que não constam na tabela leitor
  FOR r IN (
    SELECT u.id, u.email
    FROM auth.users u
    LEFT JOIN public.leitor l ON (l.id_auth = u.id OR lower(trim(l.email)) = lower(trim(u.email)))
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE l.id_leitor IS NULL
      AND (
        COALESCE(p.papel, p.role, u.raw_user_meta_data->>'papel', u.raw_user_meta_data->>'role', 'leitor') = 'leitor'
        OR lower(trim(u.email)) IN ('leitornovo@leitor.com', 'leitor@teste.com', 'ftishii@hotmail.com')
      )
      AND u.email NOT IN ('admin@cep.edu.br', 'ishii7883@gmail.com', 'operador@cep.com', 'diretori@cep.com')
  ) LOOP
    DELETE FROM public.historico WHERE usuario_id = r.id;
    DELETE FROM public.profiles WHERE id = r.id;
    DELETE FROM auth.identities WHERE user_id = r.id;
    DELETE FROM auth.sessions WHERE user_id = r.id;
    DELETE FROM auth.users WHERE id = r.id;
  END LOOP;
END $$;
