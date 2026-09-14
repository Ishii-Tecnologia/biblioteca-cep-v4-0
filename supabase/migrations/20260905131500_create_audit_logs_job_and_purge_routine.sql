-- Migration: create_audit_logs_job_and_purge_routine.sql
-- Envio Automático do Relatório de Auditoria (Logs) & Expurgo Mensal em Lotes

-- 1. Tabela para idempotência e locks de execução de jobs agendados
CREATE TABLE IF NOT EXISTS public.job_execucoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano_mes TEXT NOT NULL,           -- Formato 'YYYY-MM'
  tipo_job TEXT NOT NULL,          -- Ex: 'auditoria_mensal_expurgo'
  status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente', 'sucesso', 'erro'
  data_execucao TIMESTAMPTZ NOT NULL DEFAULT now(),
  destinatarios TEXT,
  registros_incluidos INT DEFAULT 0,
  registros_expurgados INT DEFAULT 0,
  duracao_ms INT DEFAULT 0,
  mensagem TEXT,
  detalhes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_job_execucao_mes_tipo UNIQUE (ano_mes, tipo_job)
);

CREATE INDEX IF NOT EXISTS idx_job_execucoes_mes_tipo ON public.job_execucoes(ano_mes, tipo_job);

-- RLS para job_execucoes
ALTER TABLE public.job_execucoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_execucoes_select_staff" ON public.job_execucoes;
CREATE POLICY "job_execucoes_select_staff" ON public.job_execucoes
  FOR SELECT TO authenticated
  USING (app_is_staff());

DROP POLICY IF EXISTS "job_execucoes_insert_staff" ON public.job_execucoes;
CREATE POLICY "job_execucoes_insert_staff" ON public.job_execucoes
  FOR INSERT TO authenticated
  WITH CHECK (app_is_staff());

DROP POLICY IF EXISTS "job_execucoes_update_staff" ON public.job_execucoes;
CREATE POLICY "job_execucoes_update_staff" ON public.job_execucoes
  FOR UPDATE TO authenticated
  USING (app_is_staff())
  WITH CHECK (app_is_staff());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_execucoes TO authenticated;

-- 2. Inserir parâmetros de configuração padrão do envio automático e expurgo na tabela public.parametros
INSERT INTO public.parametros (chave, valor, descricao) VALUES
  ('auditoria_envio_ativo', 'false', 'Ativação do envio automático mensal do relatório de auditoria e rotina de expurgo (true/false).'),
  ('auditoria_destinatarios', '', 'Lista de e-mails destinatários do relatório de auditoria separados por vírgula.'),
  ('auditoria_assunto', 'Relatório de Auditoria — {data_referencia}', 'Template do assunto do e-mail de auditoria com suporte a variáveis.'),
  ('auditoria_corpo', 'Olá,\n\nSegue em anexo o Relatório de Auditoria do sistema Biblioteca CEP referente ao período de {data_inicio} até {data_fim}.\n\nTotal de registros auditados: {total_registros}.\nData de geração: {data_referencia}.\n\nAcesse o sistema para mais detalhes: {link_sistema}', 'Corpo do e-mail com variáveis.'),
  ('auditoria_remetente', 'sys.biblioteca.cep@email.org', 'Remetente padrão de exibição dos relatórios de auditoria.'),
  ('auditoria_dias_retroativos', '30', 'Quantidade de dias retroativos (N) cobertos pelo relatório de auditoria gerado (1-365).'),
  ('auditoria_dia_envio', '1', 'Dia do mês para disparo do job de auditoria e expurgo (1-31). Em meses mais curtos, executa no último dia.'),
  ('auditoria_hora_envio', '08:00', 'Horário de envio diário avaliado pelo job em formato HH:mm (referência America/Sao_Paulo).'),
  ('auditoria_dias_retencao', '90', 'Quantidade de dias de retenção para a rotina de expurgo da tabela de histórico (1-3650).')
ON CONFLICT (chave) DO NOTHING;

-- 3. Função RPC de Expurgo em lotes (DELETE com LIMIT em LOOP)
-- Apenas admin pode executar ou o serviço interno (SECURITY DEFINER com checagem de perfil)
CREATE OR REPLACE FUNCTION public.expurgar_historico_em_lotes(
  p_dias_retencao INT DEFAULT 90,
  p_batch_size INT DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
  v_cutoff_date TIMESTAMPTZ;
  v_total_deleted INT := 0;
  v_batch_deleted INT := 0;
  v_start_time TIMESTAMPTZ := clock_timestamp();
  v_end_time TIMESTAMPTZ;
  v_duration_ms INT;
  v_current_user_id UUID := auth.uid();
BEGIN
  -- Validar permissão: admin ou chamada de service_role (auth.uid() is null em chamadas de webhook autenticadas por chave de serviço)
  IF v_current_user_id IS NOT NULL THEN
    SELECT public.get_current_user_papel() INTO v_caller_role;
    IF v_caller_role != 'admin' THEN
      RAISE EXCEPTION 'Apenas usuários com perfil Administrador podem executar a rotina de expurgo.';
    END IF;
  END IF;

  IF p_dias_retencao < 1 THEN
    RAISE EXCEPTION 'O prazo de retenção para expurgo deve ser de pelo menos 1 dia.';
  END IF;

  v_cutoff_date := (now() AT TIME ZONE 'America/Sao_Paulo' - (p_dias_retencao || ' days')::INTERVAL) AT TIME ZONE 'America/Sao_Paulo';

  -- Loop em lotes para evitar bloqueio e estouro de memória
  LOOP
    WITH ids_para_excluir AS (
      SELECT id
      FROM public.historico
      WHERE created_at < v_cutoff_date
      LIMIT p_batch_size
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM public.historico h
    USING ids_para_excluir i
    WHERE h.id = i.id;

    GET DIAGNOSTICS v_batch_deleted = ROW_COUNT;
    v_total_deleted := v_total_deleted + v_batch_deleted;

    EXIT WHEN v_batch_deleted = 0;
    -- Pequena pausa para liberar locks se houver grande volume
    PERFORM pg_sleep(0.01);
  END LOOP;

  v_end_time := clock_timestamp();
  v_duration_ms := ROUND(EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000)::INT;

  -- Registrar na auditoria da auditoria (auditoria da rotina de expurgo)
  INSERT INTO public.historico (
    tipo,
    descricao,
    entidade_tipo,
    entidade_id,
    usuario_id,
    observacao
  ) VALUES (
    'Expurgo de Histórico',
    format('Rotina de expurgo concluída. Total de %s registros removidos anteriores a %s dias.', v_total_deleted, p_dias_retencao),
    'sistema',
    'expurgo_automatico',
    v_current_user_id,
    format('Duração da operação: %sms. Data de corte: %s.', v_duration_ms, to_char(v_cutoff_date, 'YYYY-MM-DD HH24:MI:SS TZ'))
  );

  RETURN jsonb_build_object(
    'success', true,
    'total_removidos', v_total_deleted,
    'duracao_ms', v_duration_ms,
    'data_corte', v_cutoff_date,
    'dias_retencao', p_dias_retencao
  );
END;
$$;
