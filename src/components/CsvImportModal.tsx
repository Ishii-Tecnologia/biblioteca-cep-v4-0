import React, { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  BookOpen,
} from 'lucide-react'
import { normalizeAndValidateIsbn, formatAuthorDisplay } from '@/services/isbn'
import { AuthorsService } from '@/services/authors'
import { supabase } from '@/lib/supabase/client'
import { getCsvSeparador } from '@/services/parametros'
import { downloadBookTemplateCsv, downloadBookFullExportCsv } from '@/lib/csv'
import { TitulosService } from '@/services/titulos'
import { calculateBookCodePrefix, BookCodeSequenceTracker } from '@/services/book-code'
import { HistoricoService } from '@/services/historico'

interface CsvRowParsed {
  rowNumber: number
  raw: Record<string, string>
  isbn: string
  normalizedIsbn: string
  titulo: string
  autor: string
  autor_espiritual: string
  autor_mediunico: string
  editora: string
  ano?: number
  categoria: string
  sinopse: string
  exemplares: number
  localizacao: string
  isValid: boolean
  errors: string[]
}

interface CsvImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  operatorName?: string
  colecao?: 'geral' | 'diretoria'
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  operatorName = 'Administrador',
  colecao = 'geral',
}) => {
  const isDiretoria = colecao === 'diretoria'
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [parsedRows, setParsedRows] = useState<CsvRowParsed[]>([])
  const [existingIsbns, setExistingIsbns] = useState<Set<string>>(new Set())
  const [summary, setSummary] = useState<{
    total: number
    valid: number
    invalid: number
    duplicates: number
  } | null>(null)
  const [importResult, setImportResult] = useState<{
    successCount: number
    errorCount: number
    totalCopies: number
    logs: string[]
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = () => {
    setFile(null)
    setParsing(false)
    setImporting(false)
    setParsedRows([])
    setExistingIsbns(new Set())
    setSummary(null)
    setImportResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  // Template CSV para download respeitando o separador configurado
  const handleDownloadTemplate = async () => {
    const configuredDelimiter = await getCsvSeparador()

    if (isDiretoria) {
      try {
        const booksData = await TitulosService.getAllForCsvExport('diretoria')
        if (booksData && booksData.length > 0) {
          downloadBookFullExportCsv(
            booksData,
            'template_importacao_acervo_diretoria.csv',
            configuredDelimiter,
          )
          return
        }
      } catch (err) {
        console.warn(
          'Falha ao carregar registros da diretoria para o modelo CSV, usando fallback genérico:',
          err,
        )
      }
      downloadBookTemplateCsv('template_importacao_acervo_diretoria.csv', configuredDelimiter)
      return
    }

    downloadBookTemplateCsv('template_importacao_acervo_cep.csv', configuredDelimiter)
  }

  // Leitura do arquivo tratando encoding UTF-8 com BOM e CP1252 / ISO-8859-1
  const readFileWithEncodings = async (fileToRead: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer
        if (!buffer) {
          resolve('')
          return
        }

        // Tentar decodificar como UTF-8
        try {
          const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
          const text = utf8Decoder.decode(buffer)
          resolve(text)
          return
        } catch {
          // Fallback para Windows-1252 / ISO-8859-1 (muito comum no Excel em PT-BR)
          try {
            const winDecoder = new TextDecoder('windows-1252')
            const text = winDecoder.decode(buffer)
            resolve(text)
          } catch {
            const latinDecoder = new TextDecoder('iso-8859-1')
            resolve(latinDecoder.decode(buffer))
          }
        }
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(fileToRead)
    })
  }

  // Separar linhas e detectar delimitador (; ou , ou tab) dando prioridade ao configurado em caso de empate
  const parseCsvText = (text: string, preferredDelimiter = ';') => {
    // Remover BOM se existir
    const cleanText = text.replace(/^\uFEFF/, '')
    const lines = cleanText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (lines.length < 2) {
      throw new Error('O arquivo CSV deve conter pelo menos o cabeçalho e uma linha de dados.')
    }

    const firstLine = lines[0]
    const semicolonCount = (firstLine.match(/;/g) || []).length
    const commaCount = (firstLine.match(/,/g) || []).length
    const tabCount = (firstLine.match(/\t/g) || []).length

    let delimiter = preferredDelimiter

    // Se houver uma contagem claramente dominante
    const maxCount = Math.max(semicolonCount, commaCount, tabCount)
    if (maxCount === 0) {
      delimiter = preferredDelimiter
    } else if (tabCount > semicolonCount && tabCount > commaCount) {
      delimiter = '\t'
    } else if (semicolonCount > commaCount && semicolonCount > tabCount) {
      delimiter = ';'
    } else if (commaCount > semicolonCount && commaCount > tabCount) {
      delimiter = ','
    } else {
      // Em caso de empate ou ambiguidade, priorizar o separador configurado pelo usuário
      if (preferredDelimiter === ';' && semicolonCount === maxCount) {
        delimiter = ';'
      } else if (preferredDelimiter === ',' && commaCount === maxCount) {
        delimiter = ','
      } else if (semicolonCount > 0 && semicolonCount >= commaCount) {
        delimiter = ';'
      } else if (commaCount > 0) {
        delimiter = ','
      } else {
        delimiter = preferredDelimiter
      }
    }

    const parseLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    const headers = parseLine(lines[0]).map((h) =>
      h
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_]/g, '_')
        .trim(),
    )

    const rawRows: Record<string, string>[] = []
    for (let i = 1; i < lines.length; i++) {
      const vals = parseLine(lines[i])
      const rowObj: Record<string, string> = {}
      headers.forEach((h, idx) => {
        rowObj[h] = vals[idx] || ''
      })
      rawRows.push(rowObj)
    }

    return { headers, rawRows }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setParsing(true)
    setImportResult(null)

    try {
      // Carregar ISBNs existentes no banco para deduplicação rápida
      const { data: dbTitulos } = await supabase.from('titulo').select('isbn')
      const dbIsbns = new Set<string>()
      ;(dbTitulos || []).forEach((t) => {
        if (t.isbn) {
          const val = normalizeAndValidateIsbn(t.isbn)
          if (val.valid) dbIsbns.add(val.isbn13)
          else dbIsbns.add(t.isbn.trim())
        }
      })
      setExistingIsbns(dbIsbns)

      const configuredDelimiter = await getCsvSeparador()
      const text = await readFileWithEncodings(selectedFile)
      const { rawRows } = parseCsvText(text, configuredDelimiter)

      const seenFileIsbns = new Set<string>()
      const rows: CsvRowParsed[] = []

      rawRows.forEach((r, idx) => {
        const rowNumber = idx + 2 // Linha 1 é cabeçalho
        const errors: string[] = []

        // Mapear campos tolerando nomes comuns
        const rawIsbn =
          r.isbn || r.codigo_isbn || r.cod_isbn || r.ean || r.isbn_13 || r.isbn_10 || ''
        const titulo = r.titulo || r.titulo_de_livro || r.nome_do_livro || r.obra || r.livro || ''
        const autor_espiritual =
          r.autor_espiritual || r.espirito || r.autor_esp || r.espiritual || ''
        const autor_mediunico = r.autor_mediunico || r.medium || r.autor_med || r.psicografia || ''
        const autor_geral = r.autor || r.autores || r.escritor || ''
        const editora = r.editora || r.editor || r.publicadora || ''
        const anoStr = r.ano_publicacao || r.ano || r.publicacao || ''
        const categoria = r.categoria || r.genero || r.assunto || 'Geral'
        const sinopse = r.sinopse || r.resumo || r.descricao || ''
        const exemplaresStr = r.exemplares || r.quantidade || r.copias || '1'
        const localizacao = r.localizacao || r.estante || r.prateleira || 'Estante Geral'

        // Validação F-09: ISBN Obrigatório e Válido
        if (!rawIsbn.trim()) {
          errors.push('ISBN obrigatório não informado.')
        }

        const isbnVal = normalizeAndValidateIsbn(rawIsbn)
        if (rawIsbn.trim() && !isbnVal.valid) {
          errors.push(isbnVal.error || 'ISBN inválido no formato ou dígito verificador.')
        }

        const normalizedIsbn = isbnVal.valid ? isbnVal.isbn13 : rawIsbn.trim()

        // Validação de unicidade contra o banco de dados
        if (normalizedIsbn && dbIsbns.has(normalizedIsbn)) {
          errors.push(`ISBN ${normalizedIsbn} já cadastrado no acervo.`)
        }

        // Validação de unicidade dentro do próprio lote CSV
        if (normalizedIsbn && seenFileIsbns.has(normalizedIsbn)) {
          errors.push(`ISBN duplicado dentro do próprio arquivo CSV.`)
        } else if (normalizedIsbn) {
          seenFileIsbns.add(normalizedIsbn)
        }

        // Validação de título
        if (!titulo.trim()) {
          errors.push('Título da obra não informado.')
        }

        // Validação de autor (deve ter autor geral ou autor espiritual/médium)
        if (!autor_espiritual.trim() && !autor_mediunico.trim() && !autor_geral.trim()) {
          errors.push('Informe ao menos um Autor, Autor Espiritual ou Médium.')
        }

        // Exemplares
        let exemplaresNum = parseInt(exemplaresStr, 10)
        if (isNaN(exemplaresNum) || exemplaresNum < 1) {
          exemplaresNum = 1
        }

        let anoNum: number | undefined
        if (anoStr) {
          const parsedAno = parseInt(anoStr, 10)
          if (!isNaN(parsedAno) && parsedAno > 1500 && parsedAno <= new Date().getFullYear() + 2) {
            anoNum = parsedAno
          }
        }

        rows.push({
          rowNumber,
          raw: r,
          isbn: rawIsbn,
          normalizedIsbn,
          titulo: titulo.trim(),
          autor: autor_geral.trim(),
          autor_espiritual: autor_espiritual.trim(),
          autor_mediunico: autor_mediunico.trim(),
          editora: editora.trim(),
          ano: anoNum,
          categoria: categoria.trim() || 'Geral',
          sinopse: sinopse.trim(),
          exemplares: exemplaresNum,
          localizacao: localizacao.trim() || 'Estante Geral',
          isValid: errors.length === 0,
          errors,
        })
      })

      const validCount = rows.filter((r) => r.isValid).length
      const invalidCount = rows.filter((r) => !r.isValid).length
      const dupCount = rows.filter((r) =>
        r.errors.some((e) => e.includes('já cadastrado') || e.includes('duplicado')),
      ).length

      setParsedRows(rows)
      setSummary({
        total: rows.length,
        valid: validCount,
        invalid: invalidCount,
        duplicates: dupCount,
      })
    } catch (err: any) {
      alert(
        `Erro ao processar CSV: ${err.message || 'Arquivo corrompido ou formato não suportado.'}`,
      )
      resetState()
    } finally {
      setParsing(false)
    }
  }

  // Executar a importação real das linhas válidas
  const handleExecuteImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid)
    if (validRows.length === 0) {
      alert('Nenhuma linha válida para importar.')
      return
    }

    setImporting(true)
    const logs: string[] = []
    let successCount = 0
    let totalCopiesCreated = 0
    let errorCount = 0

    const codeTracker = new BookCodeSequenceTracker()

    try {
      for (const row of validRows) {
        try {
          // 1. Cadastrar autores automaticamente na tabela authors (F-06 e F-04)
          if (row.autor_espiritual) {
            await AuthorsService.findOrCreate(row.autor_espiritual, 'ESPIRITO').catch(() => {})
          }
          if (row.autor_mediunico) {
            await AuthorsService.findOrCreate(row.autor_mediunico, 'MEDIUM').catch(() => {})
          }
          if (row.autor) {
            await AuthorsService.findOrCreate(row.autor, 'ENCARNADO').catch(() => {})
          }

          // 2. Gerar Código do Livro (id_titulo) seguindo a MESMA regra do cadastro manual
          // - Espírito + Médium: Iniciais do Médium + traço + Iniciais do Espírito + sequencial 3 dígitos (ex: CX-EM001)
          // - Autor Convencional: Iniciais do Autor + traço + sequencial 3 dígitos (ex: AK-001)
          const isSpiritMedium = !!(row.autor_espiritual || row.autor_mediunico)
          const prefix = calculateBookCodePrefix(
            isSpiritMedium,
            row.autor_mediunico,
            row.autor_espiritual,
            row.autor,
            isDiretoria ? 'diretoria' : 'geral',
          )

          // Obter próximo sequencial independente por prefixo, garantindo contagem única sem repetições
          const id_titulo = await codeTracker.nextCode(prefix)

          const autorFormatado = formatAuthorDisplay(
            row.autor_espiritual,
            row.autor_mediunico,
            row.autor,
          )

          // 3. Inserir título
          const { data: newTitulo, error: titErr } = await supabase
            .from('titulo')
            .insert({
              id_titulo,
              titulo_de_livro: row.titulo,
              autor: autorFormatado,
              autor_espiritual: row.autor_espiritual || null,
              autor_mediunico: row.autor_mediunico || null,
              editora: row.editora || null,
              ano_publicacao: row.ano || null,
              categoria: row.categoria || 'Geral',
              isbn: row.normalizedIsbn,
              sinopse: row.sinopse || null,
              ativo: true,
              vol: 0,
              colecao: isDiretoria ? 'diretoria' : 'geral',
            } as any)
            .select()
            .single()

          if (titErr) throw titErr

          // 4. Inserir exemplares gerados (código do exemplar = código do livro + traço + seq, ex: CX-EM001-1)
          const exemplaresToInsert = []
          for (let seq = 1; seq <= row.exemplares; seq++) {
            exemplaresToInsert.push({
              id_exemplar: `${newTitulo.id_titulo}-${seq}`,
              id_titulo: newTitulo.id_titulo,
              seq,
              status: 'Disponivel',
              localizacao: row.localizacao || 'Estante Geral',
            })
          }

          const { error: exErr } = await supabase.from('exemplar').insert(exemplaresToInsert)
          if (exErr) throw exErr

          successCount++
          totalCopiesCreated += row.exemplares
          logs.push(
            `[Linha ${row.rowNumber}] Cadastrado: "${row.titulo}" (Código: ${newTitulo.id_titulo}, ${row.exemplares} exemplar(es): ${newTitulo.id_titulo}-1${row.exemplares > 1 ? ` a ${newTitulo.id_titulo}-${row.exemplares}` : ''})`,
          )
        } catch (itemErr: any) {
          errorCount++
          logs.push(
            `[Linha ${row.rowNumber}] ERRO ao gravar "${row.titulo}": ${itemErr.message || 'Falha no banco'}`,
          )
        }
      }

      // 5. Registrar log geral de importação no Histórico Geral (F-01)
      await HistoricoService.log(
        'LOTE-CSV',
        'Importação CSV Acervo',
        null,
        `Importação de lote CSV concluída por ${operatorName}: ${successCount} títulos importados (${totalCopiesCreated} exemplares gerados), ${errorCount + (summary?.invalid || 0)} rejeitados/ignorados.`,
        operatorName,
        'titulo',
      )

      setImportResult({
        successCount,
        errorCount,
        totalCopies: totalCopiesCreated,
        logs,
      })

      onSuccess()
    } catch (globalErr: any) {
      alert(`Falha durante a importação: ${globalErr.message || 'Erro inesperado'}`)
    } finally {
      setImporting(false)
    }
  }

  // Dry-run preview: 10 primeiras linhas mapeadas
  const previewRows = parsedRows.slice(0, 10)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-xl">Importação de Acervo via CSV</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Importe múltiplos livros com validação estrita de ISBN, separação de
                  espírito/médium e dry-run preview.
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="gap-2 text-xs h-8 border-primary/30 text-primary hover:bg-primary/10"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar Modelo CSV
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Seção 1: Upload */}
          {!importResult && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  file
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center gap-2">
                  <UploadCloud className="w-10 h-10 text-primary" />
                  <p className="font-medium text-sm">
                    {file ? file.name : 'Clique para selecionar ou arraste o arquivo CSV aqui'}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Suporta delimitador vírgula ou ponto-e-vírgula (;), UTF-8 e CP1252 (Excel).
                    Linhas inválidas serão reportadas sem abortar o lote.
                  </p>
                </div>
              </div>

              {parsing && (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  Processando e validando linhas do CSV...
                </div>
              )}

              {/* Resumo do Dry-run */}
              {summary && !parsing && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-muted/40 rounded-lg border border-border">
                    <span className="text-xs text-muted-foreground block">Total de Linhas</span>
                    <span className="text-xl font-bold">{summary.total}</span>
                  </div>
                  <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                    <span className="text-xs block flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Válidas para Gravar
                    </span>
                    <span className="text-xl font-bold">{summary.valid}</span>
                  </div>
                  <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-amber-700 dark:text-amber-400">
                    <span className="text-xs block flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Duplicadas / Existentes
                    </span>
                    <span className="text-xl font-bold">{summary.duplicates}</span>
                  </div>
                  <div className="p-3 bg-rose-500/10 rounded-lg border border-rose-500/20 text-rose-700 dark:text-rose-400">
                    <span className="text-xs block flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> Inválidas / Rejeitadas
                    </span>
                    <span className="text-xl font-bold">{summary.invalid}</span>
                  </div>
                </div>
              )}

              {/* Preview das 10 primeiras linhas (Dry-Run) */}
              {parsedRows.length > 0 && !parsing && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-primary" />
                      Dry-Run Preview (Exibindo {Math.min(10, parsedRows.length)} de{' '}
                      {parsedRows.length} linhas)
                    </h4>
                    {parsedRows.length > 10 && (
                      <span className="text-xs text-muted-foreground">
                        + {parsedRows.length - 10} linhas adicionais no arquivo
                      </span>
                    )}
                  </div>

                  <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/80 sticky top-0 font-medium text-muted-foreground border-b">
                        <tr>
                          <th className="p-2.5">Linha</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">ISBN</th>
                          <th className="p-2.5">Título</th>
                          <th className="p-2.5">Autor(es) / Médium</th>
                          <th className="p-2.5">Exemplares</th>
                          <th className="p-2.5">Detalhes / Erros</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {previewRows.map((row) => (
                          <tr
                            key={row.rowNumber}
                            className={
                              row.isValid
                                ? 'hover:bg-muted/30'
                                : 'bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-100/30'
                            }
                          >
                            <td className="p-2.5 font-mono text-muted-foreground">
                              #{row.rowNumber}
                            </td>
                            <td className="p-2.5">
                              {row.isValid ? (
                                <Badge
                                  variant="outline"
                                  className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 gap-1 text-[10px]"
                                >
                                  <CheckCircle2 className="w-3 h-3" /> Válida
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-400 gap-1 text-[10px]"
                                >
                                  <XCircle className="w-3 h-3" /> Rejeitada
                                </Badge>
                              )}
                            </td>
                            <td className="p-2.5 font-mono">
                              {row.normalizedIsbn || row.isbn || (
                                <span className="text-muted-foreground italic">Vazio</span>
                              )}
                            </td>
                            <td className="p-2.5 font-medium max-w-[180px] truncate">
                              {row.titulo || (
                                <span className="text-rose-500 italic">Sem título</span>
                              )}
                            </td>
                            <td className="p-2.5 max-w-[160px] truncate text-muted-foreground">
                              {formatAuthorDisplay(
                                row.autor_espiritual,
                                row.autor_mediunico,
                                row.autor,
                              ) || '-'}
                            </td>
                            <td className="p-2.5">{row.exemplares} ex.</td>
                            <td className="p-2.5">
                              {row.isValid ? (
                                <span className="text-muted-foreground">Pronto para importar</span>
                              ) : (
                                <span className="text-rose-600 dark:text-rose-400 font-medium">
                                  {row.errors.join('; ')}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {summary && summary.invalid > 0 && (
                    <Alert variant="destructive" className="py-2 text-xs">
                      <AlertDescription>
                        {summary.invalid} linha(s) com erros de ISBN, título ou duplicidade serão
                        ignoradas durante a gravação, sem interromper o restante do lote.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Seção 2: Resultado da Importação */}
          {importResult && (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-200">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  <div>
                    <h4 className="font-semibold text-base">Importação Concluída com Sucesso!</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {importResult.successCount} novos títulos cadastrados e{' '}
                      {importResult.totalCopies} exemplares gerados no acervo.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Log de Execução
                </h5>
                <div className="p-3 bg-muted rounded-lg font-mono text-[11px] max-h-56 overflow-y-auto space-y-1 border">
                  {importResult.logs.map((log, i) => (
                    <div
                      key={i}
                      className={log.includes('ERRO') ? 'text-rose-500' : 'text-foreground'}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t bg-muted/20 flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={importing}>
            {importResult ? 'Fechar' : 'Cancelar'}
          </Button>

          {!importResult && (
            <div className="flex items-center gap-2">
              {parsedRows.length > 0 && (
                <Button variant="outline" size="sm" onClick={resetState} disabled={importing}>
                  Trocar Arquivo
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleExecuteImport}
                disabled={importing || !summary || summary.valid === 0}
                className="gap-2 bg-primary hover:bg-primary/90"
              >
                {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                {importing
                  ? 'Importando...'
                  : summary
                    ? `Confirmar e Gravar ${summary.valid} Obra(s)`
                    : 'Importar'}
              </Button>
            </div>
          )}

          {importResult && (
            <Button size="sm" onClick={handleClose}>
              Concluir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
