-- Create profiles table or replace handle_new_user so inserting into auth.users won't fail
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'member',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 1. Improve current_profile function to handle both app_role and role in JWT
CREATE OR REPLACE FUNCTION public.current_profile()
RETURNS text
LANGUAGE sql
STABLE
AS $$
SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'app_role'),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'app_role'),
    (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role'),
    'admin' -- Default to admin if authenticated without specific role, or when running direct operations
);
$$;

-- 2. Seed initial admin user ishii7883@gmail.com and default demo users if not exists
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Seed ishii7883@gmail.com
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'ishii7883@gmail.com') THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'ishii7883@gmail.com',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"role": "admin", "app_role": "admin", "full_name": "Administrador Ishii"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL,
      '', '', ''
    );

    INSERT INTO public.leitor (id_auth, cpf, nome_do_leitor, email, telefone, data_cadastro, bloqueado)
    VALUES (v_user_id, '000.000.000-00', 'Administrador Ishii', 'ishii7883@gmail.com', '(41) 99999-0000', CURRENT_DATE, false)
    ON CONFLICT (email) DO NOTHING;
  END IF;

  -- Ensure admin@cep.edu.br has correct password and role
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@cep.edu.br') THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'admin@cep.edu.br',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"role": "admin", "app_role": "admin", "full_name": "Profª Helena Vasconcelos"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL,
      '', '', ''
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt('Skip@Pass', gen_salt('bf')),
        raw_user_meta_data = '{"role": "admin", "app_role": "admin", "full_name": "Profª Helena Vasconcelos"}'
    WHERE email = 'admin@cep.edu.br';
  END IF;

  -- Ensure leitor@cep.edu.br has correct password and role
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'leitor@cep.edu.br') THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'leitor@cep.edu.br',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"role": "member", "app_role": "leitor", "full_name": "Lucas Mendes"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL,
      '', '', ''
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt('Skip@Pass', gen_salt('bf')),
        raw_user_meta_data = '{"role": "member", "app_role": "leitor", "full_name": "Lucas Mendes"}'
    WHERE email = 'leitor@cep.edu.br';
  END IF;

END $$;

-- 3. Update RLS policies to allow anon and authenticated read of public data (titles, exemplares, params)
-- and full management for authenticated users
DROP POLICY IF EXISTS "titulo_select_all" ON public.titulo;
CREATE POLICY "titulo_select_all" ON public.titulo
  FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "titulo_insert_all" ON public.titulo;
CREATE POLICY "titulo_insert_all" ON public.titulo
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "titulo_update_all" ON public.titulo;
CREATE POLICY "titulo_update_all" ON public.titulo
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "titulo_delete_all" ON public.titulo;
CREATE POLICY "titulo_delete_all" ON public.titulo
  FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "exemplar_select_all" ON public.exemplar;
CREATE POLICY "exemplar_select_all" ON public.exemplar
  FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "exemplar_insert_all" ON public.exemplar;
CREATE POLICY "exemplar_insert_all" ON public.exemplar
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "exemplar_update_all" ON public.exemplar;
CREATE POLICY "exemplar_update_all" ON public.exemplar
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "exemplar_delete_all" ON public.exemplar;
CREATE POLICY "exemplar_delete_all" ON public.exemplar
  FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "leitor_select_all" ON public.leitor;
CREATE POLICY "leitor_select_all" ON public.leitor
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "leitor_insert_all" ON public.leitor;
CREATE POLICY "leitor_insert_all" ON public.leitor
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "leitor_update_all" ON public.leitor;
CREATE POLICY "leitor_update_all" ON public.leitor
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "leitor_delete_all" ON public.leitor;
CREATE POLICY "leitor_delete_all" ON public.leitor
  FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "emprestimo_select_all" ON public.emprestimo;
CREATE POLICY "emprestimo_select_all" ON public.emprestimo
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "emprestimo_insert_all" ON public.emprestimo;
CREATE POLICY "emprestimo_insert_all" ON public.emprestimo
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "emprestimo_update_all" ON public.emprestimo;
CREATE POLICY "emprestimo_update_all" ON public.emprestimo
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "emprestimo_delete_all" ON public.emprestimo;
CREATE POLICY "emprestimo_delete_all" ON public.emprestimo
  FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reserva_select_all" ON public.reserva;
CREATE POLICY "reserva_select_all" ON public.reserva
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reserva_insert_all" ON public.reserva;
CREATE POLICY "reserva_insert_all" ON public.reserva
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "reserva_update_all" ON public.reserva;
CREATE POLICY "reserva_update_all" ON public.reserva
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "reserva_delete_all" ON public.reserva;
CREATE POLICY "reserva_delete_all" ON public.reserva
  FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "historico_select_all" ON public.historico_movimentacao;
CREATE POLICY "historico_select_all" ON public.historico_movimentacao
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "historico_insert_all" ON public.historico_movimentacao;
CREATE POLICY "historico_insert_all" ON public.historico_movimentacao
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "parametro_select_all" ON public.parametro_sistema;
CREATE POLICY "parametro_select_all" ON public.parametro_sistema
  FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "parametro_all_auth" ON public.parametro_sistema;
CREATE POLICY "parametro_all_auth" ON public.parametro_sistema
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
