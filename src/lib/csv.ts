/**
 * Utilitários para padronização de arquivos CSV no sistema Biblioteca CEP.
 * Padrão adotado no projeto:
 * - Separador de campos: ponto e vírgula (;)
 * - Encoding: UTF-8 com BOM (\uFEFF) para compatibilidade nativa com Microsoft Excel e LibreOffice Calc pt-BR
 * - Tratamento de strings com delimitador, quebras de linha ou aspas duplas (RFC 4180 / compatível com Excel)
 */

export const CSV_DELIMITER = ';'

/**
 * Cabeçalhos oficiais do arquivo modelo / tabela de cadastro de livros.
 * Devem coincidir com a estrutura esperada pelo CsvImportModal para garantir
 * que a exportação da base sirva tanto de backup quanto de reimportação direta.
 */
export const BOOK_CSV_HEADERS = [
  'isbn',
  'titulo',
  'autor_espiritual',
  'autor_mediunico',
  'autor',
  'editora',
  'ano_publicacao',
  'categoria',
  'sinopse',
  'exemplares',
  'localizacao',
] as const

export type BookCsvHeaderKey = (typeof BOOK_CSV_HEADERS)[number]

export interface BookCsvExportItem {
  isbn?: string | null
  titulo?: string | null
  autor_espiritual?: string | null
  autor_mediunico?: string | null
  autor?: string | null
  editora?: string | null
  ano_publicacao?: string | number | null
  categoria?: string | null
  sinopse?: string | null
  exemplares?: string | number | null
  localizacao?: string | null
}

/**
 * Escapa e formata um valor individual para inclusão em CSV usando o delimitador especificado.
 * Regras:
 * - Se o valor contiver o separador (delimiter), quebras de linha (\n ou \r) ou aspas ("),
 *   o valor deve ser envolvido em aspas duplas e quaisquer aspas internas devem ser duplicadas ("").
 * - Se for nulo ou indefinido, retorna string vazia.
 */
export function formatCsvField(val: unknown, delimiter = CSV_DELIMITER): string {
  if (val === null || val === undefined) {
    return ''
  }

  const str = String(val)

  const mustQuote =
    str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')

  if (mustQuote) {
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}

/**
 * Gera o conteúdo em texto CSV para uma lista de objetos ou matriz de dados.
 */
export function generateCsvContent<T extends Record<string, unknown>>(
  data: T[],
  customHeaders?: { key: keyof T; label: string }[],
  delimiter: string = CSV_DELIMITER,
): string {
  if (!data || data.length === 0) {
    return ''
  }

  let headerKeys: string[] = []
  let headerLabels: string[] = []

  if (customHeaders && customHeaders.length > 0) {
    headerKeys = customHeaders.map((h) => String(h.key))
    headerLabels = customHeaders.map((h) => h.label)
  } else {
    headerKeys = Object.keys(data[0])
    headerLabels = headerKeys
  }

  const rows: string[] = []

  // Linha de cabeçalho
  rows.push(headerLabels.map((h) => formatCsvField(h, delimiter)).join(delimiter))

  // Linhas de dados
  for (const item of data) {
    const rowValues = headerKeys.map((key) => formatCsvField(item[key], delimiter))
    rows.push(rowValues.join(delimiter))
  }

  return rows.join('\r\n')
}

/**
 * Faz o download de um arquivo CSV gerado no navegador com BOM UTF-8 e separador ponto e vírgula.
 */
export function downloadCsvFile(content: string, filename: string): void {
  // Adiciona BOM UTF-8 (\uFEFF) para garantir reconhecimento automático de acentos em pt-BR
  const blob = new Blob(['\uFEFF' + content], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  const safeFilename = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`
  link.setAttribute('download', safeFilename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Exporta uma lista de objetos diretamente para arquivo CSV baixável.
 */
export function exportToCsv<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  customHeaders?: { key: keyof T; label: string }[],
  delimiter: string = CSV_DELIMITER,
): boolean {
  if (!data || data.length === 0) {
    return false
  }

  const csvContent = generateCsvContent(data, customHeaders, delimiter)
  downloadCsvFile(csvContent, filename)
  return true
}

/**
 * Gera o conteúdo do template oficial de importação do acervo de acordo com o separador configurado.
 */
export function generateBookTemplateCsv(delimiter = CSV_DELIMITER): string {
  const headers = BOOK_CSV_HEADERS

  const examples = [
    {
      isbn: '9788573286885',
      titulo: 'Nosso Lar',
      autor_espiritual: 'André Luiz',
      autor_mediunico: 'Chico Xavier',
      autor: '',
      editora: 'FEB',
      ano_publicacao: '2010',
      categoria: 'Doutrinário Espírita',
      sinopse: 'A vida no mundo espiritual narrada pelo espírito André Luiz.',
      exemplares: '2',
      localizacao: 'Estante 1',
    },
    {
      isbn: '9788573286878',
      titulo: 'O Livro dos Espíritos',
      autor_espiritual: '',
      autor_mediunico: '',
      autor: 'Allan Kardec',
      editora: 'FEB',
      ano_publicacao: '2015',
      categoria: 'Obras Básicas',
      sinopse: 'Filosofia e ciência espírita.',
      exemplares: '3',
      localizacao: 'Estante Central',
    },
    {
      isbn: '9788579450006',
      titulo: 'Missionários da Luz',
      autor_espiritual: 'André Luiz',
      autor_mediunico: 'Chico Xavier',
      autor: '',
      editora: 'FEB',
      ano_publicacao: '2011',
      categoria: 'Doutrinário Espírita',
      sinopse: 'Estudo sobre os processos de reencarnação.',
      exemplares: '1',
      localizacao: 'Estante 2',
    },
  ]

  const headerLine = headers.map((h) => formatCsvField(h, delimiter)).join(delimiter)
  const dataLines = examples.map((ex) =>
    headers
      .map((h) => formatCsvField((ex as Record<string, string>)[h], delimiter))
      .join(delimiter),
  )

  return [headerLine, ...dataLines].join('\r\n')
}

/**
 * Faz download do arquivo de template oficial de importação do acervo no formato CSV.
 */
export function downloadBookTemplateCsv(
  filename = 'template_importacao_acervo_cep.csv',
  delimiter = CSV_DELIMITER,
): void {
  const content = generateBookTemplateCsv(delimiter)
  downloadCsvFile(content, filename)
}

/**
 * Gera o conteúdo em CSV com todos os dados da base de livros,
 * seguindo a mesma ordem de colunas e formatação do template oficial de importação.
 */
export function generateBookFullExportCsv(
  books: BookCsvExportItem[],
  delimiter = CSV_DELIMITER,
): string {
  const headers = BOOK_CSV_HEADERS
  const headerLine = headers.map((h) => formatCsvField(h, delimiter)).join(delimiter)

  if (!books || books.length === 0) {
    return headerLine
  }

  const dataLines = books.map((item) =>
    headers
      .map((h) => {
        const val = item[h]
        return formatCsvField(val, delimiter)
      })
      .join(delimiter),
  )

  return [headerLine, ...dataLines].join('\r\n')
}

/**
 * Faz download do arquivo completo com todos os títulos da base,
 * com o nome padronizado tabela_cadastro_livros_cep.csv e BOM UTF-8.
 */
export function downloadBookFullExportCsv(
  books: BookCsvExportItem[],
  filename = 'tabela_cadastro_livros_cep.csv',
  delimiter = CSV_DELIMITER,
): void {
  const content = generateBookFullExportCsv(books, delimiter)
  downloadCsvFile(content, filename)
}
