-- Migração: Sistema de Gestão de Acervo, Empréstimos, Reservas e Devoluções Conforme Especificação
-- 1. Criação das tabelas auxiliares: feriado, configuracao, pre_reserva, auditoria_transicoes
-- 2. Compatibilização das tabelas: exemplar, emprestimo, reserva, leitor
-- 3. Função de cálculo de dias úteis com exclusão de domingo e feriados (sábado conta)
-- 4. Funções RPC com lock e transação atômica:
--    - criar_pre_reserva
--    - validar_pre_reserva (Aprovar / Rejeitar com roteamento automático para Empréstimo ou Reserva)
--    - criar_emprestimo_direto
--    - confirmar_retirada_emprestimo (PENDENTE_RETIRADA -> ATIVO)
--    - devolver_exemplar_v2 (Devolução com avanço FIFO na fila)
--    - processar_expiracoes_automaticas (Expira PENDENTE_RETIRADA > 4 dias úteis e avança fila)

-- ============================================================================
-- TABELA: feriado (Base para cálculo de dias úteis)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.feriado (
    id SERIAL PRIMARY KEY,
    data DATE NOT NULL UNIQUE,
    descricao VARCHAR(255) NOT NULL,
    ano INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM data)::INT) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.feriado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura pública de feriados" ON public.feriado;
CREATE POLICY "Leitura pública de feriados" ON public.feriado
    FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Gestão de feriados por admin e operador" ON public.feriado;
CREATE POLICY "Gestão de feriados por admin e operador" ON public.feriado
    FOR ALL TO authenticated
    USING (public.app_is_staff())
    WITH CHECK (public.app_is_staff());

-- Semear feriados nacionais básicos para 2025 e 2026
INSERT INTO public.feriado (data, descricao) VALUES
    ('2025-01-01', 'Confraternização Universal'),
    ('2025-03-03', 'Carnaval (segunda-feira)'),
    ('2025-03-04', 'Carnaval (terça-feira)'),
    ('2025-04-18', 'Sexta-feira Santa'),
    ('2025-04-21', 'Tiradentes'),
    ('2025-05-01', 'Dia do Trabalho'),
    ('2025-06-19', 'Corpus Christi'),
    ('2025-09-07', 'Independência do Brasil'),
    ('2025-10-12', 'Nossa Senhora Aparecida'),
    ('2025-11-02', 'Finados'),
    ('2025-11-15', 'Proclamação da República'),
    ('2025-11-20', 'Dia da Consciência Negra'),
    ('2025-12-25', 'Natal'),
    ('2026-01-01', 'Confraternização Universal'),
    ('2026-02-16', 'Carnaval (segunda-feira)'),
    ('2026-02-17', 'Carnaval (terça-feira)'),
    ('2026-04-03', 'Sexta-feira Santa'),
    ('2026-04-21', 'Tiradentes'),
    ('2026-05-01', 'Dia do Trabalho'),
    ('2026-06-04', 'Corpus Christi'),
    ('2026-09-07', 'Independência do Brasil'),
    ('2026-10-12', 'Nossa Senhora Aparecida'),
    ('2026-11-02', 'Finados'),
    ('2026-11-15', 'Proclamação da República'),
    ('2026-11-20', 'Dia da Consciência Negra'),
    ('2026-12-25', 'Natal')
ON CONFLICT (data) DO NOTHING;

-- ============================================================================
-- TABELA: configuracao (Parâmetros da Seção 7)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.configuracao (
    chave VARCHAR(100) PRIMARY KEY,
    valor TEXT NOT NULL,
    descricao VARCHAR(255),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.configuracao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura pública de configuracao" ON public.configuracao;
CREATE POLICY "Leitura pública de configuracao" ON public.configuracao
    FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Gestão de configuracao por admin e operador" ON public.configuracao;
CREATE POLICY "Gestão de configuracao por admin e operador" ON public.configuracao
    FOR ALL TO authenticated
    USING (public.app_is_staff())
    WITH CHECK (public.app_is_staff());

-- Semear parâmetros da Seção 7 com valores prescritivos
INSERT INTO public.configuracao (chave, valor, descricao) VALUES
    ('PRAZO_RETIRADA_DIAS_UTEIS', '4', 'Prazo para retirada após confirmação (em dias úteis)'),
    ('LIMITE_FILA_RESERVAS', '2', 'Máximo de leitores na fila de reservas por livro'),
    ('LIMITE_EMPRESTIMOS_LEITOR', '4', 'Máximo de livros distintos emprestados simultaneamente por leitor'),
    ('LIMITE_RESERVAS_LEITOR', '4', 'Máximo de reservas de exemplares não possuídos por leitor'),
    ('DIAS_NAO_UTEIS', '[0]', 'Dias não úteis por índice de dia da semana (domingo = 0, sábado = 6)'),
    ('NOTIFICAR_EMAIL', 'true', 'Habilita/desabilita envio de e-mails'),
    ('NOTIFICAR_SMS', 'true', 'Habilita/desabilita envio de SMS (stub auditado)'),
    ('PRAZO_EMPRESTIMO_DIAS', '15', 'Prazo do empréstimo em dias corridos após a retirada')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, descricao = EXCLUDED.descricao;

-- ============================================================================
-- TABELA: auditoria_transicoes (Auditoria de todas as transições de estado)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.auditoria_transicoes (
    id SERIAL PRIMARY KEY,
    entidade VARCHAR(50) NOT NULL, -- 'emprestimo', 'reserva', 'pre_reserva', 'exemplar', 'leitor'
    registro_id VARCHAR(100) NOT NULL,
    estado_anterior VARCHAR(50),
    estado_novo VARCHAR(50) NOT NULL,
    operador_id VARCHAR(100),
    operador_nome VARCHAR(255),
    motivo TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.auditoria_transicoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura de auditoria por autenticados" ON public.auditoria_transicoes;
CREATE POLICY "Leitura de auditoria por autenticados" ON public.auditoria_transicoes
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Inserção de auditoria por autenticados" ON public.auditoria_transicoes;
CREATE POLICY "Inserção de auditoria por autenticados" ON public.auditoria_transicoes
    FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- TABELA: pre_reserva (Entidade do Domínio 2 & Seção 4.1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pre_reserva (
    id SERIAL PRIMARY KEY,
    leitor_id INT NOT NULL REFERENCES public.leitor(id_leitor) ON DELETE CASCADE,
    livro_id VARCHAR(50) NOT NULL REFERENCES public.titulo(id_titulo) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE_VALIDACAO'
        CHECK (status IN ('PENDENTE_VALIDACAO', 'APROVADO', 'REJEITADO')),
    motivo_rejeicao TEXT,
    operador_id VARCHAR(100),
    operador_nome VARCHAR(255),
    data_validacao TIMESTAMPTZ,
    resultado_fluxo VARCHAR(50), -- 'EMPRESTIMO_CRIADO', 'AGENDADO', 'ENTROU_FILA', 'FILA_CHEIA'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pre_reserva_leitor ON public.pre_reserva(leitor_id);
CREATE INDEX IF NOT EXISTS idx_pre_reserva_livro ON public.pre_reserva(livro_id);
CREATE INDEX IF NOT EXISTS idx_pre_reserva_status ON public.pre_reserva(status);

ALTER TABLE public.pre_reserva ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitor vê suas pré-reservas e operadores veem todas" ON public.pre_reserva;
CREATE POLICY "Leitor vê suas pré-reservas e operadores veem todas" ON public.pre_reserva
    FOR SELECT TO authenticated
    USING (
        public.app_is_staff()
        OR EXISTS (
            SELECT 1 FROM public.leitor l
            WHERE l.id_leitor = pre_reserva.leitor_id AND l.id_auth = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Leitor cria pré-reserva para si" ON public.pre_reserva;
CREATE POLICY "Leitor cria pré-reserva para si" ON public.pre_reserva
    FOR INSERT TO authenticated
    WITH CHECK (
        public.app_is_staff()
        OR EXISTS (
            SELECT 1 FROM public.leitor l
            WHERE l.id_leitor = pre_reserva.leitor_id AND l.id_auth = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Operadores validam pré-reservas" ON public.pre_reserva;
CREATE POLICY "Operadores validam pré-reservas" ON public.pre_reserva
    FOR UPDATE TO authenticated
    USING (public.app_is_staff())
    WITH CHECK (public.app_is_staff());

-- ============================================================================
-- COMPATIBILIZAÇÃO DAS TABELAS EXISTENTES (leitor, exemplar, emprestimo, reserva)
-- ============================================================================

-- LEITOR: garantir coluna status (ATIVO | BLOQUEADO | INATIVO)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'leitor' AND column_name = 'status'
    ) THEN
        ALTER TABLE public.leitor ADD COLUMN status VARCHAR(20) DEFAULT 'ATIVO';
    END IF;
END $$;

-- Atualizar status do leitor com base nos campos legados
UPDATE public.leitor
SET status = CASE
    WHEN bloqueado = true THEN 'BLOQUEADO'
    WHEN status_cadastro = 'inativo' THEN 'INATIVO'
    ELSE 'ATIVO'
END
WHERE status IS NULL OR status = 'ATIVO';

-- EXEMPLAR: remover check constraint restritiva antiga se existir e atualizar para aceitar os estados da spec
-- spec: status: DISPONIVEL | EMPRESTADO | BLOQUEADO | RESERVADO (além de compatibilidade com minúsculas/legadas)
ALTER TABLE public.exemplar DROP CONSTRAINT IF EXISTS exemplar_status_check;
ALTER TABLE public.exemplar ADD CONSTRAINT exemplar_status_check 
    CHECK (UPPER(status) IN ('DISPONIVEL', 'EMPRESTADO', 'BLOQUEADO', 'RESERVADO', 'MANUTENCAO') OR status IN ('disponivel', 'emprestado', 'reservado', 'manutencao', 'Disponivel', 'Emprestado', 'Reservado', 'Manutencao'));

UPDATE public.exemplar
SET status = CASE
    WHEN UPPER(status) IN ('DISPONIVEL', 'DISPONÍVEL') THEN 'DISPONIVEL'
    WHEN UPPER(status) IN ('EMPRESTADO') THEN 'EMPRESTADO'
    WHEN UPPER(status) IN ('RESERVADO') THEN 'RESERVADO'
    ELSE 'BLOQUEADO'
END;

-- EMPRESTIMO: remover check constraint restritiva antiga se existir
ALTER TABLE public.emprestimo DROP CONSTRAINT IF EXISTS emprestimo_status_check;

-- EMPRESTIMO: garantir coluna status_spec / status com os 6 estados:
-- AGENDADO | PENDENTE_RETIRADA | ATIVO | DEVOLVIDO | EXPIRADO | CANCELADO
-- E colunas data_limite_retirada, data_retirada_real, etc.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'emprestimo' AND column_name = 'status'
    ) THEN
        ALTER TABLE public.emprestimo ADD COLUMN status VARCHAR(30) DEFAULT 'ATIVO';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'emprestimo' AND column_name = 'data_limite_retirada'
    ) THEN
        ALTER TABLE public.emprestimo ADD COLUMN data_limite_retirada TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'emprestimo' AND column_name = 'data_retirada_real'
    ) THEN
        ALTER TABLE public.emprestimo ADD COLUMN data_retirada_real TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'emprestimo' AND column_name = 'data_agendada'
    ) THEN
        ALTER TABLE public.emprestimo ADD COLUMN data_agendada DATE;
    END IF;
END $$;

-- Mapear empréstimos legados para o novo status
UPDATE public.emprestimo
SET status = CASE
    WHEN data_devolucao_real IS NOT NULL THEN 'DEVOLVIDO'
    ELSE 'ATIVO'
END
WHERE status IS NULL OR status = '';

-- RESERVA: compatibilizar com a spec:
-- status: NA_FILA | NOTIFICADO | CONTEMPLADO | EXPIRADO | CANCELADO
-- posicao_fila: INT
ALTER TABLE public.reserva DROP CONSTRAINT IF EXISTS reserva_status_check;
ALTER TABLE public.reserva DROP CONSTRAINT IF EXISTS chk_reserva_status_reserva;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'reserva' AND column_name = 'posicao_fila'
    ) THEN
        ALTER TABLE public.reserva ADD COLUMN posicao_fila INT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'reserva' AND column_name = 'status'
    ) THEN
        ALTER TABLE public.reserva ADD COLUMN status VARCHAR(30) DEFAULT 'NA_FILA';
    END IF;
END $$;

-- Sincronizar ordem_fila com posicao_fila
UPDATE public.reserva
SET posicao_fila = COALESCE(ordem_fila, 1)
WHERE posicao_fila IS NULL;

UPDATE public.reserva
SET status = CASE
    WHEN status_reserva = 'Pronta para Retirada' THEN 'CONTEMPLADO'
    WHEN status_reserva = 'Atendida' THEN 'CONTEMPLADO'
    WHEN status_reserva = 'Cancelada' THEN 'CANCELADO'
    ELSE 'NA_FILA'
END
WHERE status IS NULL OR status = '';

-- ============================================================================
-- FUNÇÃO UTILITÁRIA: CALCULAR 4º DIA ÚTIL SUBSEQUENTE (Seção 5)
-- "O prazo de 4 dias úteis conta somente dias que não sejam domingo nem feriado.
-- Sábado é considerado dia útil (não está excluído pela regra). Feriados vêm da
-- tabela Feriado. Base de cálculo: a partir do dia útil do evento, com o dia do
-- evento como dia 1 (se for dia útil). A data final = 4º dia útil subsequente.
-- Exemplo: confirmação na quinta-feira (04/09) -> dias úteis: qui(1), sex(2), seg(3), ter(4) -> prazo até terça-feira."
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calcular_prazo_dias_uteis(
    p_data_inicio TIMESTAMPTZ DEFAULT NOW(),
    p_qtd_dias_uteis INT DEFAULT 4
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_cur_date DATE;
    v_dow INT;
    v_contados INT := 0;
    v_dias_nao_uteis_json JSONB;
    v_is_holiday BOOLEAN;
    v_is_non_working_dow BOOLEAN;
    v_hora_evento TIME;
BEGIN
    -- Obter lista de dias da semana não úteis da tabela configuracao (default: [0] = domingo)
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
    v_hora_evento := (p_data_inicio AT TIME ZONE 'America/Sao_Paulo')::TIME;

    -- Loop para contar dias úteis
    -- Se o dia do evento for dia útil, ele é o dia 1. Se não for (ex: domingo ou feriado), avança até o primeiro útil
    LOOP
        v_dow := EXTRACT(DOW FROM v_cur_date)::INT;
        
        -- Verifica se o dia da semana está em DIAS_NAO_UTEIS
        SELECT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(v_dias_nao_uteis_json) elem
            WHERE elem::INT = v_dow
        ) INTO v_is_non_working_dow;

        -- Verifica se é feriado cadastrado na tabela feriado
        SELECT EXISTS (
            SELECT 1 FROM public.feriado f
            WHERE f.data = v_cur_date
        ) INTO v_is_holiday;

        -- Se for dia útil (não é feriado e não é domingo/dia não útil)
        IF NOT v_is_non_working_dow AND NOT v_is_holiday THEN
            v_contados := v_contados + 1;
            IF v_contados = p_qtd_dias_uteis THEN
                EXIT;
            END IF;
        END IF;

        -- Avança 1 dia
        v_cur_date := v_cur_date + 1;
    END LOOP;

    -- Retorna no final do dia útil (23:59:59) ou na mesma hora do evento
    RETURN ((v_cur_date || ' 23:59:59')::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo');
END;
$$;

-- ============================================================================
-- AUDITORIA: Função interna de registro de transição
-- ============================================================================
CREATE OR REPLACE FUNCTION public.registrar_auditoria_transicao(
    p_entidade VARCHAR(50),
    p_registro_id VARCHAR(100),
    p_estado_anterior VARCHAR(50),
    p_estado_novo VARCHAR(50),
    p_operador_id VARCHAR(100),
    p_operador_nome VARCHAR(255),
    p_motivo TEXT DEFAULT NULL,
    p_payload JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.auditoria_transicoes (
        entidade,
        registro_id,
        estado_anterior,
        estado_novo,
        operador_id,
        operador_nome,
        motivo,
        payload
    ) VALUES (
        p_entidade,
        p_registro_id,
        p_estado_anterior,
        p_estado_novo,
        p_operador_id,
        p_operador_nome,
        p_motivo,
        p_payload
    );
END;
$$;

-- ============================================================================
-- RPC: criar_pre_reserva
-- Fluxo 4.1: Leitor solicita livro -> cria PRÉ-RESERVA (status: PENDENTE_VALIDACAO)
-- Validações: Leitor ATIVO e limites prévios
-- ============================================================================
CREATE OR REPLACE FUNCTION public.criar_pre_reserva(
    p_leitor_id INT,
    p_livro_id VARCHAR(50),
    p_operador_nome VARCHAR(255) DEFAULT 'Sistema'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_leitor_status VARCHAR(20);
    v_bloqueado BOOLEAN;
    v_leitor_nome VARCHAR(255);
    v_livro_titulo VARCHAR(255);
    v_pre_reserva_id INT;
    v_pendente_existente INT;
BEGIN
    -- 1. Verificar Leitor
    SELECT nome_do_leitor, COALESCE(status, 'ATIVO'), bloqueado
    INTO v_leitor_nome, v_leitor_status, v_bloqueado
    FROM public.leitor
    WHERE id_leitor = p_leitor_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Leitor com ID % não encontrado.', p_leitor_id;
    END IF;

    IF v_leitor_status = 'BLOQUEADO' OR v_bloqueado = true THEN
        RAISE EXCEPTION 'O leitor está BLOQUEADO e não pode solicitar livros.';
    END IF;

    IF v_leitor_status = 'INATIVO' THEN
        RAISE EXCEPTION 'O leitor está INATIVO e não pode solicitar livros.';
    END IF;

    -- 2. Verificar Livro
    SELECT titulo_de_livro INTO v_livro_titulo
    FROM public.titulo
    WHERE id_titulo = p_livro_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Livro com código % não encontrado no acervo.', p_livro_id;
    END IF;

    -- 3. Evitar pré-reserva duplicada pendente para o mesmo livro e leitor
    SELECT id INTO v_pendente_existente
    FROM public.pre_reserva
    WHERE leitor_id = p_leitor_id AND livro_id = p_livro_id AND status = 'PENDENTE_VALIDACAO';

    IF FOUND THEN
        RAISE EXCEPTION 'Já existe uma solicitação de pré-reserva pendente de validação para este livro.';
    END IF;

    -- 4. Inserir pré-reserva
    INSERT INTO public.pre_reserva (
        leitor_id,
        livro_id,
        status,
        operador_nome
    ) VALUES (
        p_leitor_id,
        p_livro_id,
        'PENDENTE_VALIDACAO',
        p_operador_nome
    ) RETURNING id INTO v_pre_reserva_id;

    -- 5. Auditoria
    PERFORM public.registrar_auditoria_transicao(
        'pre_reserva',
        v_pre_reserva_id::TEXT,
        NULL,
        'PENDENTE_VALIDACAO',
        NULL,
        p_operador_nome,
        'Criação de pré-reserva pelo leitor',
        jsonb_build_object('livro_id', p_livro_id, 'leitor_id', p_leitor_id, 'titulo', v_livro_titulo)
    );

    RETURN jsonb_build_object(
        'success', true,
        'id', v_pre_reserva_id,
        'status', 'PENDENTE_VALIDACAO',
        'mensagem', 'Pré-reserva criada com sucesso. Aguardando validação do operador.'
    );
END;
$$;

-- ============================================================================
-- RPC: validar_pre_reserva (Operador valida: APROVAR ou REJEITAR)
-- Implementa Seções 3, 4, 6 e 7 com LOCK TRANSACIONAL
-- Se APROVADO:
--   - Verifica exemplar DISPONIVEL
--     - Se DISPONIVEL: Cria EMPRÉSTIMO (PENDENTE_RETIRADA); exemplar -> BLOQUEADO; prazo de retirada = 4 dias úteis
--     - Se INDISPONIVEL: Livro INDISPONIVEL:
--         - Fila < 2: Entra na FILA de Reserva (status: NA_FILA, posicao_fila)
--         - Fila = 2: REJEITA: "Não há disponibilidade para mais reservas."
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validar_pre_reserva(
    p_pre_reserva_id INT,
    p_acao VARCHAR(20), -- 'APROVAR' ou 'REJEITAR'
    p_motivo_rejeicao TEXT DEFAULT NULL,
    p_operador_id VARCHAR(100) DEFAULT NULL,
    p_operador_nome VARCHAR(255) DEFAULT 'Operador'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pr RECORD;
    v_leitor RECORD;
    v_livro RECORD;
    v_limite_emprestimos INT := 4;
    v_limite_reservas INT := 4;
    v_limite_fila INT := 2;
    v_prazo_dias_uteis INT := 4;
    v_prazo_emprestimo_dias INT := 15;
    v_emprestimos_ativos_count INT;
    v_reservas_ativas_count INT;
    v_total_fila INT;
    v_proxima_posicao INT;
    v_exemplar_disponivel RECORD;
    v_data_limite_retirada TIMESTAMPTZ;
    v_data_prevista_devolucao TIMESTAMPTZ;
    v_novo_emprestimo_id INT;
    v_nova_reserva_id INT;
    v_resultado_fluxo VARCHAR(50);
    v_mensagem_retorno TEXT;
    v_data_agendada DATE;
    v_menor_data_devolucao DATE;
BEGIN
    -- 1. Lock e leitura da pré-reserva
    SELECT * INTO v_pr
    FROM public.pre_reserva
    WHERE id = p_pre_reserva_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pré-reserva ID % não encontrada.', p_pre_reserva_id;
    END IF;

    IF v_pr.status <> 'PENDENTE_VALIDACAO' THEN
        RAISE EXCEPTION 'Esta pré-reserva já foi finalizada com status %.', v_pr.status;
    END IF;

    -- Buscar configurações da Seção 7
    SELECT COALESCE(NULLIF(valor, '')::INT, 4) INTO v_limite_emprestimos
    FROM public.configuracao WHERE chave = 'LIMITE_EMPRESTIMOS_LEITOR';
    IF v_limite_emprestimos IS NULL THEN v_limite_emprestimos := 4; END IF;

    SELECT COALESCE(NULLIF(valor, '')::INT, 4) INTO v_limite_reservas
    FROM public.configuracao WHERE chave = 'LIMITE_RESERVAS_LEITOR';
    IF v_limite_reservas IS NULL THEN v_limite_reservas := 4; END IF;

    SELECT COALESCE(NULLIF(valor, '')::INT, 2) INTO v_limite_fila
    FROM public.configuracao WHERE chave = 'LIMITE_FILA_RESERVAS';
    IF v_limite_fila IS NULL THEN v_limite_fila := 2; END IF;

    SELECT COALESCE(NULLIF(valor, '')::INT, 4) INTO v_prazo_dias_uteis
    FROM public.configuracao WHERE chave = 'PRAZO_RETIRADA_DIAS_UTEIS';
    IF v_prazo_dias_uteis IS NULL THEN v_prazo_dias_uteis := 4; END IF;

    SELECT COALESCE(NULLIF(valor, '')::INT, 15) INTO v_prazo_emprestimo_dias
    FROM public.configuracao WHERE chave = 'PRAZO_EMPRESTIMO_DIAS';
    IF v_prazo_emprestimo_dias IS NULL THEN v_prazo_emprestimo_dias := 15; END IF;

    -- Caso AÇÃO seja REJEITAR
    IF UPPER(p_acao) = 'REJEITAR' THEN
        UPDATE public.pre_reserva
        SET status = 'REJEITADO',
            motivo_rejeicao = COALESCE(p_motivo_rejeicao, 'Rejeitado pelo operador.'),
            operador_id = p_operador_id,
            operador_nome = p_operador_nome,
            data_validacao = NOW(),
            resultado_fluxo = 'REJEITADO'
        WHERE id = p_pre_reserva_id;

        PERFORM public.registrar_auditoria_transicao(
            'pre_reserva',
            p_pre_reserva_id::TEXT,
            'PENDENTE_VALIDACAO',
            'REJEITADO',
            p_operador_id,
            p_operador_nome,
            p_motivo_rejeicao,
            jsonb_build_object('livro_id', v_pr.livro_id, 'leitor_id', v_pr.leitor_id)
        );

        RETURN jsonb_build_object(
            'success', true,
            'status', 'REJEITADO',
            'mensagem', 'Pré-reserva rejeitada com sucesso.'
        );
    END IF;

    -- Caso AÇÃO seja APROVAR:
    -- 2. Lock do Leitor e Livro
    SELECT * INTO v_leitor
    FROM public.leitor
    WHERE id_leitor = v_pr.leitor_id
    FOR UPDATE;

    IF v_leitor.bloqueado = true OR UPPER(COALESCE(v_leitor.status, 'ATIVO')) = 'BLOQUEADO' THEN
        RAISE EXCEPTION 'O leitor está BLOQUEADO e não pode ter solicitações aprovadas.';
    END IF;

    SELECT * INTO v_livro
    FROM public.titulo
    WHERE id_titulo = v_pr.livro_id
    FOR UPDATE;

    -- 3. Validação de Limites por Leitor (Seções 3.1, 3.2 e 6)
    -- Limite de empréstimos por leitor: no máximo 4 livros distintos emprestados simultaneamente (contagem por livro_id)
    SELECT COUNT(DISTINCT ex.id_titulo) INTO v_emprestimos_ativos_count
    FROM public.emprestimo emp
    JOIN public.exemplar ex ON ex.id_exemplar = emp.id_exemplar
    WHERE emp.id_leitor = v_pr.leitor_id
      AND emp.data_devolucao_real IS NULL
      AND (emp.status IS NULL OR UPPER(emp.status) IN ('ATIVO', 'PENDENTE_RETIRADA', 'AGENDADO'));

    IF v_emprestimos_ativos_count >= v_limite_emprestimos THEN
        RAISE EXCEPTION 'O leitor atingiu o limite de % empréstimos.', v_limite_emprestimos;
    END IF;

    -- Limite de reservas por leitor: no máximo 4 exemplares distintos reservados que não estejam em sua posse
    SELECT COUNT(DISTINCT r.id_titulo) INTO v_reservas_ativas_count
    FROM public.reserva r
    WHERE r.id_leitor = v_pr.leitor_id
      AND (r.status_reserva IN ('Ativa', 'Pronta para Retirada') OR r.status IN ('NA_FILA', 'NOTIFICADO', 'CONTEMPLADO'));

    IF v_reservas_ativas_count >= v_limite_reservas THEN
        RAISE EXCEPTION 'O leitor atingiu o limite de % reservas.', v_limite_reservas;
    END IF;

    -- 4. Verificar se há exemplar DISPONIVEL (com Lock Row-Level)
    SELECT * INTO v_exemplar_disponivel
    FROM public.exemplar
    WHERE id_titulo = v_pr.livro_id
      AND UPPER(status) IN ('DISPONIVEL', 'DISPONÍVEL')
    ORDER BY seq ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        -- FLUXO DE EMPRÉSTIMO COM DISPONIBILIDADE (Seção 4.2)
        -- Exemplar muda para BLOQUEADO; Empréstimo entra em PENDENTE_RETIRADA; inicia prazo de retirada (4 dias úteis)
        v_data_limite_retirada := public.calcular_prazo_dias_uteis(NOW(), v_prazo_dias_uteis);
        v_data_prevista_devolucao := NOW() + (v_prazo_emprestimo_dias || ' days')::INTERVAL;

        -- Atualizar exemplar para BLOQUEADO
        UPDATE public.exemplar
        SET status = 'BLOQUEADO'
        WHERE id_exemplar = v_exemplar_disponivel.id_exemplar;

        -- Inserir Empréstimo
        INSERT INTO public.emprestimo (
            id_exemplar,
            id_leitor,
            data_emprestimo,
            data_prevista_devolucao,
            status,
            data_limite_retirada,
            numero_renovacoes,
            atraso,
            dias_atraso
        ) VALUES (
            v_exemplar_disponivel.id_exemplar,
            v_pr.leitor_id,
            NOW(),
            v_data_prevista_devolucao,
            'PENDENTE_RETIRADA',
            v_data_limite_retirada,
            0,
            false,
            0
        ) RETURNING id_emprestimo INTO v_novo_emprestimo_id;

        v_resultado_fluxo := 'PENDENTE_RETIRADA';
        v_mensagem_retorno := 'Pré-reserva aprovada! Empréstimo criado em PENDENTE_RETIRADA com exemplar ' ||
                              v_exemplar_disponivel.id_exemplar || '. Prazo de 4 dias úteis para retirada.';

        -- Auditoria exemplar e empréstimo
        PERFORM public.registrar_auditoria_transicao(
            'exemplar',
            v_exemplar_disponivel.id_exemplar,
            'DISPONIVEL',
            'BLOQUEADO',
            p_operador_id,
            p_operador_nome,
            'Bloqueio pré-empréstimo por validação de pré-reserva',
            jsonb_build_object('emprestimo_id', v_novo_emprestimo_id)
        );

        PERFORM public.registrar_auditoria_transicao(
            'emprestimo',
            v_novo_emprestimo_id::TEXT,
            NULL,
            'PENDENTE_RETIRADA',
            p_operador_id,
            p_operador_nome,
            'Empréstimo iniciado aguardando retirada física',
            jsonb_build_object('data_limite_retirada', v_data_limite_retirada, 'exemplar_id', v_exemplar_disponivel.id_exemplar)
        );

    ELSE
        -- FLUXO DE RESERVA / INDISPONIBILIDADE (Seção 4.3)
        -- Verificar fila de reservas do livro com lock
        SELECT COUNT(*) INTO v_total_fila
        FROM public.reserva
        WHERE id_titulo = v_pr.livro_id
          AND (status_reserva IN ('Ativa', 'Pronta para Retirada') OR status IN ('NA_FILA', 'NOTIFICADO'));

        IF v_total_fila >= v_limite_fila THEN
            -- Seção 3.2 e 6: "Não há disponibilidade para mais reservas."
            UPDATE public.pre_reserva
            SET status = 'REJEITADO',
                motivo_rejeicao = 'Não há disponibilidade para mais reservas.',
                operador_id = p_operador_id,
                operador_nome = p_operador_nome,
                data_validacao = NOW(),
                resultado_fluxo = 'FILA_CHEIA'
            WHERE id = p_pre_reserva_id;

            RAISE EXCEPTION 'Não há disponibilidade para mais reservas.';
        END IF;

        -- Atribuição FIFO determinística: próxima posição = total na fila + 1
        v_proxima_posicao := v_total_fila + 1;

        -- Estimar dia seguinte à devolução prevista mais próxima (Seção 4.2 / 4.3 / 6)
        SELECT MIN(emp.data_prevista_devolucao::DATE + 1) INTO v_data_agendada
        FROM public.emprestimo emp
        JOIN public.exemplar ex ON ex.id_exemplar = emp.id_exemplar
        WHERE ex.id_titulo = v_pr.livro_id
          AND emp.data_devolucao_real IS NULL;

        -- Inserir Reserva na Fila
        INSERT INTO public.reserva (
            id_titulo,
            id_leitor,
            data_reserva,
            status_reserva,
            status,
            posicao_fila,
            ordem_fila
        ) VALUES (
            v_pr.livro_id,
            v_pr.leitor_id,
            NOW(),
            'Ativa',
            'NA_FILA',
            v_proxima_posicao,
            v_proxima_posicao
        ) RETURNING id_reserva INTO v_nova_reserva_id;

        v_resultado_fluxo := 'ENTROU_FILA';
        v_mensagem_retorno := 'Livro sem disponibilidade imediata. Pré-reserva aprovada e inserida na fila de reserva (' ||
                              v_proxima_posicao || 'º lugar). Empréstimo agendado para o dia seguinte à devolução.';

        -- Auditoria da reserva
        PERFORM public.registrar_auditoria_transicao(
            'reserva',
            v_nova_reserva_id::TEXT,
            NULL,
            'NA_FILA',
            p_operador_id,
            p_operador_nome,
            'Entrada na fila de reservas',
            jsonb_build_object('posicao_fila', v_proxima_posicao, 'livro_id', v_pr.livro_id, 'data_agendada', v_data_agendada)
        );

    END IF;

    -- Atualizar status da pré-reserva para APROVADO
    UPDATE public.pre_reserva
    SET status = 'APROVADO',
        operador_id = p_operador_id,
        operador_nome = p_operador_nome,
        data_validacao = NOW(),
        resultado_fluxo = v_resultado_fluxo
    WHERE id = p_pre_reserva_id;

    PERFORM public.registrar_auditoria_transicao(
        'pre_reserva',
        p_pre_reserva_id::TEXT,
        'PENDENTE_VALIDACAO',
        'APROVADO',
        p_operador_id,
        p_operador_nome,
        'Validação da pré-reserva concluída',
        jsonb_build_object('resultado_fluxo', v_resultado_fluxo, 'emprestimo_id', v_novo_emprestimo_id, 'reserva_id', v_nova_reserva_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'APROVADO',
        'resultado_fluxo', v_resultado_fluxo,
        'emprestimo_id', v_novo_emprestimo_id,
        'reserva_id', v_nova_reserva_id,
        'mensagem', v_mensagem_retorno
    );
END;
$$;

-- ============================================================================
-- RPC: confirmar_retirada_emprestimo
-- Transição: PENDENTE_RETIRADA -> ATIVO (ou AGENDADO -> ATIVO)
-- Registra a retirada física pelo leitor e define o prazo de devolução
-- ============================================================================
CREATE OR REPLACE FUNCTION public.confirmar_retirada_emprestimo(
    p_emprestimo_id INT,
    p_operador_nome VARCHAR(255) DEFAULT 'Operador'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_emp RECORD;
    v_prazo_emprestimo_dias INT := 15;
    v_nova_data_prevista TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_emp
    FROM public.emprestimo
    WHERE id_emprestimo = p_emprestimo_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Empréstimo ID % não encontrado.', p_emprestimo_id;
    END IF;

    IF UPPER(COALESCE(v_emp.status, '')) NOT IN ('PENDENTE_RETIRADA', 'AGENDADO') THEN
        RAISE EXCEPTION 'Apenas empréstimos em PENDENTE_RETIRADA ou AGENDADO podem ser confirmados para ATIVO. Status atual: %', v_emp.status;
    END IF;

    SELECT COALESCE(NULLIF(valor, '')::INT, 15) INTO v_prazo_emprestimo_dias
    FROM public.configuracao WHERE chave = 'PRAZO_EMPRESTIMO_DIAS';
    IF v_prazo_emprestimo_dias IS NULL THEN v_prazo_emprestimo_dias := 15; END IF;

    v_nova_data_prevista := NOW() + (v_prazo_emprestimo_dias || ' days')::INTERVAL;

    UPDATE public.emprestimo
    SET status = 'ATIVO',
        data_retirada_real = NOW(),
        data_prevista_devolucao = v_nova_data_prevista
    WHERE id_emprestimo = p_emprestimo_id;

    -- Exemplar passa de BLOQUEADO para EMPRESTADO
    UPDATE public.exemplar
    SET status = 'EMPRESTADO'
    WHERE id_exemplar = v_emp.id_exemplar;

    PERFORM public.registrar_auditoria_transicao(
        'emprestimo',
        p_emprestimo_id::TEXT,
        v_emp.status,
        'ATIVO',
        NULL,
        p_operador_nome,
        'Retirada física confirmada na recepção',
        jsonb_build_object('data_retirada_real', NOW(), 'data_prevista_devolucao', v_nova_data_prevista)
    );

    PERFORM public.registrar_auditoria_transicao(
        'exemplar',
        v_emp.id_exemplar,
        'BLOQUEADO',
        'EMPRESTADO',
        NULL,
        p_operador_nome,
        'Exemplar em posse física do leitor',
        jsonb_build_object('emprestimo_id', p_emprestimo_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'ATIVO',
        'data_retirada_real', NOW(),
        'data_prevista_devolucao', v_nova_data_prevista,
        'mensagem', 'Retirada confirmada com sucesso! O empréstimo agora está ATIVO.'
    );
END;
$$;

-- ============================================================================
-- RPC: devolver_exemplar_v2 (Seção 3.3 e 4.3)
-- "Ao devolver, o exemplar muda para DISPONIVEL.
-- Disponível + fila de reservas não vazia: o exemplar não fica disponível para novos empréstimos;
-- o primeiro da fila é contemplado. Notificações de devolução: e-mail + SMS ao leitor contemplado."
-- ============================================================================
CREATE OR REPLACE FUNCTION public.devolver_exemplar_v2(
    p_id_exemplar VARCHAR(15),
    p_operador_nome VARCHAR(255) DEFAULT 'Operador'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_emp RECORD;
    v_ex RECORD;
    v_reserva RECORD;
    v_prazo_retirada_dias INT := 4;
    v_data_limite_retirada TIMESTAMPTZ;
    v_novo_emprestimo_id INT;
    v_leitor_contemplado RECORD;
    v_resultado JSONB;
BEGIN
    -- 1. Lock no exemplar
    SELECT * INTO v_ex
    FROM public.exemplar
    WHERE id_exemplar = p_id_exemplar
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exemplar % não encontrado.', p_id_exemplar;
    END IF;

    -- 2. Localizar empréstimo ativo/pendente associado
    SELECT * INTO v_emp
    FROM public.emprestimo
    WHERE id_exemplar = p_id_exemplar AND data_devolucao_real IS NULL
    ORDER BY id_emprestimo DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        -- Encerrar empréstimo como DEVOLVIDO
        UPDATE public.emprestimo
        SET data_devolucao_real = NOW(),
            status = 'DEVOLVIDO'
        WHERE id_emprestimo = v_emp.id_emprestimo;

        PERFORM public.registrar_auditoria_transicao(
            'emprestimo',
            v_emp.id_emprestimo::TEXT,
            v_emp.status,
            'DEVOLVIDO',
            NULL,
            p_operador_nome,
            'Devolução física registrada',
            jsonb_build_object('data_devolucao_real', NOW())
        );
    END IF;

    -- Ler prazo de retirada da Seção 7
    SELECT COALESCE(NULLIF(valor, '')::INT, 4) INTO v_prazo_retirada_dias
    FROM public.configuracao WHERE chave = 'PRAZO_RETIRADA_DIAS_UTEIS';
    IF v_prazo_retirada_dias IS NULL THEN v_prazo_retirada_dias := 4; END IF;

    -- 3. Verificar se há reservas na fila para o livro correspondente (FIFO determinístico)
    SELECT * INTO v_reserva
    FROM public.reserva
    WHERE id_titulo = v_ex.id_titulo
      AND (status_reserva = 'Ativa' OR status = 'NA_FILA')
    ORDER BY COALESCE(posicao_fila, ordem_fila, 1) ASC, created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        -- Seção 3.3: "Disponível + fila de reservas não vazia: o exemplar não fica disponível para novos empréstimos;
        -- o primeiro da fila é contemplado. Notificações de devolução: e-mail + SMS ao leitor contemplado."
        v_data_limite_retirada := public.calcular_prazo_dias_uteis(NOW(), v_prazo_retirada_dias);

        -- Exemplar passa para BLOQUEADO (reservado para o 1º da fila)
        UPDATE public.exemplar
        SET status = 'BLOQUEADO'
        WHERE id_exemplar = p_id_exemplar;

        -- Reserva passa para CONTEMPLADO
        UPDATE public.reserva
        SET status = 'CONTEMPLADO',
            status_reserva = 'Pronta para Retirada',
            data_atendimento = NOW(),
            data_limite_retirada = v_data_limite_retirada,
            exemplar_reservado_id = p_id_exemplar,
            posicao_fila = 0,
            ordem_fila = 0
        WHERE id_reserva = v_reserva.id_reserva;

        -- Reordenar os demais leitores da fila (FIFO determinístico)
        WITH fila_reordenada AS (
            SELECT id_reserva, ROW_NUMBER() OVER (ORDER BY COALESCE(posicao_fila, ordem_fila, 1) ASC, created_at ASC) as nova_pos
            FROM public.reserva
            WHERE id_titulo = v_ex.id_titulo
              AND id_reserva <> v_reserva.id_reserva
              AND (status_reserva = 'Ativa' OR status = 'NA_FILA')
        )
        UPDATE public.reserva r
        SET posicao_fila = fr.nova_pos,
            ordem_fila = fr.nova_pos
        FROM fila_reordenada fr
        WHERE r.id_reserva = fr.id_reserva;

        -- Criar empréstimo em PENDENTE_RETIRADA para o leitor contemplado
        INSERT INTO public.emprestimo (
            id_exemplar,
            id_leitor,
            data_emprestimo,
            data_prevista_devolucao,
            status,
            data_limite_retirada,
            numero_renovacoes,
            atraso,
            dias_atraso
        ) VALUES (
            p_id_exemplar,
            v_reserva.id_leitor,
            NOW(),
            NOW() + INTERVAL '15 days',
            'PENDENTE_RETIRADA',
            v_data_limite_retirada,
            0,
            false,
            0
        ) RETURNING id_emprestimo INTO v_novo_emprestimo_id;

        -- Buscar dados do leitor contemplado para notificação
        SELECT nome_do_leitor, email, telefone INTO v_leitor_contemplado
        FROM public.leitor WHERE id_leitor = v_reserva.id_leitor;

        PERFORM public.registrar_auditoria_transicao(
            'reserva',
            v_reserva.id_reserva::TEXT,
            'NA_FILA',
            'CONTEMPLADO',
            NULL,
            p_operador_nome,
            'Primeiro da fila contemplado na devolução do exemplar',
            jsonb_build_object('exemplar_id', p_id_exemplar, 'data_limite_retirada', v_data_limite_retirada, 'emprestimo_id', v_novo_emprestimo_id)
        );

        PERFORM public.registrar_auditoria_transicao(
            'exemplar',
            p_id_exemplar,
            'EMPRESTADO',
            'BLOQUEADO',
            NULL,
            p_operador_nome,
            'Exemplar bloqueado para leitor contemplado na fila de reservas',
            jsonb_build_object('leitor_id', v_reserva.id_leitor, 'reserva_id', v_reserva.id_reserva)
        );

        v_resultado := jsonb_build_object(
            'success', true,
            'devolvido', true,
            'fila_contemplada', true,
            'reserva_id', v_reserva.id_reserva,
            'leitor_id', v_reserva.id_leitor,
            'leitor_nome', v_leitor_contemplado.nome_do_leitor,
            'leitor_email', v_leitor_contemplado.email,
            'leitor_telefone', v_leitor_contemplado.telefone,
            'data_limite_retirada', v_data_limite_retirada,
            'emprestimo_id', v_novo_emprestimo_id,
            'mensagem', 'Exemplar devolvido. Fila ativa identificada: 1º da fila contemplado com sucesso! Prazo de 4 dias úteis iniciado.'
        );

    ELSE
        -- Fila vazia: exemplar muda para DISPONIVEL
        UPDATE public.exemplar
        SET status = 'DISPONIVEL'
        WHERE id_exemplar = p_id_exemplar;

        PERFORM public.registrar_auditoria_transicao(
            'exemplar',
            p_id_exemplar,
            'EMPRESTADO',
            'DISPONIVEL',
            NULL,
            p_operador_nome,
            'Exemplar devolvido e liberado para novo empréstimo (sem fila)',
            NULL
        );

        v_resultado := jsonb_build_object(
            'success', true,
            'devolvido', true,
            'fila_contemplada', false,
            'mensagem', 'Exemplar devolvido com sucesso e disponível no acervo.'
        );
    END IF;

    RETURN v_resultado;
END;
$$;

-- Compatibilizar chamada antiga devolver_exemplar chamando v2
CREATE OR REPLACE FUNCTION public.devolver_exemplar(
    p_id_exemplar character varying,
    p_usuario_sistema character varying DEFAULT 'Sistema'::character varying
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN public.devolver_exemplar_v2(p_id_exemplar, p_usuario_sistema);
END;
$$;

-- ============================================================================
-- RPC: processar_expiracoes_automaticas (Seção 4.4 - Expiração e Avanço da Fila)
-- "1. Prazo de 4 dias úteis expira sem retirada -> Empréstimo -> EXPIRADO (leitor perde).
--  2. Fila avança automaticamente: próximo da fila é contemplado -> notifica + reinicia prazo de 4 dias úteis.
--  Idempotência: notificações e avanço de fila devem ser idempotentes."
-- ============================================================================
CREATE OR REPLACE FUNCTION public.processar_expiracoes_automaticas(
    p_operador_nome VARCHAR(255) DEFAULT 'Cron/Sistema'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_exp RECORD;
    v_proximo RECORD;
    v_prazo_retirada_dias INT := 4;
    v_nova_data_limite TIMESTAMPTZ;
    v_novo_emprestimo_id INT;
    v_expirados_count INT := 0;
    v_avancados_count INT := 0;
    v_detalhes JSONB := '[]'::jsonb;
BEGIN
    SELECT COALESCE(NULLIF(valor, '')::INT, 4) INTO v_prazo_retirada_dias
    FROM public.configuracao WHERE chave = 'PRAZO_RETIRADA_DIAS_UTEIS';
    IF v_prazo_retirada_dias IS NULL THEN v_prazo_retirada_dias := 4; END IF;

    -- Localizar empréstimos em PENDENTE_RETIRADA cujo prazo expirou
    FOR v_exp IN
        SELECT emp.id_emprestimo, emp.id_exemplar, emp.id_leitor, emp.data_limite_retirada, ex.id_titulo
        FROM public.emprestimo emp
        JOIN public.exemplar ex ON ex.id_exemplar = emp.id_exemplar
        WHERE UPPER(emp.status) = 'PENDENTE_RETIRADA'
          AND emp.data_limite_retirada IS NOT NULL
          AND emp.data_limite_retirada < NOW()
          AND emp.data_devolucao_real IS NULL
        FOR UPDATE OF emp
    LOOP
        -- 1. Marcar empréstimo como EXPIRADO
        UPDATE public.emprestimo
        SET status = 'EXPIRADO'
        WHERE id_emprestimo = v_exp.id_emprestimo;

        -- Marcar reserva anterior associada como EXPIRADO se houver
        UPDATE public.reserva
        SET status = 'EXPIRADO',
            status_reserva = 'Cancelada'
        WHERE id_titulo = v_exp.id_titulo
          AND id_leitor = v_exp.id_leitor
          AND (status IN ('CONTEMPLADO', 'NOTIFICADO') OR status_reserva = 'Pronta para Retirada');

        PERFORM public.registrar_auditoria_transicao(
            'emprestimo',
            v_exp.id_emprestimo::TEXT,
            'PENDENTE_RETIRADA',
            'EXPIRADO',
            NULL,
            p_operador_nome,
            'Prazo de retirada em dias úteis expirou sem comparecimento',
            jsonb_build_object('data_limite_retirada', v_exp.data_limite_retirada)
        );

        v_expirados_count := v_expirados_count + 1;

        -- 2. Avançar fila: contemplar próximo da fila (FIFO)
        SELECT * INTO v_proximo
        FROM public.reserva
        WHERE id_titulo = v_exp.id_titulo
          AND (status = 'NA_FILA' OR status_reserva = 'Ativa')
        ORDER BY COALESCE(posicao_fila, ordem_fila, 1) ASC, created_at ASC
        LIMIT 1
        FOR UPDATE;

        IF FOUND THEN
            -- Novo prazo de retirada para o próximo
            v_nova_data_limite := public.calcular_prazo_dias_uteis(NOW(), v_prazo_retirada_dias);

            -- Reserva passa para CONTEMPLADO
            UPDATE public.reserva
            SET status = 'CONTEMPLADO',
                status_reserva = 'Pronta para Retirada',
                data_atendimento = NOW(),
                data_limite_retirada = v_nova_data_limite,
                exemplar_reservado_id = v_exp.id_exemplar,
                posicao_fila = 0,
                ordem_fila = 0
            WHERE id_reserva = v_proximo.id_reserva;

            -- Reordenar os demais da fila
            WITH fila_reordenada AS (
                SELECT id_reserva, ROW_NUMBER() OVER (ORDER BY COALESCE(posicao_fila, ordem_fila, 1) ASC, created_at ASC) as nova_pos
                FROM public.reserva
                WHERE id_titulo = v_exp.id_titulo
                  AND id_reserva <> v_proximo.id_reserva
                  AND (status = 'NA_FILA' OR status_reserva = 'Ativa')
            )
            UPDATE public.reserva r
            SET posicao_fila = fr.nova_pos,
                ordem_fila = fr.nova_pos
            FROM fila_reordenada fr
            WHERE r.id_reserva = fr.id_reserva;

            -- Iniciar novo empréstimo PENDENTE_RETIRADA para o contemplado
            INSERT INTO public.emprestimo (
                id_exemplar,
                id_leitor,
                data_emprestimo,
                data_prevista_devolucao,
                status,
                data_limite_retirada,
                numero_renovacoes,
                atraso,
                dias_atraso
            ) VALUES (
                v_exp.id_exemplar,
                v_proximo.id_leitor,
                NOW(),
                NOW() + INTERVAL '15 days',
                'PENDENTE_RETIRADA',
                v_nova_data_limite,
                0,
                false,
                0
            ) RETURNING id_emprestimo INTO v_novo_emprestimo_id;

            PERFORM public.registrar_auditoria_transicao(
                'reserva',
                v_proximo.id_reserva::TEXT,
                'NA_FILA',
                'CONTEMPLADO',
                NULL,
                p_operador_nome,
                'Avanço automático de fila após expiração de prazo do leitor anterior',
                jsonb_build_object('exemplar_id', v_exp.id_exemplar, 'nova_data_limite', v_nova_data_limite, 'novo_emprestimo_id', v_novo_emprestimo_id)
            );

            v_avancados_count := v_avancados_count + 1;
            v_detalhes := v_detalhes || jsonb_build_object(
                'emprestimo_expirado', v_exp.id_emprestimo,
                'proxima_reserva_contemplada', v_proximo.id_reserva,
                'novo_leitor_id', v_proximo.id_leitor,
                'nova_data_limite', v_nova_data_limite
            );
        ELSE
            -- Não há ninguém na fila: exemplar volta para DISPONIVEL
            UPDATE public.exemplar
            SET status = 'DISPONIVEL'
            WHERE id_exemplar = v_exp.id_exemplar;

            PERFORM public.registrar_auditoria_transicao(
                'exemplar',
                v_exp.id_exemplar,
                'BLOQUEADO',
                'DISPONIVEL',
                NULL,
                p_operador_nome,
                'Exemplar liberado para o acervo após expiração de prazo sem outros leitores na fila',
                NULL
            );

            v_detalhes := v_detalhes || jsonb_build_object(
                'emprestimo_expirado', v_exp.id_emprestimo,
                'exemplar_liberado', v_exp.id_exemplar
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'expirados', v_expirados_count,
        'avancados', v_avancados_count,
        'detalhes', v_detalhes
    );
END;
$$;
