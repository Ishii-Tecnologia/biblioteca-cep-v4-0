-- Migration: update_concluir_definicao_senha_and_user_meta
-- Atualiza raw_user_meta_data em auth.users e sincroniza profiles e leitor

CREATE OR REPLACE FUNCTION public.concluir_definicao_senha()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_cur_meta jsonb;
  v_new_meta jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  SELECT email, raw_user_meta_data INTO v_email, v_cur_meta
  FROM auth.users
  WHERE id = v_uid;

  -- 1. Atualizar raw_user_meta_data em auth.users para remover/zerar flags pendentes
  v_new_meta := COALESCE(v_cur_meta, '{}'::jsonb);
  v_new_meta := v_new_meta - 'primeiro_acesso_pendente';
  v_new_meta := jsonb_set(v_new_meta, '{primeiro_acesso_pendente}', 'false'::jsonb, true);
  v_new_meta := jsonb_set(v_new_meta, '{senha_redefinida}', 'true'::jsonb, true);

  UPDATE auth.users
  SET
    raw_user_meta_data = v_new_meta,
    updated_at = now()
  WHERE id = v_uid;

  -- 2. Atualizar public.profiles
  UPDATE public.profiles
  SET
    senha_redefinida = true,
    primeiro_acesso_pendente = false,
    senha_alterada_em = now()
  WHERE id = v_uid;

  -- 3. Atualizar public.leitor associado
  IF v_email IS NOT NULL THEN
    UPDATE public.leitor
    SET
      senha_redefinida = true,
      primeiro_acesso_pendente = false
    WHERE id_auth = v_uid OR lower(trim(email)) = lower(trim(v_email));
  ELSE
    UPDATE public.leitor
    SET
      senha_redefinida = true,
      primeiro_acesso_pendente = false
    WHERE id_auth = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_uid,
    'message', 'Senha definida com sucesso.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.concluir_definicao_senha() TO authenticated;
GRANT EXECUTE ON FUNCTION public.concluir_definicao_senha() TO service_role;
