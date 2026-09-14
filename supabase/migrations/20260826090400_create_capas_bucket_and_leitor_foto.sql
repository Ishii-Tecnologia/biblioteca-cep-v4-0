-- Migration para criar bucket de capas de livros, ajustar bucket avatars e adicionar coluna de foto no leitor
-- Idempotent migration

-- 1. Adicionar coluna foto na tabela leitor se não existir
ALTER TABLE public.leitor ADD COLUMN IF NOT EXISTS foto TEXT;

-- 2. Criar bucket 'capas' no Supabase Storage se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('capas', 'capas', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Garantir que bucket 'avatars' também seja público
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. Políticas de Storage para 'capas'
DROP POLICY IF EXISTS "Capas are publicly viewable" ON storage.objects;
CREATE POLICY "Capas are publicly viewable" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'capas');

DROP POLICY IF EXISTS "Authenticated users can upload capas" ON storage.objects;
CREATE POLICY "Authenticated users can upload capas" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'capas');

DROP POLICY IF EXISTS "Authenticated users can update capas" ON storage.objects;
CREATE POLICY "Authenticated users can update capas" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'capas');

DROP POLICY IF EXISTS "Authenticated users can delete capas" ON storage.objects;
CREATE POLICY "Authenticated users can delete capas" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'capas');

-- Políticas públicas adicionais para 'avatars' para garantir leitura pública e escrita por autenticados
DROP POLICY IF EXISTS "Avatars are publicly viewable" ON storage.objects;
CREATE POLICY "Avatars are publicly viewable" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatars" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
CREATE POLICY "Authenticated users can update avatars" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;
CREATE POLICY "Authenticated users can delete avatars" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars');
