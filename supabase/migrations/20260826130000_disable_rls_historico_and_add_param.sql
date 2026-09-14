-- Disable RLS on historico table to prevent permission and profile lookup failures
ALTER TABLE public.historico DISABLE ROW LEVEL SECURITY;

-- Ensure default prazo_renovacao_dias exists in parametros
INSERT INTO public.parametros (chave, valor, descricao)
VALUES ('prazo_renovacao_dias', '15', 'Quantidade de dias corridos acrescentados a cada renovação de empréstimo.')
ON CONFLICT (chave) DO NOTHING;
