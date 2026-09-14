-- =====================================================================
-- Migração de segurança: RLS + políticas por papel + grants (anon)
-- Projeto: Biblioteca CEP v3.0
-- ---------------------------------------------------------------------
-- Resumo:
--   1. Ativa RLS nas 8 tabelas que estavam desprotegidas
--      (titulo, exemplar, emprestimo, reserva, leitor, profiles,
--       historico, parametros).
--   2. Remove todas as políticas permissivas "para todo authenticated /
--      public" (sufixo _all e equivalentes).
--   3. Cria um modelo de acesso por papel (profiles.papel):
--        anon            -> apenas SELECT no catálogo público
--        leitor          -> catálogo + linha própria em profiles/leitor +
--                           empréstimos/reservas/histórico próprios
--        admin/operador  -> acesso total (todas as operações)
--   4. Revoga INSERT/UPDATE/DELETE/TRUNCATE do role anon em todas as
--      tabelas do público e concede apenas SELECT nas de catálogo.
--   5. Mantém intactas as funções SECURITY DEFINER existentes
--      (emprestar_exemplar, devolver_exemplar, renovar_emprestimo,
--       delete_user, admin_reset_password, update_user_info,
--       confirm_user_email, atualizar_status_atrasos, etc.), que
--      continuam operando normalmente (bypassam RLS por definição).
--   6. Cria funções auxiliares (STABLE, SECURITY DEFINER, search_path
--      fixo, sem vazamento de segredos) para uso nas políticas.
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Funções auxiliares para políticas
-- ---------------------------------------------------------------------

-- Papel do usuário logado, via profiles.papel (fallback user_metadata).
create or replace function public.app_user_papel()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p.papel,
    p.role,
    nullif(
      coalesce(
        current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'papel',
        current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'app_role',
        current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'
      ),
      ''
    ),
    case when auth.uid() is null then 'anon' else 'leitor' end
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

-- Verdadeiro se o papel atual é admin ou operador.
create or replace function public.app_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_user_papel() in ('admin', 'operador');
$$;

grant execute on function public.app_user_papel() to anon, authenticated;
grant execute on function public.app_is_staff() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 1) Ativar RLS nas tabelas desprotegidas
-- ---------------------------------------------------------------------
alter table public.titulo     enable row level security;
alter table public.exemplar   enable row level security;
alter table public.emprestimo enable row level security;
alter table public.reserva    enable row level security;
alter table public.leitor     enable row level security;
alter table public.profiles   enable row level security;
alter table public.historico  enable row level security;
alter table public.parametros enable row level security;

-- ---------------------------------------------------------------------
-- 2) Remover políticas permissivas existentes (drop idempotente)
-- ---------------------------------------------------------------------

-- authors (RLS já ativo, mas com políticas "tudo liberado")
drop policy if exists "authors_select_all"  on public.authors;
drop policy if exists "authors_insert_all"  on public.authors;
drop policy if exists "authors_update_all"  on public.authors;
drop policy if exists "authors_delete_all"  on public.authors;

-- categorias (política de SELECT liberada para public)
drop policy if exists "categorias_select_all" on public.categorias;

-- titulo
drop policy if exists "titulo_select_all"  on public.titulo;
drop policy if exists "titulo_insert_all"  on public.titulo;
drop policy if exists "titulo_update_all"  on public.titulo;
drop policy if exists "titulo_delete_all"  on public.titulo;

-- exemplar
drop policy if exists "exemplar_select_all"  on public.exemplar;
drop policy if exists "exemplar_insert_all"  on public.exemplar;
drop policy if exists "exemplar_update_all"  on public.exemplar;
drop policy if exists "exemplar_delete_all"  on public.exemplar;

-- emprestimo
drop policy if exists "emprestimo_select_all"  on public.emprestimo;
drop policy if exists "emprestimo_insert_all"  on public.emprestimo;
drop policy if exists "emprestimo_update_all"  on public.emprestimo;
drop policy if exists "emprestimo_delete_all"  on public.emprestimo;

-- reserva
drop policy if exists "reserva_select_all"  on public.reserva;
drop policy if exists "reserva_insert_all"  on public.reserva;
drop policy if exists "reserva_update_all"  on public.reserva;
drop policy if exists "reserva_delete_all"  on public.reserva;

-- leitor
drop policy if exists "leitor_select_all"  on public.leitor;
drop policy if exists "leitor_insert_all"  on public.leitor;
drop policy if exists "leitor_update_all"  on public.leitor;
drop policy if exists "leitor_delete_all"  on public.leitor;

-- profiles (política liberada para public)
drop policy if exists "profiles_select_all" on public.profiles;

-- parametros (política de leitura pública)
drop policy if exists "parametros_select" on public.parametros;

-- ---------------------------------------------------------------------
-- 3) Catálogo público (titulo, exemplar, authors, categorias)
--    anon e authenticated: apenas SELECT.
--    Escrita: somente admin/operador.
-- ---------------------------------------------------------------------

-- ---------- titulo ----------
drop policy if exists "titulo_select_publico" on public.titulo;
create policy "titulo_select_publico" on public.titulo
  for select to anon, authenticated
  using (true);

drop policy if exists "titulo_insert_staff" on public.titulo;
create policy "titulo_insert_staff" on public.titulo
  for insert to authenticated
  with check (public.app_is_staff());

drop policy if exists "titulo_update_staff" on public.titulo;
create policy "titulo_update_staff" on public.titulo
  for update to authenticated
  using (public.app_is_staff())
  with check (public.app_is_staff());

drop policy if exists "titulo_delete_staff" on public.titulo;
create policy "titulo_delete_staff" on public.titulo
  for delete to authenticated
  using (public.app_is_staff());

-- ---------- exemplar ----------
drop policy if exists "exemplar_select_publico" on public.exemplar;
create policy "exemplar_select_publico" on public.exemplar
  for select to anon, authenticated
  using (true);

drop policy if exists "exemplar_insert_staff" on public.exemplar;
create policy "exemplar_insert_staff" on public.exemplar
  for insert to authenticated
  with check (public.app_is_staff());

drop policy if exists "exemplar_update_staff" on public.exemplar;
create policy "exemplar_update_staff" on public.exemplar
  for update to authenticated
  using (public.app_is_staff())
  with check (public.app_is_staff());

drop policy if exists "exemplar_delete_staff" on public.exemplar;
create policy "exemplar_delete_staff" on public.exemplar
  for delete to authenticated
  using (public.app_is_staff());

-- ---------- authors ----------
drop policy if exists "authors_select_publico" on public.authors;
create policy "authors_select_publico" on public.authors
  for select to anon, authenticated
  using (true);

drop policy if exists "authors_insert_staff" on public.authors;
create policy "authors_insert_staff" on public.authors
  for insert to authenticated
  with check (public.app_is_staff());

drop policy if exists "authors_update_staff" on public.authors;
create policy "authors_update_staff" on public.authors
  for update to authenticated
  using (public.app_is_staff())
  with check (public.app_is_staff());

drop policy if exists "authors_delete_staff" on public.authors;
create policy "authors_delete_staff" on public.authors
  for delete to authenticated
  using (public.app_is_staff());

-- ---------- categorias ----------
drop policy if exists "categorias_select_publico" on public.categorias;
create policy "categorias_select_publico" on public.categorias
  for select to anon, authenticated
  using (true);

drop policy if exists "categorias_insert_staff" on public.categorias;
create policy "categorias_insert_staff" on public.categorias
  for insert to authenticated
  with check (public.app_is_staff());

drop policy if exists "categorias_update_staff" on public.categorias;
create policy "categorias_update_staff" on public.categorias
  for update to authenticated
  using (public.app_is_staff())
  with check (public.app_is_staff());

drop policy if exists "categorias_delete_staff" on public.categorias;
create policy "categorias_delete_staff" on public.categorias
  for delete to authenticated
  using (public.app_is_staff());

-- ---------------------------------------------------------------------
-- 4) profiles — linha própria (id = auth.uid()); admin/operador veem tudo
-- ---------------------------------------------------------------------
drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.app_is_staff());

drop policy if exists "profiles_insert_self_or_staff" on public.profiles;
create policy "profiles_insert_self_or_staff" on public.profiles
  for insert to authenticated
  with check (id = auth.uid() or public.app_is_staff());

drop policy if exists "profiles_update_own_or_staff" on public.profiles;
create policy "profiles_update_own_or_staff" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.app_is_staff())
  with check (id = auth.uid() or public.app_is_staff());

drop policy if exists "profiles_delete_staff" on public.profiles;
create policy "profiles_delete_staff" on public.profiles
  for delete to authenticated
  using (public.app_is_staff());

-- ---------------------------------------------------------------------
-- 5) leitor — linha própria (id_auth = auth.uid()); staff gerencia tudo
-- ---------------------------------------------------------------------
drop policy if exists "leitor_select_own_or_staff" on public.leitor;
create policy "leitor_select_own_or_staff" on public.leitor
  for select to authenticated
  using (id_auth = auth.uid() or public.app_is_staff());

drop policy if exists "leitor_insert_self_or_staff" on public.leitor;
create policy "leitor_insert_self_or_staff" on public.leitor
  for insert to authenticated
  with check (id_auth = auth.uid() or public.app_is_staff());

drop policy if exists "leitor_update_own_or_staff" on public.leitor;
create policy "leitor_update_own_or_staff" on public.leitor
  for update to authenticated
  using (id_auth = auth.uid() or public.app_is_staff())
  with check (id_auth = auth.uid() or public.app_is_staff());

drop policy if exists "leitor_delete_staff" on public.leitor;
create policy "leitor_delete_staff" on public.leitor
  for delete to authenticated
  using (public.app_is_staff());

-- ---------------------------------------------------------------------
-- 6) emprestimo — o leitor vê/escreve apenas o seu; staff gerencia tudo
-- ---------------------------------------------------------------------
drop policy if exists "emprestimo_select_own_or_staff" on public.emprestimo;
create policy "emprestimo_select_own_or_staff" on public.emprestimo
  for select to authenticated
  using (
    id_leitor in (select l.id_leitor from public.leitor l where l.id_auth = auth.uid())
    or public.app_is_staff()
  );

drop policy if exists "emprestimo_insert_own_or_staff" on public.emprestimo;
create policy "emprestimo_insert_own_or_staff" on public.emprestimo
  for insert to authenticated
  with check (
    id_leitor in (select l.id_leitor from public.leitor l where l.id_auth = auth.uid())
    or public.app_is_staff()
  );

drop policy if exists "emprestimo_update_own_or_staff" on public.emprestimo;
create policy "emprestimo_update_own_or_staff" on public.emprestimo
  for update to authenticated
  using (
    id_leitor in (select l.id_leitor from public.leitor l where l.id_auth = auth.uid())
    or public.app_is_staff()
  )
  with check (
    id_leitor in (select l.id_leitor from public.leitor l where l.id_auth = auth.uid())
    or public.app_is_staff()
  );

drop policy if exists "emprestimo_delete_staff" on public.emprestimo;
create policy "emprestimo_delete_staff" on public.emprestimo
  for delete to authenticated
  using (public.app_is_staff());

-- ---------------------------------------------------------------------
-- 7) reserva — o leitor vê/escreve apenas a sua; staff gerencia tudo
-- ---------------------------------------------------------------------
drop policy if exists "reserva_select_own_or_staff" on public.reserva;
create policy "reserva_select_own_or_staff" on public.reserva
  for select to authenticated
  using (
    id_leitor in (select l.id_leitor from public.leitor l where l.id_auth = auth.uid())
    or public.app_is_staff()
  );

drop policy if exists "reserva_insert_own_or_staff" on public.reserva;
create policy "reserva_insert_own_or_staff" on public.reserva
  for insert to authenticated
  with check (
    id_leitor in (select l.id_leitor from public.leitor l where l.id_auth = auth.uid())
    or public.app_is_staff()
  );

drop policy if exists "reserva_update_own_or_staff" on public.reserva;
create policy "reserva_update_own_or_staff" on public.reserva
  for update to authenticated
  using (
    id_leitor in (select l.id_leitor from public.leitor l where l.id_auth = auth.uid())
    or public.app_is_staff()
  )
  with check (
    id_leitor in (select l.id_leitor from public.leitor l where l.id_auth = auth.uid())
    or public.app_is_staff()
  );

drop policy if exists "reserva_delete_staff" on public.reserva;
create policy "reserva_delete_staff" on public.reserva
  for delete to authenticated
  using (public.app_is_staff());

-- ---------------------------------------------------------------------
-- 8) historico — usuário vê o próprio (usuario_id OU id_leitor próprio);
--    staff lê/escreve tudo; nenhum usuário insere direto (serviço usa
--    RPC SECURITY DEFINER / service_role).
-- ---------------------------------------------------------------------
drop policy if exists "historico_select_own_or_staff" on public.historico;
create policy "historico_select_own_or_staff" on public.historico
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or id_leitor in (select l.id_leitor from public.leitor l where l.id_auth = auth.uid())
    or public.app_is_staff()
  );

drop policy if exists "historico_insert_staff" on public.historico;
create policy "historico_insert_staff" on public.historico
  for insert to authenticated
  with check (public.app_is_staff());

drop policy if exists "historico_update_staff" on public.historico;
create policy "historico_update_staff" on public.historico
  for update to authenticated
  using (public.app_is_staff())
  with check (public.app_is_staff());

drop policy if exists "historico_delete_staff" on public.historico;
create policy "historico_delete_staff" on public.historico
  for delete to authenticated
  using (public.app_is_staff());

-- ---------------------------------------------------------------------
-- 9) parametros — apenas admin/operador lê e escreve.
--    (O app lê os parâmetros de prazo via RPC SECURITY DEFINER, ex.:
--     verificar_atrasos_geral, ou com sessão de staff na área admin.)
-- ---------------------------------------------------------------------
drop policy if exists "parametros_select_staff" on public.parametros;
create policy "parametros_select_staff" on public.parametros
  for select to authenticated
  using (public.app_is_staff());

drop policy if exists "parametros_insert_staff" on public.parametros;
create policy "parametros_insert_staff" on public.parametros
  for insert to authenticated
  with check (public.app_is_staff());

drop policy if exists "parametros_update_staff" on public.parametros;
create policy "parametros_update_staff" on public.parametros
  for update to authenticated
  using (public.app_is_staff())
  with check (public.app_is_staff());

drop policy if exists "parametros_delete_staff" on public.parametros;
create policy "parametros_delete_staff" on public.parametros
  for delete to authenticated
  using (public.app_is_staff());

-- ---------------------------------------------------------------------
-- 10) GRANTS: anon não escreve em NADA; só lê catálogo
-- ---------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger on
  public.titulo,
  public.exemplar,
  public.emprestimo,
  public.reserva,
  public.leitor,
  public.profiles,
  public.historico,
  public.parametros,
  public.authors,
  public.categorias
from anon;

revoke all on
  public.emprestimo,
  public.reserva,
  public.leitor,
  public.profiles,
  public.historico,
  public.parametros
from anon;

grant select on
  public.titulo,
  public.exemplar,
  public.authors,
  public.categorias
to anon;
