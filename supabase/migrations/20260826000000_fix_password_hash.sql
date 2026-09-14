-- Garantir extensão pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Corrigir hash das senhas dos usuários seed para formato compatível com GoTrue (10 iterações / $2a$10$)
UPDATE auth.users
SET encrypted_password = extensions.crypt('Skip@Pass', extensions.gen_salt('bf', 10))
WHERE email IN ('admin@cep.edu.br', 'leitor@cep.edu.br', 'ishii7883@gmail.com');
