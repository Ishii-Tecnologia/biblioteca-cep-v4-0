-- Migration para garantir auto confirmação de email no cadastro de usuários
-- Observação: em versões modernas do GoTrue/Supabase, auth.users.confirmed_at é uma coluna gerada (GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED ou similar), portanto apenas email_confirmed_at deve ser atribuído diretamente.

CREATE OR REPLACE FUNCTION public.auto_confirm_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Para BEFORE INSERT, modificamos NEW diretamente
  NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, now());
  RETURN NEW;
END;
$$;

-- Recriar o trigger como BEFORE INSERT
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_email();

-- Função RPC que o frontend pode chamar para confirmar o email de um usuário de forma explícita
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

-- Conceder permissão de execução para roles authenticated e anon
GRANT EXECUTE ON FUNCTION public.confirm_user_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_user_email(uuid) TO anon;

-- Atualizar quaisquer usuários existentes que porventura estejam sem email_confirmed_at
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email_confirmed_at IS NULL;
