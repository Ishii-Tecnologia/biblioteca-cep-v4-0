-- Migration: fix_leitor_curso_persistence_and_approval
-- Garante que:
-- 1. Permissões de RLS e GRANT na tabela public.leitor_curso permitam:
--    - Inserção/exclusão por operadores e admins (app_is_staff / current_profile() / admin)
--    - Inserção/exclusão por usuários autenticados para seu próprio leitor (id_auth = auth.uid())
--    - Inserção/exclusão no auto-cadastro anônimo para registros pendentes
-- 2. Na aprovação de leitores pendentes (função aprovar_cadastro_leitor):
--    - O campo curso da tabela leitor é sincronizado com public.profiles
--    - Os vínculos existentes em leitor_curso são mantidos intactos e validados
--    - Se houver leitor.curso mas nenhum vínculo em leitor_curso, vincula automaticamente
--    - Se houver vínculo em leitor_curso mas leitor.curso estiver nulo, preenche leitor.curso
-- 3. Sincronização segura para garantir que nenhum curso selecionado se perca em nenhum fluxo.

-- 1. Permissões de GRANT na tabela leitor_curso
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leitor_curso TO anon, authenticated, service_role;

-- 2. RLS Policies para public.leitor_curso
ALTER TABLE public.leitor_curso ENABLE ROW LEVEL SECURITY;

-- Leitura: aberta a todos para leitura pública/autenticada
DROP POLICY IF EXISTS "leitor_curso_select_all" ON public.leitor_curso;
DROP POLICY IF EXISTS "leitor_curso_select_authenticated" ON public.leitor_curso;
CREATE POLICY "leitor_curso_select_all" ON public.leitor_curso
  FOR SELECT TO anon, authenticated
  USING (true);

-- Inserção: staff (admin/operador), próprio leitor autenticado (id_auth = auth.uid()), ou leitor pendente (anon ou auth)
DROP POLICY IF EXISTS "leitor_curso_insert_staff" ON public.leitor_curso;
DROP POLICY IF EXISTS "leitor_curso_insert_anon" ON public.leitor_curso;
DROP POLICY IF EXISTS "leitor_curso_insert_policy" ON public.leitor_curso;

CREATE POLICY "leitor_curso_insert_policy" ON public.leitor_curso
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    -- Caso 1: Staff autenticado
    (auth.role() = 'authenticated' AND (
      public.app_is_staff()
      OR public.current_profile() = ANY (ARRAY['admin'::text, 'operador'::text])
      OR public.app_user_papel() = ANY (ARRAY['admin'::text, 'operador'::text])
    ))
    -- Caso 2: Próprio leitor autenticado inserindo em seu cadastro
    OR (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1 FROM public.leitor l
      WHERE l.id_leitor = leitor_curso.id_leitor
        AND l.id_auth = auth.uid()
    ))
    -- Caso 3: Cadastro de leitor pendente (auto-cadastro público ou pendente)
    OR EXISTS (
      SELECT 1 FROM public.leitor l
      WHERE l.id_leitor = leitor_curso.id_leitor
        AND l.status_cadastro = 'pendente'
    )
  );

-- Atualização: staff ou próprio leitor
DROP POLICY IF EXISTS "leitor_curso_update_staff" ON public.leitor_curso;
DROP POLICY IF EXISTS "leitor_curso_update_policy" ON public.leitor_curso;

CREATE POLICY "leitor_curso_update_policy" ON public.leitor_curso
  FOR UPDATE TO anon, authenticated
  USING (
    (auth.role() = 'authenticated' AND (
      public.app_is_staff()
      OR public.current_profile() = ANY (ARRAY['admin'::text, 'operador'::text])
      OR public.app_user_papel() = ANY (ARRAY['admin'::text, 'operador'::text])
      OR EXISTS (
        SELECT 1 FROM public.leitor l
        WHERE l.id_leitor = leitor_curso.id_leitor
          AND l.id_auth = auth.uid()
      )
    ))
    OR EXISTS (
      SELECT 1 FROM public.leitor l
      WHERE l.id_leitor = leitor_curso.id_leitor
        AND l.status_cadastro = 'pendente'
    )
  )
  WITH CHECK (
    (auth.role() = 'authenticated' AND (
      public.app_is_staff()
      OR public.current_profile() = ANY (ARRAY['admin'::text, 'operador'::text])
      OR public.app_user_papel() = ANY (ARRAY['admin'::text, 'operador'::text])
      OR EXISTS (
        SELECT 1 FROM public.leitor l
        WHERE l.id_leitor = leitor_curso.id_leitor
          AND l.id_auth = auth.uid()
      )
    ))
    OR EXISTS (
      SELECT 1 FROM public.leitor l
      WHERE l.id_leitor = leitor_curso.id_leitor
        AND l.status_cadastro = 'pendente'
    )
  );

-- Deleção: staff, próprio leitor autenticado, ou leitor pendente (para sincronização na edição/re-submissão)
DROP POLICY IF EXISTS "leitor_curso_delete_staff" ON public.leitor_curso;
DROP POLICY IF EXISTS "leitor_curso_delete_anon" ON public.leitor_curso;
DROP POLICY IF EXISTS "leitor_curso_delete_policy" ON public.leitor_curso;

CREATE POLICY "leitor_curso_delete_policy" ON public.leitor_curso
  FOR DELETE TO anon, authenticated
  USING (
    -- Caso 1: Staff autenticado
    (auth.role() = 'authenticated' AND (
      public.app_is_staff()
      OR public.current_profile() = ANY (ARRAY['admin'::text, 'operador'::text])
      OR public.app_user_papel() = ANY (ARRAY['admin'::text, 'operador'::text])
    ))
    -- Caso 2: Próprio leitor autenticado
    OR (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1 FROM public.leitor l
      WHERE l.id_leitor = leitor_curso.id_leitor
        AND l.id_auth = auth.uid()
    ))
    -- Caso 3: Leitor pendente de validação
    OR EXISTS (
      SELECT 1 FROM public.leitor l
      WHERE l.id_leitor = leitor_curso.id_leitor
        AND l.status_cadastro = 'pendente'
    )
  );

-- 3. Atualizar a função aprovar_cadastro_leitor para preservar e sincronizar cursos
CREATE OR REPLACE FUNCTION public.aprovar_cadastro_leitor(p_id_leitor integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'auth', 'pg_temp'
AS $$
DECLARE
  v_caller_id uuid;
  v_is_staff boolean;
  v_leitor RECORD;
  v_user_id uuid;
  v_normalized_email text;
  v_instance_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_encrypted_pw text;
  v_metadata jsonb;
  v_temp_pw text;
  v_primary_curso text;
  v_curso_id uuid;
BEGIN
  -- 1. Validar se quem chama é staff (admin ou operador)
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL THEN
    v_is_staff := public.app_is_staff();
    IF NOT v_is_staff THEN
      RAISE EXCEPTION 'Permissão negada: apenas administradores e operadores podem aprovar cadastros.';
    END IF;
  END IF;

  -- 2. Buscar o registro do leitor
  SELECT * INTO v_leitor
  FROM public.leitor
  WHERE id_leitor = p_id_leitor;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leitor com ID % não encontrado.', p_id_leitor;
  END IF;

  v_normalized_email := lower(trim(v_leitor.email));

  -- Descobrir nome do curso primário a partir de leitor_curso ou leitor.curso
  SELECT c.nome INTO v_primary_curso
  FROM public.leitor_curso lc
  JOIN public.cursos c ON c.id = lc.id_curso
  WHERE lc.id_leitor = p_id_leitor
  ORDER BY lc.created_at ASC
  LIMIT 1;

  IF v_primary_curso IS NULL THEN
    v_primary_curso := v_leitor.curso;
  END IF;

  -- Se v_leitor.curso estava preenchido mas não havia linha em leitor_curso, garantir vínculo em leitor_curso
  IF v_leitor.curso IS NOT NULL AND TRIM(v_leitor.curso) != '' THEN
    SELECT id INTO v_curso_id
    FROM public.cursos
    WHERE nome = TRIM(v_leitor.curso)
    LIMIT 1;

    IF v_curso_id IS NOT NULL THEN
      INSERT INTO public.leitor_curso (id_leitor, id_curso)
      VALUES (p_id_leitor, v_curso_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Se v_leitor.curso estava nulo mas tínhamos curso em leitor_curso, atualizar na tabela leitor
  IF (v_leitor.curso IS NULL OR TRIM(v_leitor.curso) = '') AND v_primary_curso IS NOT NULL THEN
    UPDATE public.leitor
    SET curso = v_primary_curso
    WHERE id_leitor = p_id_leitor;
  END IF;

  -- 3. Verificar se já existe um usuário em auth.users com esse e-mail
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_normalized_email;

  IF v_user_id IS NULL THEN
    -- Criar novo usuário em auth.users
    v_user_id := gen_random_uuid();
    v_temp_pw := encode(gen_random_bytes(18), 'hex');
    v_encrypted_pw := crypt(v_temp_pw, gen_salt('bf', 10));

    v_metadata := jsonb_build_object(
      'nome', trim(v_leitor.nome_do_leitor),
      'full_name', trim(v_leitor.nome_do_leitor),
      'papel', 'leitor',
      'role', 'leitor',
      'app_role', 'leitor',
      'avatar_url', v_leitor.foto,
      'email_verified', true,
      'primeiro_acesso_pendente', true,
      'curso', v_primary_curso
    );

    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      email_change_token_current,
      phone,
      phone_change,
      phone_change_token,
      reauthentication_token,
      is_super_admin
    ) VALUES (
      v_user_id,
      v_instance_id,
      'authenticated',
      'authenticated',
      v_normalized_email,
      v_encrypted_pw,
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      v_metadata,
      now(),
      now(),
      '',
      '',
      '',
      '',
      '',
      NULL,
      '',
      '',
      '',
      false
    );

    -- Inserir em auth.identities
    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      provider,
      identity_data,
      created_at,
      updated_at,
      last_sign_in_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      v_normalized_email,
      'email',
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_normalized_email,
        'role', 'leitor',
        'app_role', 'leitor',
        'full_name', trim(v_leitor.nome_do_leitor),
        'email_verified', true,
        'primeiro_acesso_pendente', true,
        'curso', v_primary_curso
      ),
      now(),
      now(),
      now()
    )
    ON CONFLICT (provider_id, provider) DO UPDATE
    SET
      user_id = EXCLUDED.user_id,
      identity_data = EXCLUDED.identity_data,
      updated_at = now();
  END IF;

  -- 4. Garantir registro em public.profiles preservando o curso
  INSERT INTO public.profiles (
    id,
    email,
    nome,
    full_name,
    papel,
    role,
    avatar_url,
    telefone,
    telefone_fixo,
    curso,
    bloqueado,
    senha_redefinida,
    primeiro_acesso_pendente,
    created_at
  ) VALUES (
    v_user_id,
    v_normalized_email,
    trim(v_leitor.nome_do_leitor),
    trim(v_leitor.nome_do_leitor),
    'leitor',
    'leitor',
    v_leitor.foto,
    v_leitor.telefone,
    v_leitor.telefone_fixo,
    v_primary_curso,
    false,
    false,
    true,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    nome = EXCLUDED.nome,
    full_name = EXCLUDED.full_name,
    telefone = COALESCE(EXCLUDED.telefone, public.profiles.telefone),
    telefone_fixo = COALESCE(EXCLUDED.telefone_fixo, public.profiles.telefone_fixo),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    curso = COALESCE(EXCLUDED.curso, public.profiles.curso, v_primary_curso),
    senha_redefinida = false,
    primeiro_acesso_pendente = true;

  -- 5. Atualizar o leitor: vincular id_auth, marcar status_cadastro = 'ativo', senha_redefinida = false, garantir curso
  UPDATE public.leitor
  SET
    id_auth = v_user_id,
    status_cadastro = 'ativo',
    bloqueado = false,
    senha_redefinida = false,
    primeiro_acesso_pendente = true,
    curso = COALESCE(v_primary_curso, curso)
  WHERE id_leitor = p_id_leitor;

  -- 6. Gravar histórico
  INSERT INTO public.historico (
    tipo,
    descricao,
    entidade_tipo,
    entidade_id,
    id_leitor,
    usuario_id,
    observacao
  ) VALUES (
    'Aprovação de Cadastro',
    'Cadastro do leitor ' || v_leitor.nome_do_leitor || ' aprovado pela biblioteca.',
    'leitor',
    p_id_leitor::text,
    p_id_leitor,
    v_caller_id,
    'Status atualizado para ativo. Conta de autenticação vinculada com primeiro acesso pendente. Curso vinculado: ' || COALESCE(v_primary_curso, 'Nenhum informado') || '.'
  );

  RETURN jsonb_build_object(
    'success', true,
    'id_leitor', p_id_leitor,
    'user_id', v_user_id,
    'email', v_normalized_email,
    'nome', v_leitor.nome_do_leitor,
    'curso', v_primary_curso,
    'primeiro_acesso_pendente', true
  );
END;
$$;
