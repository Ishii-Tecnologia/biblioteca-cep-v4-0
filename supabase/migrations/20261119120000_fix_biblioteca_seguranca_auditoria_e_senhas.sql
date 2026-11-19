-- ============================================================================
-- Migration: 20261119120000_fix_biblioteca_seguranca_auditoria_e_senhas.sql
-- ============================================================================
-- Corrige três problemas identificados no mapeamento técnico da Biblioteca CEP:
--
--   1) CRÍTICO — Senha padrão publicada.
--      `recreate_seed_users` gravou a senha `Skip@Pass` em texto na migração.
--      Qualquer pessoa com acesso ao repositório conhece a senha das contas
--      admin@cep.edu.br e leitor@cep.edu.br. Esta migração rotaciona a senha de
--      TODA conta que ainda use essa senha (não só as duas de seed) e marca o
--      perfil para definir uma nova no próximo acesso.
--
--   2) CRÍTICO — Auditoria forjável.
--      `auditoria_transicoes` tinha policy de INSERT `WITH CHECK (true)` para
--      `authenticated`: qualquer usuário logado podia inserir registros de
--      auditoria falsos. A escrita direta é revogada; o único caminho passa a
--      ser uma RPC SECURITY DEFINER que exige staff e deriva a identidade do
--      operador do próprio JWT (não aceita nome/ID informados pelo cliente).
--
--   3) Testes contra o banco de produção.
--      Resolvido no código (ver src/services/__tests__/), não no banco.
--
-- ATENÇÃO ANTES DE APLICAR: se `admin@cep.edu.br` for a única conta de
-- administrador em uso, a rotação deixa essa conta sem senha conhecida. Nesse
-- caso o acesso se recupera pelo painel do Supabase (reset de senha) ou por
-- outra conta admin via RPC admin_reset_password.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) ROTACIONAR A SENHA PADRÃO PUBLICADA
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $rotacionar$
DECLARE
  v_senha_publicada constant text := 'Skip@Pass';
  v_nova_senha text;
  v_conta record;
  v_total int := 0;
BEGIN
  FOR v_conta IN
    SELECT u.id, u.email
      FROM auth.users u
     WHERE coalesce(u.encrypted_password, '') <> ''
       -- A conta ainda usa exatamente a senha publicada?
       AND u.encrypted_password::text = extensions.crypt(v_senha_publicada, u.encrypted_password::text)
  LOOP
    -- Senha aleatória de 32 bytes em base64: ninguém a conhece, nem o repositório.
    v_nova_senha := encode(extensions.gen_random_bytes(24), 'base64');

    UPDATE auth.users
       SET encrypted_password = extensions.crypt(v_nova_senha, extensions.gen_salt('bf', 10)),
           updated_at = now()
     WHERE id = v_conta.id;

    -- Obriga a definição de uma nova senha no próximo acesso.
    UPDATE public.profiles
       SET senha_redefinida = false,
           primeiro_acesso_pendente = true,
           senha_alterada_em = now()
     WHERE id = v_conta.id;

    -- Registra a rotação na própria trilha de auditoria.
    INSERT INTO public.auditoria_transicoes (
      entidade, registro_id, estado_anterior, estado_novo,
      operador_id, operador_nome, motivo, payload
    ) VALUES (
      'usuario',
      coalesce(v_conta.email, v_conta.id::text),
      'senha_padrao_publicada',
      'senha_rotacionada',
      'migracao',
      'Migração de segurança',
      'Senha padrão "Skip@Pass" (publicada em migração) rotacionada automaticamente.',
      jsonb_build_object('user_id', v_conta.id, 'email', v_conta.email)
    );

    v_total := v_total + 1;
  END LOOP;

  RAISE NOTICE 'Contas com senha padrão rotacionadas: %', v_total;
END
$rotacionar$;

-- ----------------------------------------------------------------------------
-- 2) FECHAR A ESCRITA DIRETA NA AUDITORIA
-- ----------------------------------------------------------------------------

-- Remove a policy permissiva: sem policy de INSERT, o RLS nega a escrita direta.
DROP POLICY IF EXISTS "Inserção de auditoria por autenticados" ON public.auditoria_transicoes;
DROP POLICY IF EXISTS "Insercao de auditoria por autenticados" ON public.auditoria_transicoes;

-- Revoga o privilégio de INSERT/UPDATE/DELETE do cliente. Leitura continua
-- disponível para staff pela policy "Leitura de auditoria por staff".
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.auditoria_transicoes FROM anon, authenticated;

-- Garante que a leitura segue restrita a staff (idempotente).
DROP POLICY IF EXISTS "Leitura de auditoria por staff" ON public.auditoria_transicoes;
CREATE POLICY "Leitura de auditoria por staff" ON public.auditoria_transicoes
  FOR SELECT TO authenticated
  USING (public.app_is_staff());

-- ----------------------------------------------------------------------------
-- 3) CAMINHO ÚNICO DE ESCRITA: RPC restrita a staff, identidade vinda do JWT
-- ----------------------------------------------------------------------------
-- O cliente não informa quem é o operador: a função lê auth.uid() e o nome em
-- public.profiles. Assim um registro de auditoria não pode ser atribuído a
-- outra pessoa.
CREATE OR REPLACE FUNCTION public.app_registrar_auditoria(
  p_entidade text,
  p_registro_id text,
  p_estado_anterior text,
  p_estado_novo text,
  p_motivo text DEFAULT NULL,
  p_payload jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'Acesso negado: apenas operadores e administradores registram transições de auditoria.';
  END IF;

  IF coalesce(trim(p_entidade), '') = '' OR coalesce(trim(p_registro_id), '') = '' THEN
    RAISE EXCEPTION 'Entidade e registro são obrigatórios.';
  END IF;

  IF coalesce(trim(p_estado_novo), '') = '' THEN
    RAISE EXCEPTION 'O estado novo é obrigatório.';
  END IF;

  SELECT coalesce(nullif(trim(p.nome), ''), nullif(trim(p.full_name), ''), p.email, 'Operador')
    INTO v_nome
    FROM public.profiles p
   WHERE p.id = v_uid
   LIMIT 1;

  INSERT INTO public.auditoria_transicoes (
    entidade, registro_id, estado_anterior, estado_novo,
    operador_id, operador_nome, motivo, payload
  ) VALUES (
    left(trim(p_entidade), 50),
    left(trim(p_registro_id), 100),
    left(nullif(trim(p_estado_anterior), ''), 50),
    left(trim(p_estado_novo), 50),
    v_uid::text,
    left(coalesce(v_nome, 'Operador'), 255),
    p_motivo,
    p_payload
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.app_registrar_auditoria(text, text, text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.app_registrar_auditoria(text, text, text, text, text, jsonb) TO authenticated, service_role;

COMMIT;
