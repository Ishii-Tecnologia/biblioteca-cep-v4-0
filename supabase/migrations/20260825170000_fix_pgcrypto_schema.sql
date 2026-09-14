-- Mover pgcrypto do schema extensions para o schema public
-- O GoTrue do Supabase não encontra crypt() quando está no schema extensions
DROP EXTENSION IF EXISTS pgcrypto;
CREATE EXTENSION pgcrypto SCHEMA public;
