-- Remover coluna cpf da tabela public.leitor (e public.profiles caso exista)
-- Garantir remoção segura e idempotente

DO $$
BEGIN
  -- 1. Se existir constraint ou índice único associado ao CPF em public.leitor, remover
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leitor'::regclass
      AND conname = 'leitor_cpf_key'
  ) THEN
    ALTER TABLE public.leitor DROP CONSTRAINT leitor_cpf_key;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'leitor'
      AND indexname = 'leitor_cpf_key'
  ) THEN
    DROP INDEX IF EXISTS public.leitor_cpf_key;
  END IF;

  -- 2. Remover coluna cpf da tabela public.leitor caso exista
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leitor'
      AND column_name = 'cpf'
  ) THEN
    ALTER TABLE public.leitor DROP COLUMN cpf;
  END IF;

  -- 3. Remover coluna cpf da tabela public.profiles caso exista
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'cpf'
  ) THEN
    ALTER TABLE public.profiles DROP COLUMN cpf;
  END IF;
END $$;
