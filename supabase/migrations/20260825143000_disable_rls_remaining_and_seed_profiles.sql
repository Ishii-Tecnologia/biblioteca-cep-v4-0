-- Disable RLS on remaining tables: historico, parametros, profiles
ALTER TABLE public.historico DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.parametros DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Grant SELECT, INSERT, UPDATE, DELETE permissions to anon and authenticated roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parametros TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated;

-- Insert/Upsert missing profiles for seed users
INSERT INTO public.profiles (id, email, nome, full_name, papel, role, bloqueado)
SELECT
  id,
  'admin@cep.edu.br',
  'Profª Helena',
  'Profª Helena',
  'admin',
  'admin',
  false
FROM auth.users
WHERE email = 'admin@cep.edu.br'
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  full_name = EXCLUDED.full_name,
  papel = EXCLUDED.papel,
  role = EXCLUDED.role,
  email = EXCLUDED.email;

INSERT INTO public.profiles (id, email, nome, full_name, papel, role, bloqueado)
SELECT
  id,
  'leitor@cep.edu.br',
  'Lucas Mendes',
  'Lucas Mendes',
  'leitor',
  'leitor',
  false
FROM auth.users
WHERE email = 'leitor@cep.edu.br'
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  full_name = EXCLUDED.full_name,
  papel = EXCLUDED.papel,
  role = EXCLUDED.role,
  email = EXCLUDED.email;
