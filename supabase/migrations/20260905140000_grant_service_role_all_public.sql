-- Conceder permissões completas para a role service_role em todas as tabelas e sequências do schema public.
-- Isto é essencial para que Edge Functions e processos administrativos usando SUPABASE_SERVICE_ROLE_KEY
-- possam realizar operações administrativas (como consultas/atualizações em parametros, historico, job_execucoes, etc.)
-- sem esbarrar em 'permission denied for table'.

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;
