-- Migration para deletar os 3 usuários seed antigos do banco de dados:
-- 1. admin@cep.edu.br (a0000000-0000-0000-0000-000000000001)
-- 2. leitor@cep.edu.br (a0000000-0000-0000-0000-000000000002)
-- 3. ishii7883@gmail.com (62dcf30d-c91a-49e9-ab1b-ca0313fb7ca5)

DO $$
BEGIN
  -- Remover registros dependentes em tabelas públicas caso existam
  DELETE FROM public.historico
  WHERE usuario_id IN (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    '62dcf30d-c91a-49e9-ab1b-ca0313fb7ca5'::uuid
  );

  DELETE FROM public.leitor
  WHERE id_auth IN (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    '62dcf30d-c91a-49e9-ab1b-ca0313fb7ca5'::uuid
  )
  OR email IN ('admin@cep.edu.br', 'leitor@cep.edu.br', 'ishii7883@gmail.com');

  -- 3. Deletar de public.profiles
  DELETE FROM public.profiles
  WHERE id IN (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    '62dcf30d-c91a-49e9-ab1b-ca0313fb7ca5'::uuid
  )
  OR email IN ('admin@cep.edu.br', 'leitor@cep.edu.br', 'ishii7883@gmail.com');

  -- 1. Deletar de auth.identities
  DELETE FROM auth.identities
  WHERE user_id IN (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    '62dcf30d-c91a-49e9-ab1b-ca0313fb7ca5'::uuid
  );

  -- 2. Deletar de auth.users
  DELETE FROM auth.users
  WHERE id IN (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    '62dcf30d-c91a-49e9-ab1b-ca0313fb7ca5'::uuid
  )
  OR email IN ('admin@cep.edu.br', 'leitor@cep.edu.br', 'ishii7883@gmail.com');
END $$;
