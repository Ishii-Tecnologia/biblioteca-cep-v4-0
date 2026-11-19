-- Adiciona o campo "Condição" (estado de conservação física) aos exemplares.
-- Opções de negócio: Ótimo, Bom, Regular, Ruim, Péssimo — padrão "Bom".
ALTER TABLE public.exemplar
  ADD COLUMN IF NOT EXISTS condicao character varying NOT NULL DEFAULT 'Bom';

-- Garante que exemplares existentes (criados antes da coluna) fiquem com "Bom"
UPDATE public.exemplar
SET condicao = 'Bom'
WHERE condicao IS NULL OR condicao = '';

-- Restaura os grants DML padrão já usados pelo projeto nesta tabela
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exemplar TO anon, authenticated;
