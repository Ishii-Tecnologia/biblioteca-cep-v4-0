-- Migration: cancelar_pre_reserva e suporte a status CANCELADO
-- Permite que o próprio leitor autenticado (ou staff) cancele uma pré-reserva com status PENDENTE_VALIDACAO.
-- Respeita auditoria de transições e validação transacional row-level.

-- 1. Atualizar CHECK constraint na tabela pre_reserva para incluir 'CANCELADO'
ALTER TABLE public.pre_reserva DROP CONSTRAINT IF EXISTS pre_reserva_status_check;
ALTER TABLE public.pre_reserva ADD CONSTRAINT pre_reserva_status_check 
    CHECK (status IN ('PENDENTE_VALIDACAO', 'APROVADO', 'REJEITADO', 'CANCELADO'));

-- 2. Atualizar RLS na tabela pre_reserva para permitir que o leitor cancele (UPDATE) sua própria pré-reserva
DROP POLICY IF EXISTS "Operadores validam pré-reservas" ON public.pre_reserva;
DROP POLICY IF EXISTS "Operadores validam e leitores cancelam pré-reservas" ON public.pre_reserva;

CREATE POLICY "Operadores validam e leitores cancelam pré-reservas" ON public.pre_reserva
    FOR UPDATE TO authenticated
    USING (
        public.app_is_staff()
        OR EXISTS (
            SELECT 1 FROM public.leitor l
            WHERE l.id_leitor = pre_reserva.leitor_id AND l.id_auth = auth.uid()
        )
    )
    WITH CHECK (
        public.app_is_staff()
        OR EXISTS (
            SELECT 1 FROM public.leitor l
            WHERE l.id_leitor = pre_reserva.leitor_id AND l.id_auth = auth.uid()
        )
    );

-- 3. Criar RPC cancelar_pre_reserva com verificação de posse e transição de estado com auditoria
CREATE OR REPLACE FUNCTION public.cancelar_pre_reserva(
    p_pre_reserva_id INT,
    p_motivo TEXT DEFAULT 'Cancelado pelo leitor.'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_pr RECORD;
    v_is_staff BOOLEAN;
    v_leitor_auth_id UUID;
    v_caller_auth_id UUID;
    v_caller_nome VARCHAR(255);
BEGIN
    v_caller_auth_id := auth.uid();
    v_is_staff := public.app_is_staff();

    -- Lock row-level da pré-reserva
    SELECT * INTO v_pr
    FROM public.pre_reserva
    WHERE id = p_pre_reserva_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Solicitação de pré-reserva ID % não encontrada.', p_pre_reserva_id;
    END IF;

    -- Apenas solicitações PENDENTE_VALIDACAO podem ser canceladas
    IF v_pr.status <> 'PENDENTE_VALIDACAO' THEN
        RAISE EXCEPTION 'Apenas solicitações com status "PENDENTE_VALIDACAO" podem ser canceladas. Status atual: %.', v_pr.status;
    END IF;

    -- Obter id_auth e nome do leitor dono da solicitação
    SELECT id_auth, nome_do_leitor INTO v_leitor_auth_id, v_caller_nome
    FROM public.leitor
    WHERE id_leitor = v_pr.leitor_id;

    -- Se não for operador/admin, verificar se o caller é o próprio leitor
    IF NOT v_is_staff THEN
        IF v_caller_auth_id IS NULL OR v_leitor_auth_id IS NULL OR v_caller_auth_id <> v_leitor_auth_id THEN
            RAISE EXCEPTION 'Permissão negada: você só pode cancelar suas próprias solicitações.';
        END IF;
    END IF;

    -- Atualizar o status da pré-reserva para CANCELADO
    UPDATE public.pre_reserva
    SET status = 'CANCELADO',
        motivo_rejeicao = COALESCE(p_motivo, 'Cancelado pelo solicitante.'),
        operador_nome = COALESCE(v_caller_nome, 'Leitor'),
        data_validacao = NOW(),
        resultado_fluxo = 'CANCELADO'
    WHERE id = p_pre_reserva_id;

    -- Registrar transição padronizada na tabela de auditoria
    PERFORM public.registrar_auditoria_transicao(
        'pre_reserva',
        p_pre_reserva_id::TEXT,
        'PENDENTE_VALIDACAO',
        'CANCELADO',
        v_caller_auth_id::TEXT,
        COALESCE(v_caller_nome, 'Leitor'),
        COALESCE(p_motivo, 'Cancelado pelo solicitante.'),
        jsonb_build_object(
            'livro_id', v_pr.livro_id,
            'leitor_id', v_pr.leitor_id,
            'motivo', COALESCE(p_motivo, 'Cancelado pelo solicitante.')
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'CANCELADO',
        'mensagem', 'Solicitação de pré-reserva cancelada com sucesso.'
    );
END;
$$;

-- Permissões na função RPC
GRANT EXECUTE ON FUNCTION public.cancelar_pre_reserva(INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_pre_reserva(INT, TEXT) TO service_role;
