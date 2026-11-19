-- ============================================================================
-- Migration: 20261119120000_fix_biblioteca_seguranca_auditoria_e_senhas.sql
-- ============================================================================
-- Corrige dois problemas críticos do mapeamento técnico da Biblioteca CEP:
--
--   1) Senha padrão publicada. `recreate_seed_users` gravou `Skip@Pass` em
--      texto na migração. Esta migração rotaciona a senha de toda conta que
--      ainda use essa senha e força a definição de uma nova no próximo acesso.
--
--   2) Auditoria forjável. `auditoria_transicoes` tinha policy de INSERT com
--      `WITH CHECK (true)` para `authenticated`. A escrita direta é revogada e
--      o único caminho passa a ser uma RPC SECURITY DEFINER que exige staff e
--      deriva o operador do JWT.
--
--   3) Testes contra o banco de produção: resolvido no código
--      (src/services/__tests__/), não no banco.
--
-- ATENÇÃO: se admin@cep.edu.br for a única conta administradora em uso, a
-- rotação a deixa sem senha conhecida. Recupere pelo painel do Supabase ou por
-- outra conta admin via RPC admin_reset_password.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) ROTACIONAR A SENHA PADRÃO PUBLICADA
-- ----------------------------------------------------------------------------
-- pgcrypto é instalado em schema variável conforme o ambiente (public ou
-- extensions). O search_path abaixo cobre os dois casos.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

SET LOCAL search_path = public, extensions;

DO $rotacionar$
DECLARE
  v_senha_publicada text := 'Skip@Pass';
  v_nova_senha text;
  v_conta record;
  v_total int := 0;
BEGIN
  FOR v_conta IN
    SELECT u.id, u.email, u.encrypted_password::text AS hash_atual
      FROM auth.users u
     WHERE coalesce(u.encrypted_password::text, '') <> ''
  LOOP
    -- A conta ainda aceita a senha publicada?
    CONTINUE WHEN v_conta.hash_atual <> crypt(v_senha_publicada, v_conta.hash_atual);

    -- Senha aleatória: ninguém a conhece, nem o repositório.
    v_nova_senha := encode(gen_random_bytes(24), 'base64');

    UPDATE auth.users
       SET encrypted_password = crypt(v_nova_senha, gen_salt('bf', 10)),
           updated_at = now()
     WHERE id = v_conta.id;

    -- Obriga definir uma nova senha no próximo acesso.
    UPDATE public.profiles
       SET senha_redefinida = false,
           primeiro_acesso_pendente = true,
           senha_alterada_em = now()
     WHERE id = v_conta.id;

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
DROP POLICY IF EXISTS "Inserção de auditoria por autenticados" ON public.auditoria_transicoes;
DROP POLICY IF EXISTS "Insercao de auditoria por autenticados" ON public.auditoria_transicoes;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.auditoria_transicoes FROM anon, authenticated;

DROP POLICY IF EXISTS "Leitura de auditoria por staff" ON public.auditoria_transicoes;
CREATE POLICY "Leitura de auditoria por staff" ON public.auditoria_transicoes
  FOR SELECT TO authenticated
  USING (public.app_is_staff());

-- ----------------------------------------------------------------------------
-- 3) CAMINHO ÚNICO DE ESCRITA: RPC restrita a staff, identidade vinda do JWT
-- ----------------------------------------------------------------------------
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
