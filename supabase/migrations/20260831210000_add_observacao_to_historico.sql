-- Adiciona coluna de observacao na tabela historico
ALTER TABLE public.historico ADD COLUMN IF NOT EXISTS observacao text;
