-- Alter public.historico.entidade_id column type from uuid to text

-- 1. Drop dependent index
DROP INDEX IF EXISTS public.idx_historico_entidade;

-- 2. Alter column type to text
ALTER TABLE public.historico 
  ALTER COLUMN entidade_id TYPE TEXT USING entidade_id::TEXT;

-- 3. Recreate index
CREATE INDEX IF NOT EXISTS idx_historico_entidade ON public.historico(entidade_tipo, entidade_id);
