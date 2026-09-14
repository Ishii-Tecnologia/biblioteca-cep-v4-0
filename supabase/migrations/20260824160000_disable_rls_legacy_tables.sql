-- Migration to disable RLS on the active legacy tables with real data
-- Access control is handled via useAuth on frontend and RPC functions on backend.

ALTER TABLE public.titulo DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exemplar DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.leitor DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emprestimo DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserva DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_movimentacao DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.parametro_sistema DISABLE ROW LEVEL SECURITY;

-- Ensure default system parameters exist if not present (omitting id_parametro since it is GENERATED ALWAYS AS IDENTITY)
INSERT INTO public.parametro_sistema (nome_parametro, valor_parametro, descricao)
VALUES
  ('prazo_emprestimo_dias', '15', 'Prazo padrão de empréstimo em dias corridos'),
  ('max_renovacoes', '1', 'Número máximo de renovações permitidas por empréstimo'),
  ('max_exemplares_por_leitor', '3', 'Limite máximo de livros simultâneos por leitor'),
  ('prazo_reserva_dias', '5', 'Prazo de tolerância para retirada de reserva em dias'),
  ('nome_biblioteca', 'Biblioteca CEP', 'Nome da instituição / biblioteca')
ON CONFLICT (nome_parametro) DO UPDATE
SET descricao = EXCLUDED.descricao;
