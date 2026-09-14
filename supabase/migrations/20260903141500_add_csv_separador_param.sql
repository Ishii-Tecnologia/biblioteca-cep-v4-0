-- Adiciona o parâmetro de configuração do separador padrão CSV no banco de dados
INSERT INTO public.parametros (chave, valor, descricao)
VALUES (
  'csv_separador',
  ';',
  'Separador padrão utilizado nas importações e exportações de arquivos CSV (; ou ,).'
)
ON CONFLICT (chave) DO NOTHING;
