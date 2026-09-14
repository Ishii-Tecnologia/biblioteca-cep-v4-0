-- Migration: create check_email_exists function
-- Checks whether an email already exists in auth.users, public.profiles or public.leitor
CREATE OR REPLACE FUNCTION public.check_email_exists(check_email text, exclude_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  normalized_email text := LOWER(TRIM(check_email));
  exists_flag boolean := false;
BEGIN
  IF normalized_email IS NULL OR normalized_email = '' THEN
    RETURN false;
  END IF;

  -- 1. Check in auth.users
  IF exclude_user_id IS NOT NULL THEN
    SELECT true INTO exists_flag
    FROM auth.users
    WHERE LOWER(TRIM(email)) = normalized_email
      AND id <> exclude_user_id
    LIMIT 1;
  ELSE
    SELECT true INTO exists_flag
    FROM auth.users
    WHERE LOWER(TRIM(email)) = normalized_email
    LIMIT 1;
  END IF;

  IF exists_flag THEN
    RETURN true;
  END IF;

  -- 2. Check in public.profiles
  IF exclude_user_id IS NOT NULL THEN
    SELECT true INTO exists_flag
    FROM public.profiles
    WHERE LOWER(TRIM(email)) = normalized_email
      AND id <> exclude_user_id
    LIMIT 1;
  ELSE
    SELECT true INTO exists_flag
    FROM public.profiles
    WHERE LOWER(TRIM(email)) = normalized_email
    LIMIT 1;
  END IF;

  IF exists_flag THEN
    RETURN true;
  END IF;

  -- 3. Check in public.leitor
  IF exclude_user_id IS NOT NULL THEN
    SELECT true INTO exists_flag
    FROM public.leitor
    WHERE LOWER(TRIM(email)) = normalized_email
      AND (id_auth IS NULL OR id_auth <> exclude_user_id)
    LIMIT 1;
  ELSE
    SELECT true INTO exists_flag
    FROM public.leitor
    WHERE LOWER(TRIM(email)) = normalized_email
    LIMIT 1;
  END IF;

  RETURN COALESCE(exists_flag, false);
END;
$$;

-- Grant execution to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.check_email_exists(text, uuid) TO anon, authenticated, service_role;
