-- Migration para remover o trigger on_auth_user_created e a funcao auto_confirm_email
-- Motivo: O trigger BEFORE INSERT ON auth.users interfere no funcionamento interno do GoTrue gerando HTTP 500 no login.
-- A confirmacao de email agora e tratada de forma explicita pelo frontend via RPC public.confirm_user_email(uuid).

-- 1. Drop trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Drop function auto_confirm_email
DROP FUNCTION IF EXISTS public.auto_confirm_email();

-- 3. Garantir que a funcao confirm_user_email(uuid) continue existindo e com permissoes adequadas
CREATE OR REPLACE FUNCTION public.confirm_user_email(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, now())
  WHERE id = user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_user_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_user_email(uuid) TO anon;
