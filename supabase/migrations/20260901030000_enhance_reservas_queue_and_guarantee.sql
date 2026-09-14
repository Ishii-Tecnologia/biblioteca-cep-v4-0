-- Migration: Adicionar suporte à gestão avançada de fila, reserva garantida e notificações
-- Adiciona ordem_fila, data_limite_retirada, exemplar_reservado_id e expande status_reserva

DO $$
BEGIN
  -- 1. Adicionar novas colunas na tabela reserva
  ALTER TABLE public.reserva ADD COLUMN IF NOT EXISTS ordem_fila integer DEFAULT 0;
  ALTER TABLE public.reserva ADD COLUMN IF NOT EXISTS data_limite_retirada timestamp with time zone;
  ALTER TABLE public.reserva ADD COLUMN IF NOT EXISTS exemplar_reservado_id character varying REFERENCES public.exemplar(id_exemplar) ON DELETE SET NULL;
  ALTER TABLE public.reserva ADD COLUMN IF NOT EXISTS notificacao_enviada boolean DEFAULT false;
  ALTER TABLE public.reserva ADD COLUMN IF NOT EXISTS data_notificacao timestamp with time zone;

  -- 2. Atualizar constraint de status para suportar 'Pronta para Retirada' e 'Expirada' se necessário
  ALTER TABLE public.reserva DROP CONSTRAINT IF EXISTS reserva_status_reserva_check;
  ALTER TABLE public.reserva ADD CONSTRAINT reserva_status_reserva_check 
    CHECK (status_reserva::text = ANY (ARRAY['Ativa'::character varying, 'Pronta para Retirada'::character varying, 'Atendida'::character varying, 'Cancelada'::character varying, 'Expirada'::character varying]::text[]));

  -- 3. Inserir parâmetros para Reserva Garantida (em horas/dias) e Notificações se não existirem
  INSERT INTO public.parametros (chave, valor, descricao)
  VALUES 
    ('tempo_reserva_garantida_horas', '24', 'Tempo em horas de reserva garantida para o leitor buscar o livro na biblioteca após ficar disponível.'),
    ('notificacoes_email_ativas', 'true', 'Habilitar envio/simulação de notificações por e-mail quando o livro estiver pronto para retirada.'),
    ('notificacoes_push_ativas', 'true', 'Habilitar notificações push no navegador e mobile para avisos de reserva pronta e mudanças na fila.')
  ON CONFLICT (chave) DO NOTHING;

  -- 4. Inicializar ordem_fila com base na data_reserva para reservas existentes
  WITH ranked AS (
    SELECT id_reserva, ROW_NUMBER() OVER (PARTITION BY id_titulo, status_reserva ORDER BY data_reserva ASC) as rn
    FROM public.reserva
    WHERE status_reserva IN ('Ativa', 'Pronta para Retirada')
  )
  UPDATE public.reserva r
  SET ordem_fila = ranked.rn
  FROM ranked
  WHERE r.id_reserva = ranked.id_reserva AND (r.ordem_fila IS NULL OR r.ordem_fila = 0);

END $$;

-- Criar índices para otimizar busca de filas e ordenação
CREATE INDEX IF NOT EXISTS idx_reserva_ordem_fila ON public.reserva(id_titulo, ordem_fila, data_reserva);
CREATE INDEX IF NOT EXISTS idx_reserva_limite_retirada ON public.reserva(data_limite_retirada);
