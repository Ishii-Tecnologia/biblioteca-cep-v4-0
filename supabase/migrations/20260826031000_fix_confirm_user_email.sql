-- Corrigir função confirm_user_email com SECURITY DEFINER e search_path para garantir atualização em auth.users
CREATE OR REPLACE FUNCTION public.confirm_user_email(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'auth'
AS $$
BEGIN
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = user_id;
END;
$$;
