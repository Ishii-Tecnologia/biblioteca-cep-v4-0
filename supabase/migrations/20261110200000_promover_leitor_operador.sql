-- Promover leitor a operador (exclusivo do admin)
-- Atualiza o papel do usuário Supabase existente (nunca cria novo usuário),
-- marca o registro de leitor como promovido (mantido para preservar o
-- histórico de empréstimos e reservas) e registra o evento em auditoria.

-- ============================================================
-- 1. RPC: public.promover_leitor_para_operador
-- ============================================================
CREATE OR REPLACE FUNCTION public.promover_leitor_para_operador(
  p_id_leitor integer,
  p_nome_do_leitor text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_papel text;
  v_leitor record;
  v_auth_id uuid;
BEGIN
  -- Validação no servidor: SOMENTE admin pode promover
  v_caller_papel := public.get_current_user_papel();
  IF v_caller_papel IS DISTINCT FROM 'admin' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Apenas o administrador pode promover um leitor a operador.'
    );
  END IF;

  IF p_id_leitor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leitor não informado.');
  END IF;

  SELECT * INTO v_leitor FROM public.leitor WHERE id_leitor = p_id_leitor;
  IF v_leitor.id_leitor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leitor não encontrado.');
  END IF;

  -- O leitor precisa possuir conta de acesso (usuário Supabase)
  v_auth_id := v_leitor.id_auth;
  IF v_auth_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',
      'Este leitor não possui conta de acesso (login). Cadastre a conta de acesso antes de promover.'
    );
  END IF;

  -- Impede promover quem já é um papel interno (admin/operador/operador_diretoria)
  SELECT papel INTO v_caller_papel FROM public.profiles WHERE id = v_auth_id;
  IF v_caller_papel IN ('admin', 'operador', 'operador_diretoria') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Este usuário já possui um papel interno e não pode ser promovido novamente.'
    );
  END IF;

  -- Garante registro em profiles (o leitor tem conta, então normalmente já existe)
  INSERT INTO public.profiles (id, email, full_name, papel, role, avatar_url, nome)
  VALUES (
    v_auth_id,
    v_leitor.email,
    COALESCE(p_nome_do_leitor, v_leitor.nome_do_leitor),
    'operador',
    'operador',
    v_leitor.foto,
    COALESCE(p_nome_do_leitor, v_leitor.nome_do_leitor)
  )
  ON CONFLICT (id) DO NOTHING;

  -- Atualiza o papel do usuário EXISTENTE (nunca cria novo)
  UPDATE public.profiles
  SET papel = 'operador',
      role = 'operador',
      full_name = COALESCE(NULLIF(p_nome_do_leitor, ''), full_name),
      nome = COALESCE(NULLIF(p_nome_do_leitor, ''), nome)
  WHERE id = v_auth_id;

  -- Metadados do usuário Supabase: papel passa a valer em todo o JWT
  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'papel', 'operador',
        'app_role', 'operador',
        'role', 'operador',
        'nome', COALESCE(NULLIF(p_nome_do_leitor, ''), raw_user_meta_data->>'nome')
      )
  WHERE id = v_auth_id;

  -- Marca o registro de leitor como promovido (registro mantido: preserva
  -- o histórico de empréstimos e reservas; sem conta de leitor ativa)
  UPDATE public.leitor
  SET status_cadastro = 'promovido_operador',
      status = 'PROMOVIDO',
      bloqueado = true
  WHERE id_leitor = p_id_leitor;

  -- Auditoria (best-effort; não falha a promoção se a tabela não existir)
  BEGIN
    INSERT INTO public.auditoria (tabela, id_registro, acao, usuario_id, dados_novos)
    VALUES (
      'leitor',
      p_id_leitor::text,
      'promocao_operador',
      auth.uid(),
      jsonb_build_object(
        'id_auth', v_auth_id,
        'email', v_leitor.email,
        'novo_papel', 'operador',
        'promovido_por', auth.uid()
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_auth_id,
    'novo_papel', 'operador'
  );
END;
$$;

-- ============================================================
-- 2. Garantias de permissão
-- ============================================================
REVOKE ALL ON FUNCTION public.promover_leitor_para_operador(integer, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promover_leitor_para_operador(integer, text) TO authenticated;
