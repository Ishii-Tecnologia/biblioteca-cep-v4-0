-- Criar tabela de categorias com id serial, nome text unique e created_at timestamptz
CREATE TABLE IF NOT EXISTS public.categorias (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ativar RLS
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para categorias
DROP POLICY IF EXISTS "categorias_select_all" ON public.categorias;
CREATE POLICY "categorias_select_all" ON public.categorias
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "categorias_insert_admin_operador" ON public.categorias;
CREATE POLICY "categorias_insert_admin_operador" ON public.categorias
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "categorias_update_admin_operador" ON public.categorias;
CREATE POLICY "categorias_update_admin_operador" ON public.categorias
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "categorias_delete_admin" ON public.categorias;
CREATE POLICY "categorias_delete_admin" ON public.categorias
  FOR DELETE TO authenticated USING (true);

-- Permissões
GRANT ALL ON TABLE public.categorias TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.categorias_id_seq TO anon, authenticated, service_role;

-- Preencher categorias a partir dos títulos existentes
INSERT INTO public.categorias (nome)
SELECT DISTINCT TRIM(categoria)
FROM public.titulo
WHERE categoria IS NOT NULL AND TRIM(categoria) <> ''
ON CONFLICT (nome) DO NOTHING;
