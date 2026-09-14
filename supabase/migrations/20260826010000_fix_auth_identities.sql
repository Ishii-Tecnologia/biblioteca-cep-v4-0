-- Inserir registros em auth.identities para os usuários seed (admin@cep.edu.br e leitor@cep.edu.br)
-- Nota: a coluna "email" em auth.identities é gerada automaticamente (ALWAYS GENERATED: lower(identity_data->>'email'))

INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  provider,
  identity_data,
  created_at,
  updated_at,
  last_sign_in_at
) VALUES
(
  gen_random_uuid(),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'a0000000-0000-0000-0000-000000000001',
  'email',
  jsonb_build_object(
    'sub', 'a0000000-0000-0000-0000-000000000001',
    'email', 'admin@cep.edu.br',
    'role', 'admin',
    'app_role', 'admin',
    'full_name', 'Profª Helena Vasconcelos',
    'email_verified', true
  ),
  now(),
  now(),
  now()
),
(
  gen_random_uuid(),
  'a0000000-0000-0000-0000-000000000002'::uuid,
  'a0000000-0000-0000-0000-000000000002',
  'email',
  jsonb_build_object(
    'sub', 'a0000000-0000-0000-0000-000000000002',
    'email', 'leitor@cep.edu.br',
    'role', 'member',
    'app_role', 'leitor',
    'full_name', 'Lucas Mendes',
    'email_verified', true
  ),
  now(),
  now(),
  now()
)
ON CONFLICT (provider_id, provider) DO NOTHING;
