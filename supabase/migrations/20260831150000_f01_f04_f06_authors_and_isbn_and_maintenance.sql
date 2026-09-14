-- Migration: 20260831150000_f01_f04_f06_authors_and_isbn_and_maintenance.sql
-- Description: Criação da tabela authors, colunas de autor espiritual/médium na tabela titulo,
-- validação de ISBN e políticas RLS.

-- 1. Criar tabela authors (F-06 e F-04)
CREATE TABLE IF NOT EXISTS public.authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'ENCARNADO' CHECK (type IN ('ESPIRITO', 'ENCARNADO', 'MEDIUM', 'OUTRO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_authors_name_type UNIQUE (name, type)
);

-- Habilitar RLS e criar políticas idempotentes
ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authors_select_all" ON public.authors;
CREATE POLICY "authors_select_all" ON public.authors
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "authors_insert_all" ON public.authors;
CREATE POLICY "authors_insert_all" ON public.authors
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "authors_update_all" ON public.authors;
CREATE POLICY "authors_update_all" ON public.authors
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authors_delete_all" ON public.authors;
CREATE POLICY "authors_delete_all" ON public.authors
  FOR DELETE USING (true);

-- Criar índices para busca rápida e incremental de autores
CREATE INDEX IF NOT EXISTS idx_authors_name_trgm ON public.authors (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_authors_type ON public.authors (type);

-- 2. Adicionar colunas autor_espiritual, autor_mediunico e author_id à tabela titulo (F-04)
ALTER TABLE public.titulo ADD COLUMN IF NOT EXISTS autor_espiritual TEXT;
ALTER TABLE public.titulo ADD COLUMN IF NOT EXISTS autor_mediunico TEXT;
ALTER TABLE public.titulo ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES public.authors(id) ON DELETE SET NULL;

-- 3. Popular a tabela authors com autores conhecidos da base e da literatura espírita / geral
DO $$
BEGIN
  -- Insere autores espirituais clássicos
  INSERT INTO public.authors (name, type) VALUES
    ('André Luiz', 'ESPIRITO'),
    ('Emmanuel', 'ESPIRITO'),
    ('Humberto de Campos', 'ESPIRITO'),
    ('Irmão X', 'ESPIRITO'),
    ('Neio Lúcio', 'ESPIRITO'),
    ('Joanna de Ângelis', 'ESPIRITO'),
    ('Manoel Philomeno de Miranda', 'ESPIRITO'),
    ('Camilo Castelo Branco', 'ESPIRITO'),
    ('Léon Denis', 'ESPIRITO'),
    ('Victor Hugo', 'ESPIRITO')
  ON CONFLICT (name, type) DO NOTHING;

  -- Insere médiuns e autores encarnados clássicos
  INSERT INTO public.authors (name, type) VALUES
    ('Chico Xavier', 'MEDIUM'),
    ('Francisco Cândido Xavier', 'MEDIUM'),
    ('Divaldo Franco', 'MEDIUM'),
    ('Divaldo Pereira Franco', 'MEDIUM'),
    ('Yvonne do Amaral Pereira', 'MEDIUM'),
    ('Allan Kardec', 'ENCARNADO'),
    ('Marcel Souto Maior', 'ENCARNADO'),
    ('Leon Denis', 'ENCARNADO'),
    ('Gabriel Delanne', 'ENCARNADO'),
    ('Camille Flammarion', 'ENCARNADO'),
    ('Hermínio C. Miranda', 'ENCARNADO'),
    ('Carlos Bernardo Loureiro', 'ENCARNADO'),
    ('Machado de Assis', 'ENCARNADO'),
    ('Monteiro Lobato', 'ENCARNADO')
  ON CONFLICT (name, type) DO NOTHING;

  -- Migrar autores existentes em public.titulo para public.authors
  INSERT INTO public.authors (name, type)
  SELECT DISTINCT
    TRIM(autor) AS name,
    'ENCARNADO' AS type
  FROM public.titulo
  WHERE autor IS NOT NULL AND TRIM(autor) <> ''
  ON CONFLICT (name, type) DO NOTHING;
END $$;

-- 4. Atualizar registros existentes em public.titulo para preencher autor_espiritual e autor_mediunico quando aplicável
UPDATE public.titulo
SET autor_espiritual = 'André Luiz', autor_mediunico = 'Chico Xavier'
WHERE id_titulo IN ('CX001', 'CX002', 'CX004') AND (autor_espiritual IS NULL OR autor_espiritual = '');

UPDATE public.titulo
SET autor_espiritual = 'Emmanuel', autor_mediunico = 'Chico Xavier'
WHERE id_titulo = 'CX003' AND (autor_espiritual IS NULL OR autor_espiritual = '');

UPDATE public.titulo
SET autor_espiritual = 'Camilo Castelo Branco', autor_mediunico = 'Yvonne do Amaral Pereira'
WHERE id_titulo = 'DF001' AND (autor_espiritual IS NULL OR autor_espiritual = '');

UPDATE public.titulo
SET autor_espiritual = 'Neio Lúcio', autor_mediunico = 'Chico Xavier'
WHERE id_titulo = 'FR-107' AND (autor_espiritual IS NULL OR autor_espiritual = '');

UPDATE public.titulo
SET autor_espiritual = 'Joanna de Ângelis', autor_mediunico = 'Divaldo Franco'
WHERE id_titulo = 'DV-JA001' AND (autor_espiritual IS NULL OR autor_espiritual = '');
