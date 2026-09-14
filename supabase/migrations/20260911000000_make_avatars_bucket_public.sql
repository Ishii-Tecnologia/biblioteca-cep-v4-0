-- Migration para restaurar o bucket 'avatars' como PÚBLICO e alinhar permissões de Storage com 'capas'
-- Resolvendo o problema onde fotos de perfil enviadas para o bucket 'avatars' não podiam ser lidas publicamente via getPublicUrl

-- 1. Garantir que os buckets 'avatars' e 'capas' sejam públicos
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('capas', 'capas', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Garantir políticas idênticas às de 'capas' para 'avatars'
DROP POLICY IF EXISTS "Avatars are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "avatars_select_policy" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_policy" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_policy" ON storage.objects;

-- SELECT: público (qualquer pessoa pode carregar avatar e capa)
CREATE POLICY "Avatars are publicly viewable" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- INSERT: usuários autenticados
CREATE POLICY "Authenticated users can upload avatars" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

-- UPDATE: usuários autenticados
CREATE POLICY "Authenticated users can update avatars" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');

-- DELETE: usuários autenticados
CREATE POLICY "Authenticated users can delete avatars" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars');
