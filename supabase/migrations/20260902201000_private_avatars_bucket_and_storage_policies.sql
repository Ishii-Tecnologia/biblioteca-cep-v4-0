-- =====================================================================
-- Migração de segurança do STORAGE
-- ---------------------------------------------------------------------
-- Objetivo:
--   • Bucket "avatars" passa a ser PRIVADO (public = false):
--       - dono do arquivo (owner = auth.uid(), pasta nomeada com o
--         próprio auth.uid()) lê/escreve/apaga os próprios arquivos;
--       - admin/operador gerenciam todos os avatares;
--       - anônimos NÃO têm mais acesso de leitura.
--   • Bucket "capas" continua PÚBLICO (capas dos livros são catálogo
--     aberto); escrita apenas para usuários autenticados de staff.
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Bucket avatars -> privado; bucket capas -> permanece público
-- ---------------------------------------------------------------------
update storage.buckets
set public = false
where id = 'avatars';

update storage.buckets
set public = true
where id = 'capas';

-- ---------------------------------------------------------------------
-- 2) Remover políticas antigas do bucket avatars (públicas/permissivas)
-- ---------------------------------------------------------------------
drop policy if exists "Avatars are publicly viewable" on storage.objects;
drop policy if exists "Authenticated users can upload avatars" on storage.objects;
drop policy if exists "Authenticated users can update avatars" on storage.objects;
drop policy if exists "Authenticated users can delete avatars" on storage.objects;

-- ---------------------------------------------------------------------
-- 3) Novas políticas do bucket AVATARS (privado)
--    Dono = (owner = auth.uid()) OU (a 1ª pasta do caminho é o próprio
--    auth.uid()). Staff (admin/operador) acessa qualquer avatar.
-- ---------------------------------------------------------------------

-- Leitura: dono ou staff
drop policy if exists "avatars_select_own_or_staff" on storage.objects;
create policy "avatars_select_own_or_staff" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or owner = auth.uid()
      or public.app_is_staff()
    )
  );

-- Upload: apenas na própria pasta (auth.uid()/...), ou staff
drop policy if exists "avatars_insert_own_or_staff" on storage.objects;
create policy "avatars_insert_own_or_staff" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.app_is_staff()
    )
  );

-- Atualização: dono ou staff
drop policy if exists "avatars_update_own_or_staff" on storage.objects;
create policy "avatars_update_own_or_staff" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or owner = auth.uid()
      or public.app_is_staff()
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or owner = auth.uid()
      or public.app_is_staff()
    )
  );

-- Exclusão: dono ou staff
drop policy if exists "avatars_delete_own_or_staff" on storage.objects;
create policy "avatars_delete_own_or_staff" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or owner = auth.uid()
      or public.app_is_staff()
    )
  );

-- ---------------------------------------------------------------------
-- 4) Políticas do bucket CAPAS (público para leitura, escrita só staff)
-- ---------------------------------------------------------------------
drop policy if exists "Capas are publicly viewable" on storage.objects;
create policy "Capas are publicly viewable" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'capas');

drop policy if exists "capas_insert_staff" on storage.objects;
create policy "capas_insert_staff" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'capas' and public.app_is_staff());

drop policy if exists "capas_update_staff" on storage.objects;
create policy "capas_update_staff" on storage.objects
  for update to authenticated
  using (bucket_id = 'capas' and public.app_is_staff())
  with check (bucket_id = 'capas' and public.app_is_staff());

drop policy if exists "capas_delete_staff" on storage.objects;
create policy "capas_delete_staff" on storage.objects
  for delete to authenticated
  using (bucket_id = 'capas' and public.app_is_staff());
