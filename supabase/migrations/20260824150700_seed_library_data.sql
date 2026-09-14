-- Seed initial data for Biblioteca CEP
-- 1. Parameters: prazo_emprestimo_dias = 15, max_renovacoes = 1
-- 2. Initial titles (3-5 books) with copies (exemplares)
-- 3. Initial readers (2-3 leitores)
-- 4. Auth profiles check & seed loans and history

-- 1. Seed parametros
INSERT INTO public.parametros (chave, valor, descricao, updated_at) VALUES
  ('prazo_emprestimo_dias', '15', 'Prazo padrão em dias para devolução de empréstimos', NOW()),
  ('max_renovacoes', '1', 'Quantidade máxima de renovações permitidas por empréstimo', NOW()),
  ('multa_diaria_reais', '1.50', 'Valor da taxa por dia de atraso (R$)', NOW())
ON CONFLICT (chave) DO UPDATE
SET valor = EXCLUDED.valor,
    descricao = EXCLUDED.descricao,
    updated_at = NOW();

-- 2. Seed titulos and exemplares
DO $$
DECLARE
  v_titulo_1 UUID := 'b1111111-1111-4111-8111-111111111111'::UUID;
  v_titulo_2 UUID := 'b2222222-2222-4222-8222-222222222222'::UUID;
  v_titulo_3 UUID := 'b3333333-3333-4333-8333-333333333333'::UUID;
  v_titulo_4 UUID := 'b4444444-4444-4444-8444-444444444444'::UUID;
  v_titulo_5 UUID := 'b5555555-5555-4555-8555-555555555555'::UUID;

  v_leitor_1 UUID := 'c1111111-1111-4111-8111-111111111111'::UUID;
  v_leitor_2 UUID := 'c2222222-2222-4222-8222-222222222222'::UUID;
  v_leitor_3 UUID := 'c3333333-3333-4333-8333-333333333333'::UUID;

  v_ex_1_1 UUID := 'd1111111-1111-4111-8111-111111111111'::UUID;
  v_ex_1_2 UUID := 'd1111111-1111-4111-8111-111111111112'::UUID;
  v_ex_2_1 UUID := 'd2222222-2222-4222-8222-222222222221'::UUID;
  v_ex_3_1 UUID := 'd3333333-3333-4333-8333-333333333331'::UUID;
  v_ex_4_1 UUID := 'd4444444-4444-4444-8444-444444444441'::UUID;
  v_ex_5_1 UUID := 'd5555555-5555-4555-8555-555555555551'::UUID;
BEGIN
  -- Insert titulos
  INSERT INTO public.titulos (id, codigo, titulo, autor, genero, editora, ano, isbn, capa_url)
  VALUES
    (
      v_titulo_1,
      'DOM-CASM',
      'Dom Casmurro',
      'Machado de Assis',
      'Romance / Literatura Brasileira',
      'Garnier',
      1899,
      '9788594318602',
      'https://img.usecurling.com/p/400/600?q=classic+book+cover'
    ),
    (
      v_titulo_2,
      'MEM-POST',
      'Memórias Póstumas de Brás Cubas',
      'Machado de Assis',
      'Romance / Realismo',
      'Tipografia Nacional',
      1881,
      '9788572328654',
      'https://img.usecurling.com/p/400/600?q=literature+book'
    ),
    (
      v_titulo_3,
      'GRA-SER',
      'Grande Sertão: Veredas',
      'João Guimarães Rosa',
      'Ficção / Literatura Brasileira',
      'José Olympio',
      1956,
      '9788520926833',
      'https://img.usecurling.com/p/400/600?q=vintage+novel'
    ),
    (
      v_titulo_4,
      'VID-SEC',
      'Vidas Secas',
      'Graciliano Ramos',
      'Romance Regionalista',
      'José Olympio',
      1938,
      '9788501014529',
      'https://img.usecurling.com/p/400/600?q=brazilian+book'
    ),
    (
      v_titulo_5,
      'HOR-EST',
      'A Hora da Estrela',
      'Clarice Lispector',
      'Romance / Ficção Moderna',
      'José Olympio',
      1977,
      '9788532508119',
      'https://img.usecurling.com/p/400/600?q=clarice+lispector'
    )
  ON CONFLICT (id) DO UPDATE
  SET titulo = EXCLUDED.titulo,
      autor = EXCLUDED.autor,
      genero = EXCLUDED.genero,
      editora = EXCLUDED.editora,
      ano = EXCLUDED.ano,
      isbn = EXCLUDED.isbn,
      capa_url = EXCLUDED.capa_url;

  -- Insert exemplares
  INSERT INTO public.exemplares (id, titulo_id, codigo, estante, status)
  VALUES
    (v_ex_1_1, v_titulo_1, 'DOM-CASM-01', 'Estante A1 - Literatura Brasileira', 'disponivel'),
    (v_ex_1_2, v_titulo_1, 'DOM-CASM-02', 'Estante A1 - Literatura Brasileira', 'emprestado'),
    (v_ex_2_1, v_titulo_2, 'MEM-POST-01', 'Estante A2 - Realismo Brasileiro', 'disponivel'),
    (v_ex_3_1, v_titulo_3, 'GRA-SER-01', 'Estante B1 - Clássicos do Século XX', 'disponivel'),
    (v_ex_4_1, v_titulo_4, 'VID-SEC-01', 'Estante B2 - Regionalismo', 'disponivel'),
    (v_ex_5_1, v_titulo_5, 'HOR-EST-01', 'Estante C1 - Literatura Contemporânea', 'disponivel')
  ON CONFLICT (id) DO UPDATE
  SET codigo = EXCLUDED.codigo,
      estante = EXCLUDED.estante,
      status = EXCLUDED.status;

  -- Insert leitores
  INSERT INTO public.leitores (id, nome, email, telefone, endereco, bloqueado)
  VALUES
    (
      v_leitor_1,
      'Lucas Mendes',
      'leitor@cep.edu.br',
      '(41) 98888-1234',
      'Rua XV de Novembro, 1200 - Centro, Curitiba - PR',
      false
    ),
    (
      v_leitor_2,
      'Mariana Silva Rocha',
      'mariana.rocha@cep.edu.br',
      '(41) 97777-5678',
      'Av. Sete de Setembro, 450 - Batel, Curitiba - PR',
      false
    ),
    (
      v_leitor_3,
      'Carlos Eduardo Ferreira',
      'carlos.ferreira@cep.edu.br',
      '(41) 96666-9012',
      'Rua Marechal Deodoro, 890 - Alto da Glória, Curitiba - PR',
      false
    )
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      email = EXCLUDED.email,
      telefone = EXCLUDED.telefone,
      endereco = EXCLUDED.endereco,
      bloqueado = EXCLUDED.bloqueado;

  -- Insert sample active loan for Lucas
  INSERT INTO public.emprestimos (
    exemplar_id,
    leitor_id,
    data_emprestimo,
    data_prevista,
    data_devolucao,
    renovado,
    status
  )
  SELECT
    v_ex_1_2,
    v_leitor_1,
    CURRENT_DATE - INTERVAL '5 days',
    CURRENT_DATE + INTERVAL '10 days',
    NULL,
    false,
    'ativo'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.emprestimos WHERE exemplar_id = v_ex_1_2 AND status = 'ativo'
  );

  -- Insert sample reservation
  INSERT INTO public.reservas (
    titulo_id,
    leitor_id,
    data_reserva,
    status
  )
  SELECT
    v_titulo_1,
    v_leitor_2,
    NOW() - INTERVAL '1 day',
    'pendente'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservas WHERE titulo_id = v_titulo_1 AND leitor_id = v_leitor_2 AND status = 'pendente'
  );

  -- Insert sample history
  INSERT INTO public.historico (
    tipo,
    descricao,
    entidade_tipo,
    entidade_id,
    usuario_id
  )
  VALUES
    (
      'cadastro',
      'Acervo inicial cadastrado com sucesso no sistema Biblioteca CEP.',
      'titulo',
      v_titulo_1,
      NULL
    ),
    (
      'emprestimo',
      'Empréstimo do exemplar DOM-CASM-02 realizado para Lucas Mendes.',
      'emprestimo',
      v_ex_1_2,
      NULL
    );

END $$;
