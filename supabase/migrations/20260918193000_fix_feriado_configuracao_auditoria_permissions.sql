-- ============================================================================
-- Migration: Corrigir permissões e GRANTs para feriado, configuracao,
-- auditoria_transicoes e pre_reserva
-- ============================================================================

-- 1. CONCEDER PERMISSÕES (GRANTS) NA TABELA FERIADO
GRANT SELECT ON public.feriado TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.feriado TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.feriado_id_seq TO authenticated;

-- 2. CONCEDER PERMISSÕES (GRANTS) NA TABELA CONFIGURACAO
GRANT SELECT ON public.configuracao TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.configuracao TO authenticated;

-- 3. CONCEDER PERMISSÕES (GRANTS) NA TABELA AUDITORIA_TRANSICOES
GRANT SELECT, INSERT ON public.auditoria_transicoes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.auditoria_transicoes_id_seq TO authenticated;

-- 4. CONCEDER PERMISSÕES (GRANTS) NA TABELA PRE_RESERVA E SUA SEQUENCE
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pre_reserva TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.pre_reserva_id_seq TO authenticated;

-- 5. REFINAR POLÍTICAS RLS PARA FERIADO
-- Permitir leitura pública (tanto anon quanto autenticados)
DROP POLICY IF EXISTS "Leitura pública de feriados" ON public.feriado;
CREATE POLICY "Leitura pública de feriados" ON public.feriado
  FOR SELECT TO anon, authenticated
  USING (true);

-- Permitir gestão (INSERT, UPDATE, DELETE) por operadores e admins autenticados
DROP POLICY IF EXISTS "Gestão de feriados por admin e operador" ON public.feriado;
CREATE POLICY "Gestão de feriados por admin e operador" ON public.feriado
  FOR ALL TO authenticated
  USING (public.app_is_staff())
  WITH CHECK (public.app_is_staff());

-- 6. REFINAR POLÍTICAS RLS PARA CONFIGURACAO
-- Permitir leitura pública (tanto anon quanto autenticados)
DROP POLICY IF EXISTS "Leitura pública de configuracao" ON public.configuracao;
CREATE POLICY "Leitura pública de configuracao" ON public.configuracao
  FOR SELECT TO anon, authenticated
  USING (true);

-- Permitir inserção e atualização por operadores e admins autenticados
DROP POLICY IF EXISTS "Gestão de configuracao por admin e operador" ON public.configuracao;
CREATE POLICY "Gestão de configuracao por admin e operador" ON public.configuracao
  FOR ALL TO authenticated
  USING (public.app_is_staff())
  WITH CHECK (public.app_is_staff());

-- 7. REFINAR POLÍTICAS RLS PARA AUDITORIA_TRANSICOES
-- Conforme padrão de segurança: Leitura restrita a operadores e administradores (staff)
DROP POLICY IF EXISTS "Leitura de auditoria por autenticados" ON public.auditoria_transicoes;
DROP POLICY IF EXISTS "Leitura de auditoria por staff" ON public.auditoria_transicoes;
CREATE POLICY "Leitura de auditoria por staff" ON public.auditoria_transicoes
  FOR SELECT TO authenticated
  USING (public.app_is_staff());

-- Inserção de auditoria por qualquer usuário autenticado (ou funções do sistema)
DROP POLICY IF EXISTS "Inserção de auditoria por autenticados" ON public.auditoria_transicoes;
CREATE POLICY "Inserção de auditoria por autenticados" ON public.auditoria_transicoes
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 8. GARANTIR FUNÇÃO SECURITY DEFINER PARA SEMEAR FERIADOS (SE NECESSÁRIO VIA RPC)
CREATE OR REPLACE FUNCTION public.semear_feriados_padrao(p_ano INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'Acesso negado: apenas operadores e administradores podem semear feriados.';
  END IF;

  WITH feriados_defaults AS (
    SELECT 
      (p_ano || '-' || m.dt)::DATE as data,
      m.descricao
    FROM (
      VALUES
        ('01-01', 'Confraternização Universal'),
        ('04-21', 'Tiradentes'),
        ('05-01', 'Dia do Trabalho'),
        ('09-07', 'Independência do Brasil'),
        ('10-12', 'Nossa Senhora Aparecida'),
        ('11-02', 'Finados'),
        ('11-15', 'Proclamação da República'),
        ('11-20', 'Dia da Consciência Negra'),
        ('12-25', 'Natal')
    ) AS m(dt, descricao)
  ),
  inseridos AS (
    INSERT INTO public.feriado (data, descricao)
    SELECT d.data, d.descricao
    FROM feriados_defaults d
    ON CONFLICT (data) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM inseridos;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.semear_feriados_padrao(INT) TO authenticated;

-- 9. GARANTIR QUE calcular_prazo_dias_uteis SEJA SECURITY DEFINER PARA LEITURA SEGURA DE feriado E configuracao
CREATE OR REPLACE FUNCTION public.calcular_prazo_dias_uteis(
    p_data_inicio TIMESTAMPTZ DEFAULT NOW(),
    p_qtd_dias_uteis INT DEFAULT 4
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cur_date DATE;
    v_dow INT;
    v_contados INT := 0;
    v_dias_nao_uteis_json JSONB;
    v_is_holiday BOOLEAN;
    v_is_non_working_dow BOOLEAN;
BEGIN
    SELECT valor::jsonb INTO v_dias_nao_uteis_json
    FROM public.configuracao
    WHERE chave = 'DIAS_NAO_UTEIS';

    IF v_dias_nao_uteis_json IS NULL THEN
        v_dias_nao_uteis_json := '[0]'::jsonb;
    END IF;

    IF p_qtd_dias_uteis <= 0 THEN
        p_qtd_dias_uteis := 4;
    END IF;

    v_cur_date := (p_data_inicio AT TIME ZONE 'America/Sao_Paulo')::DATE;

    LOOP
        v_dow := EXTRACT(DOW FROM v_cur_date)::INT;
        
        SELECT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(v_dias_nao_uteis_json) elem
            WHERE elem::INT = v_dow
        ) INTO v_is_non_working_dow;

        SELECT EXISTS (
            SELECT 1 FROM public.feriado f
            WHERE f.data = v_cur_date
        ) INTO v_is_holiday;

        IF NOT v_is_non_working_dow AND NOT v_is_holiday THEN
            v_contados := v_contados + 1;
            IF v_contados = p_qtd_dias_uteis THEN
                EXIT;
            END IF;
        END IF;

        v_cur_date := v_cur_date + 1;
    END LOOP;

    RETURN ((v_cur_date || ' 23:59:59')::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo');
END;
$$;

GRANT EXECUTE ON FUNCTION public.calcular_prazo_dias_uteis(TIMESTAMPTZ, INT) TO anon, authenticated;
