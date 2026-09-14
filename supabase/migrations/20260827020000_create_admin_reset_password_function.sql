-- Migration: create_admin_reset_password_rpc
-- Função SECURITY DEFINER para redefinir a senha de um usuário por um administrador

CREATE OR REPLACE FUNCTION public.admin_reset_password(
  target_user_id uuid,
  new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  caller_id uuid;
  caller_role text;
  v_target_email text;
  v_encrypted_pw text;
BEGIN
  -- 1. Obter identificação de quem está chamando
  caller_id := auth.uid();

  -- Se for chamado por usuário autenticado, verificar se tem papel de administrador
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

    -- Apenas administradores podem redefinir senhas de outros usuários
    IF caller_role != 'admin' THEN
      RAISE EXCEPTION 'Permissão negada: apenas administradores podem redefinir a senha de usuários.';
    END IF;
  END IF;

  -- 2. Validação da senha
  IF new_password IS NULL OR length(new_password) < 6 THEN
    RAISE EXCEPTION 'A nova senha deve ter no mínimo 6 caracteres.';
  END IF;

  -- 3. Verificar existência do usuário alvo
  SELECT email INTO v_target_email
  FROM auth.users
  WHERE id = target_user_id;

  IF v_target_email IS NULL THEN
    SELECT email INTO v_target_email
    FROM public.profiles
    WHERE id = target_user_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  -- 4. Gerar hash bcrypt da nova senha
  v_encrypted_pw := extensions.crypt(new_password, extensions.gen_salt('bf'));

  -- 5. Atualizar auth.users
  UPDATE auth.users
  SET
    encrypted_password = v_encrypted_pw,
    updated_at = NOW()
  WHERE id = target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Senha redefinida com sucesso.',
    'user_id', target_user_id
  );
END;
$$;

-- Conceder permissões de execução
GRANT EXECUTE ON FUNCTION public.admin_reset_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_password(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_password(uuid, text) TO service_role;
