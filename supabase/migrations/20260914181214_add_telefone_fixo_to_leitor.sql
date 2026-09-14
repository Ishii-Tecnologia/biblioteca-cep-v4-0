-- Migration: add_telefone_fixo_to_leitor_and_profiles
-- Adiciona suporte a telefone fixo para leitores e perfis

ALTER TABLE public.leitor
  ADD COLUMN IF NOT EXISTS telefone_fixo VARCHAR(20) NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telefone_fixo TEXT NULL;

-- Assegurar que cpf em public.leitor seja anulável (já era, mas garantindo)
ALTER TABLE public.leitor
  ALTER COLUMN cpf DROP NOT NULL;
