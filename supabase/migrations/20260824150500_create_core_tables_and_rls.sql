-- Migration to create and complement all required tables for Biblioteca CEP:
-- 1. profiles: id (uuid, PK, references auth.users), nome (text), email (text), papel (text: 'admin'|'operador'|'leitor'), bloqueado (boolean default false), created_at (timestamptz)
-- 2. titulos: id (uuid PK), codigo (text unique), titulo (text), autor (text), genero (text), editora (text), ano (int), isbn (text), capa_url (text), created_at
-- 3. exemplares: id (uuid PK), titulo_id (uuid FK titulos), codigo (text), estante (text), status (text: 'disponivel'|'emprestado'|'reservado'|'manutencao'), created_at
-- 4. leitores: id (uuid PK), nome (text), email (text), telefone (text), endereco (text), bloqueado (boolean default false), created_at
-- 5. emprestimos: id (uuid PK), exemplar_id (uuid FK exemplares), leitor_id (uuid FK leitores), data_emprestimo (date), data_prevista (date), data_devolucao (date nullable), renovado (boolean default false), status (text: 'ativo'|'devolvido'|'atrasado'), created_at
-- 6. reservas: id (uuid PK), titulo_id (uuid FK titulos), leitor_id (uuid FK leitores), data_reserva (timestamptz), status (text: 'pendente'|'atendida'|'cancelada'), created_at
-- 7. historico: id (uuid PK), tipo (text), descricao (text), entidade_tipo (text), entidade_id (uuid), usuario_id (uuid nullable), created_at (timestamptz default now())
-- 8. parametros: id (uuid PK default gen_random_uuid()), chave (text unique), valor (text), descricao (text), updated_at (timestamptz)

-- Fix profiles table columns
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nome TEXT,
  papel TEXT DEFAULT 'leitor',
  bloqueado BOOLEAN DEFAULT false,
  full_name TEXT,
  role TEXT DEFAULT 'leitor',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS papel TEXT DEFAULT 'leitor';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bloqueado BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'leitor';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Sync nome/papel with full_name/role if null
UPDATE public.profiles
SET nome = COALESCE(nome, full_name, split_part(email, '@', 1)),
    papel = COALESCE(papel, CASE WHEN role = 'admin' THEN 'admin' WHEN role = 'operador' THEN 'operador' ELSE 'leitor' END),
    full_name = COALESCE(full_name, nome, split_part(email, '@', 1)),
    role = COALESCE(role, papel, 'leitor')
WHERE nome IS NULL OR papel IS NULL OR full_name IS NULL OR role IS NULL;

-- 2. titulos
CREATE TABLE IF NOT EXISTS public.titulos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE,
  titulo TEXT NOT NULL,
  autor TEXT NOT NULL,
  genero TEXT,
  editora TEXT,
  ano INT,
  isbn TEXT,
  capa_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. exemplares
CREATE TABLE IF NOT EXISTS public.exemplares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo_id UUID NOT NULL REFERENCES public.titulos(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  estante TEXT,
  status TEXT NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel', 'emprestado', 'reservado', 'manutencao')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. leitores
CREATE TABLE IF NOT EXISTS public.leitores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  endereco TEXT,
  bloqueado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. emprestimos
CREATE TABLE IF NOT EXISTS public.emprestimos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exemplar_id UUID NOT NULL REFERENCES public.exemplares(id) ON DELETE RESTRICT,
  leitor_id UUID NOT NULL REFERENCES public.leitores(id) ON DELETE RESTRICT,
  data_emprestimo DATE NOT NULL DEFAULT CURRENT_DATE,
  data_prevista DATE NOT NULL,
  data_devolucao DATE,
  renovado BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'devolvido', 'atrasado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. reservas
CREATE TABLE IF NOT EXISTS public.reservas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo_id UUID NOT NULL REFERENCES public.titulos(id) ON DELETE RESTRICT,
  leitor_id UUID NOT NULL REFERENCES public.leitores(id) ON DELETE RESTRICT,
  data_reserva TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'atendida', 'cancelada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. historico
CREATE TABLE IF NOT EXISTS public.historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  entidade_tipo TEXT NOT NULL,
  entidade_id UUID NOT NULL,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. parametros
CREATE TABLE IF NOT EXISTS public.parametros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT UNIQUE NOT NULL,
  valor TEXT NOT NULL,
  descricao TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_titulos_codigo ON public.titulos(codigo);
CREATE INDEX IF NOT EXISTS idx_titulos_titulo_autor ON public.titulos(titulo, autor);
CREATE INDEX IF NOT EXISTS idx_exemplares_titulo_id ON public.exemplares(titulo_id);
CREATE INDEX IF NOT EXISTS idx_exemplares_status ON public.exemplares(status);
CREATE INDEX IF NOT EXISTS idx_leitores_email ON public.leitores(email);
CREATE INDEX IF NOT EXISTS idx_leitores_nome ON public.leitores(nome);
CREATE INDEX IF NOT EXISTS idx_emprestimos_exemplar ON public.emprestimos(exemplar_id);
CREATE INDEX IF NOT EXISTS idx_emprestimos_leitor ON public.emprestimos(leitor_id);
CREATE INDEX IF NOT EXISTS idx_emprestimos_status ON public.emprestimos(status);
CREATE INDEX IF NOT EXISTS idx_emprestimos_data_prevista ON public.emprestimos(data_prevista);
CREATE INDEX IF NOT EXISTS idx_reservas_titulo ON public.reservas(titulo_id);
CREATE INDEX IF NOT EXISTS idx_reservas_leitor ON public.reservas(leitor_id);
CREATE INDEX IF NOT EXISTS idx_reservas_status ON public.reservas(status);
CREATE INDEX IF NOT EXISTS idx_historico_entidade ON public.historico(entidade_tipo, entidade_id);
CREATE INDEX IF NOT EXISTS idx_historico_created_at ON public.historico(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parametros_chave ON public.parametros(chave);

-- Function to get current user papel
CREATE OR REPLACE FUNCTION public.get_current_user_papel()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_papel TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'anon';
  END IF;

  SELECT COALESCE(p.papel, p.role, 'leitor') INTO v_papel
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_papel IS NULL THEN
    v_papel := COALESCE(
      (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'papel'),
      (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'app_role'),
      (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'),
      'leitor'
    );
  END IF;

  RETURN v_papel;
END;
$$;

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.titulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exemplares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leitores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emprestimos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parametros ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------
-- RLS POLICIES FOR profiles
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_papel() IN ('admin', 'operador')
    OR id = auth.uid()
  );

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_user_papel() = 'admin'
    OR id = auth.uid()
  );

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.get_current_user_papel() = 'admin'
    OR id = auth.uid()
  )
  WITH CHECK (
    public.get_current_user_papel() = 'admin'
    OR id = auth.uid()
  );

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (
    public.get_current_user_papel() = 'admin'
  );

-- -------------------------------------------------------------
-- RLS POLICIES FOR titulos
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "titulos_select" ON public.titulos;
CREATE POLICY "titulos_select" ON public.titulos
  FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "titulos_insert" ON public.titulos;
CREATE POLICY "titulos_insert" ON public.titulos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_user_papel() IN ('admin', 'operador')
  );

DROP POLICY IF EXISTS "titulos_update" ON public.titulos;
CREATE POLICY "titulos_update" ON public.titulos
  FOR UPDATE TO authenticated
  USING (
    public.get_current_user_papel() IN ('admin', 'operador')
  )
  WITH CHECK (
    public.get_current_user_papel() IN ('admin', 'operador')
  );

DROP POLICY IF EXISTS "titulos_delete" ON public.titulos;
CREATE POLICY "titulos_delete" ON public.titulos
  FOR DELETE TO authenticated
  USING (
    public.get_current_user_papel() = 'admin'
  );

-- -------------------------------------------------------------
-- RLS POLICIES FOR exemplares
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "exemplares_select" ON public.exemplares;
CREATE POLICY "exemplares_select" ON public.exemplares
  FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "exemplares_insert" ON public.exemplares;
CREATE POLICY "exemplares_insert" ON public.exemplares
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_user_papel() IN ('admin', 'operador')
  );

DROP POLICY IF EXISTS "exemplares_update" ON public.exemplares;
CREATE POLICY "exemplares_update" ON public.exemplares
  FOR UPDATE TO authenticated
  USING (
    public.get_current_user_papel() IN ('admin', 'operador')
  )
  WITH CHECK (
    public.get_current_user_papel() IN ('admin', 'operador')
  );

DROP POLICY IF EXISTS "exemplares_delete" ON public.exemplares;
CREATE POLICY "exemplares_delete" ON public.exemplares
  FOR DELETE TO authenticated
  USING (
    public.get_current_user_papel() = 'admin'
  );

-- -------------------------------------------------------------
-- RLS POLICIES FOR leitores
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "leitores_select" ON public.leitores;
CREATE POLICY "leitores_select" ON public.leitores
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_papel() IN ('admin', 'operador')
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "leitores_insert" ON public.leitores;
CREATE POLICY "leitores_insert" ON public.leitores
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_user_papel() IN ('admin', 'operador')
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "leitores_update" ON public.leitores;
CREATE POLICY "leitores_update" ON public.leitores
  FOR UPDATE TO authenticated
  USING (
    public.get_current_user_papel() IN ('admin', 'operador')
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
  WITH CHECK (
    public.get_current_user_papel() IN ('admin', 'operador')
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "leitores_delete" ON public.leitores;
CREATE POLICY "leitores_delete" ON public.leitores
  FOR DELETE TO authenticated
  USING (
    public.get_current_user_papel() = 'admin'
  );

-- -------------------------------------------------------------
-- RLS POLICIES FOR emprestimos
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "emprestimos_select" ON public.emprestimos;
CREATE POLICY "emprestimos_select" ON public.emprestimos
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_papel() IN ('admin', 'operador')
    OR leitor_id IN (
      SELECT id FROM public.leitores WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "emprestimos_insert" ON public.emprestimos;
CREATE POLICY "emprestimos_insert" ON public.emprestimos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_user_papel() IN ('admin', 'operador')
  );

DROP POLICY IF EXISTS "emprestimos_update" ON public.emprestimos;
CREATE POLICY "emprestimos_update" ON public.emprestimos
  FOR UPDATE TO authenticated
  USING (
    public.get_current_user_papel() IN ('admin', 'operador')
  )
  WITH CHECK (
    public.get_current_user_papel() IN ('admin', 'operador')
  );

DROP POLICY IF EXISTS "emprestimos_delete" ON public.emprestimos;
CREATE POLICY "emprestimos_delete" ON public.emprestimos
  FOR DELETE TO authenticated
  USING (
    public.get_current_user_papel() = 'admin'
  );

-- -------------------------------------------------------------
-- RLS POLICIES FOR reservas
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "reservas_select" ON public.reservas;
CREATE POLICY "reservas_select" ON public.reservas
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_papel() IN ('admin', 'operador')
    OR leitor_id IN (
      SELECT id FROM public.leitores WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "reservas_insert" ON public.reservas;
CREATE POLICY "reservas_insert" ON public.reservas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_user_papel() IN ('admin', 'operador')
    OR leitor_id IN (
      SELECT id FROM public.leitores WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "reservas_update" ON public.reservas;
CREATE POLICY "reservas_update" ON public.reservas
  FOR UPDATE TO authenticated
  USING (
    public.get_current_user_papel() IN ('admin', 'operador')
    OR leitor_id IN (
      SELECT id FROM public.leitores WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    public.get_current_user_papel() IN ('admin', 'operador')
    OR leitor_id IN (
      SELECT id FROM public.leitores WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "reservas_delete" ON public.reservas;
CREATE POLICY "reservas_delete" ON public.reservas
  FOR DELETE TO authenticated
  USING (
    public.get_current_user_papel() = 'admin'
  );

-- -------------------------------------------------------------
-- RLS POLICIES FOR historico
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "historico_select" ON public.historico;
CREATE POLICY "historico_select" ON public.historico
  FOR SELECT TO authenticated
  USING (
    public.get_current_user_papel() IN ('admin', 'operador')
    OR usuario_id = auth.uid()
  );

DROP POLICY IF EXISTS "historico_insert" ON public.historico;
CREATE POLICY "historico_insert" ON public.historico
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "historico_delete" ON public.historico;
CREATE POLICY "historico_delete" ON public.historico
  FOR DELETE TO authenticated
  USING (
    public.get_current_user_papel() = 'admin'
  );

-- -------------------------------------------------------------
-- RLS POLICIES FOR parametros
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "parametros_select" ON public.parametros;
CREATE POLICY "parametros_select" ON public.parametros
  FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "parametros_all_admin" ON public.parametros;
CREATE POLICY "parametros_all_admin" ON public.parametros
  FOR ALL TO authenticated
  USING (
    public.get_current_user_papel() = 'admin'
  )
  WITH CHECK (
    public.get_current_user_papel() = 'admin'
  );
