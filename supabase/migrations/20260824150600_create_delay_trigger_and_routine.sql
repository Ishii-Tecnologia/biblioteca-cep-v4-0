-- Function and trigger to automatically update loans to 'atrasado' when data_prevista < CURRENT_DATE and status = 'ativo'

-- 1. Function to update overdue loans on emprestimos table
CREATE OR REPLACE FUNCTION public.atualizar_status_atrasos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Update emprestimos table
  WITH updated_emprestimos AS (
    UPDATE public.emprestimos
    SET status = 'atrasado'
    WHERE status = 'ativo'
      AND data_prevista < CURRENT_DATE
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated_emprestimos;

  -- Also update legacy emprestimo table if present
  UPDATE public.emprestimo
  SET atraso = true,
      dias_atraso = GREATEST(1, EXTRACT(DAY FROM (now() - data_prevista_devolucao))::INT)
  WHERE data_devolucao_real IS NULL
    AND data_prevista_devolucao < now()
    AND atraso = false;

  RETURN v_count;
END;
$$;

-- 2. Trigger function on insert/update of emprestimos
CREATE OR REPLACE FUNCTION public.check_emprestimo_atrasado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'ativo' AND NEW.data_prevista < CURRENT_DATE THEN
    NEW.status := 'atrasado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_emprestimo_atrasado ON public.emprestimos;
CREATE TRIGGER trg_check_emprestimo_atrasado
  BEFORE INSERT OR UPDATE OF data_prevista, status
  ON public.emprestimos
  FOR EACH ROW
  EXECUTE FUNCTION public.check_emprestimo_atrasado();

-- 3. Sync handle_new_user so it fills both nome/papel and full_name/role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_nome TEXT;
  v_role TEXT;
  v_papel TEXT;
BEGIN
  v_nome := COALESCE(
    NEW.raw_user_meta_data->>'nome',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  v_papel := COALESCE(
    NEW.raw_user_meta_data->>'papel',
    NEW.raw_user_meta_data->>'app_role',
    NEW.raw_user_meta_data->>'role',
    'leitor'
  );

  IF v_papel NOT IN ('admin', 'operador', 'leitor') THEN
    v_papel := 'leitor';
  END IF;

  v_role := v_papel;

  INSERT INTO public.profiles (id, email, nome, papel, full_name, role, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    v_nome,
    v_papel,
    v_nome,
    v_role,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      nome = EXCLUDED.nome,
      papel = EXCLUDED.papel,
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      avatar_url = EXCLUDED.avatar_url;

  RETURN NEW;
END;
$$;
