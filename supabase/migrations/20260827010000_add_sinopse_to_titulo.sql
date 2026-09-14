-- Adiciona a coluna sinopse na tabela titulo
ALTER TABLE public.titulo ADD COLUMN IF NOT EXISTS sinopse TEXT;
