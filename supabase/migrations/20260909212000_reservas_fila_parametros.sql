-- Migration: Adicionar data_limite_desejada na tabela reserva e novos parâmetros de Reservas & Fila de Espera

DO $$
BEGIN
  -- 1. Coluna data_limite_desejada na tabela reserva (item 1.2 dos requisitos)
  ALTER TABLE public.reserva ADD COLUMN IF NOT EXISTS data_limite_desejada date;

  -- 2. Inserir os parâmetros padrão das variáveis configuráveis (itens 3, 4 e 5 dos requisitos)
  INSERT INTO public.parametros (chave, valor, descricao)
  VALUES
    (
      'email_liberacao_titulo',
      'Livro {titulo_do_livro} liberado para empréstimo.',
      'Template do assunto do e-mail de liberação de livro da fila de espera. Variáveis disponíveis: {titulo_do_livro}, {nome_do_leitor}, {prazo_retirada_dias_uteis}.'
    ),
    (
      'email_liberacao_mensagem',
      'O livro {titulo_do_livro} está liberado para empréstimo. Você tem o prazo de 7 dias úteis para a retirada. Procure a Biblioteca para realizar o empréstimo. Obrigado! CEP',
      'Template do corpo da mensagem de notificação de liberação de livro para retirada. Variáveis disponíveis: {titulo_do_livro}, {nome_do_leitor}, {prazo_retirada_dias_uteis}, {data_limite_retirada}.'
    ),
    (
      'prazo_retirada_dias_uteis',
      '7',
      'Prazo em dias úteis para o leitor comparecer à biblioteca e retirar o exemplar liberado antes que a vez passe ao próximo da fila.'
    ),
    (
      'limite_maximo_fila_espera',
      '3',
      'Quantidade máxima de leitores permitidos simultaneamente na fila de espera de cada obra.'
    )
  ON CONFLICT (chave) DO NOTHING;
END $$;
