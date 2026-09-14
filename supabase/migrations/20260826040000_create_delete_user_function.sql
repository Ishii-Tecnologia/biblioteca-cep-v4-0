-- Migration: create_delete_user_function
-- Cria função SECURITY DEFINER para exclusão completa de usuários (auth.users, public.profiles, public.leitor)

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
     OR (v_target_email IS NOT NULL AND email = v_target_email);

  IF v_leitor_id IS NOT NULL THEN
    SELECT count(*) INTO v_active_loans
    FROM public.emprestimo
    WHERE id_leitor = v_leitor_id
      AND data_devolucao_real IS NULL;

    IF v_active_loans > 0 THEN
      RAISE EXCEPTION 'Não é possível excluir usuário com empréstimos de livros pendentes de devolução.';
    END IF;

    -- Limpar reservas e empréstimos já finalizados do leitor se necessário, ou deletar o leitor
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

-- Conceder permissão de execução para usuários autenticados e anon
GRANT EXECUTE ON FUNCTION public.delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_user(uuid) TO service_role;
