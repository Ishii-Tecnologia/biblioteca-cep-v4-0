import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Simple pure-JS multi-page PDF generator using PDF 1.4 syntax
// Produces compliant A4 pages (595x842pt) with Helvetica fonts, headers, table columns and page numbering.
export interface PdfColumn {
  title: string
  width: number // Column width in characters
  align?: 'left' | 'right'
}

function truncateText(str: string, maxLen: number): string {
  const clean = (str || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLen) return clean
  if (maxLen <= 3) return clean.slice(0, maxLen)
  return clean.slice(0, maxLen - 2) + '..'
}

function padText(str: string, len: number, align: 'left' | 'right' = 'left'): string {
  const truncated = truncateText(str, len)
  if (truncated.length >= len) return truncated
  const diff = len - truncated.length
  if (align === 'right') {
    return ' '.repeat(diff) + truncated
  }
  return truncated + ' '.repeat(diff)
}

function formatRow(cells: string[], cols: PdfColumn[]): string {
  return cols
    .map((col, idx) => padText(cells[idx] || '', col.width, col.align || 'left'))
    .join('  |  ')
}

function createMultiPagePdfDocument(
  title: string,
  subtitle: string,
  metaLines: string[],
  columns: PdfColumn[],
  tableRows: string[][],
): Uint8Array {
  // Capacidade por página em A4 (842pt altura)
  // Página 1: Título, subtítulo, metadados, cabeçalho de tabela -> sobra para ~42 linhas
  // Páginas 2..N: Cabeçalho compacto ("Biblioteca CEP - Relatorio de Auditoria (Continuacao)"), cabeçalho de tabela -> ~50 linhas
  const ROWS_PAGE_1 = 40
  const ROWS_OTHER_PAGES = 50

  const pagesData: string[][][] = []
  if (tableRows.length === 0) {
    pagesData.push([])
  } else {
    // Primeira página
    pagesData.push(tableRows.slice(0, ROWS_PAGE_1))
    let cursor = ROWS_PAGE_1
    while (cursor < tableRows.length) {
      pagesData.push(tableRows.slice(cursor, cursor + ROWS_OTHER_PAGES))
      cursor += ROWS_OTHER_PAGES
    }
  }

  const totalPages = pagesData.length
  const headerStr = formatRow(
    columns.map((c) => c.title),
    columns,
  )
  const dividerStr = '='.repeat(headerStr.length)

  // Gerar streams de conteúdo para cada página
  const pageStreamContents: string[] = []

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageNum = pageIdx + 1
    const rowsThisPage = pagesData[pageIdx]
    const streamLines: string[] = []

    streamLines.push('BT') // Begin text

    if (pageNum === 1) {
      // Título
      streamLines.push('/F2 14 Tf') // Helvetica-Bold 14pt
      streamLines.push('40 800 Td')
      streamLines.push(`(${escapePdfText(title)}) Tj`)

      // Subtítulo
      streamLines.push('/F1 9 Tf')
      streamLines.push('0 -16 Td')
      streamLines.push(`(${escapePdfText(subtitle)}) Tj`)

      // Metadados
      streamLines.push('/F1 8.5 Tf')
      streamLines.push('0 -15 Td')
      for (const m of metaLines) {
        streamLines.push(`(${escapePdfText(m)}) Tj`)
        streamLines.push('0 -12 Td')
      }

      // Espaço antes da tabela
      streamLines.push('0 -6 Td')
    } else {
      // Cabeçalho simplificado para páginas seguintes
      streamLines.push('/F2 11 Tf')
      streamLines.push('40 805 Td')
      streamLines.push(`(${escapePdfText(`${title} - Continuacao`)}) Tj`)

      streamLines.push('/F1 8 Tf')
      streamLines.push('0 -14 Td')
      streamLines.push(
        `(${escapePdfText(`Documento oficial de auditoria da Biblioteca CEP | Registros do periodo`)}) Tj`,
      )
      streamLines.push('0 -10 Td')
    }

    // Cabeçalho da tabela (repetido em todas as páginas)
    streamLines.push('/F2 8 Tf')
    streamLines.push(`(${escapePdfText(headerStr)}) Tj`)
    streamLines.push('0 -10 Td')
    streamLines.push(`(${escapePdfText(dividerStr)}) Tj`)

    // Linhas de registros
    streamLines.push('/F1 7.5 Tf')
    if (rowsThisPage.length === 0 && pageNum === 1) {
      streamLines.push('0 -16 Td')
      streamLines.push(
        `(${escapePdfText('Nenhum registro de auditoria encontrado para o periodo selecionado.')}) Tj`,
      )
    } else {
      for (const row of rowsThisPage) {
        streamLines.push('0 -11.5 Td')
        const formatted = formatRow(row, columns)
        streamLines.push(`(${escapePdfText(formatted)}) Tj`)
      }
    }

    // Rodapé fixo com numeração: Pagina X de Y
    // Usamos T* / Td absoluto recomeçando bloco de texto para posicionar com precisão no rodapé (y=30)
    streamLines.push('ET') // Fecha bloco de dados da tabela
    streamLines.push('BT') // Abre bloco do rodapé
    streamLines.push('/F1 7.5 Tf')
    streamLines.push('40 30 Td')
    const footerText = `Biblioteca CEP - Sistema de Gestao Bibliotecaria | Pagina ${pageNum} de ${totalPages}`
    streamLines.push(`(${escapePdfText(footerText)}) Tj`)
    streamLines.push('ET')

    pageStreamContents.push(streamLines.join('\n'))
  }

  // Montagem do grafo de objetos PDF 1.4
  // Estrutura de numeração de objetos:
  // 1: Catalog
  // 2: Outlines
  // 3: Font F1 (Helvetica)
  // 4: Font F2 (Helvetica-Bold)
  // 5: Pages (raiz com contagem totalPages)
  // Páginas 1..totalPages:
  //   Objeto da Página N: 5 + N
  // Conteúdos das Páginas 1..totalPages:
  //   Objeto do Stream N: 5 + totalPages + N
  // Total de objetos = 5 + 2 * totalPages
  const totalObjects = 5 + 2 * totalPages
  const catalogObjNum = 1
  const outlinesObjNum = 2
  const fontF1ObjNum = 3
  const fontF2ObjNum = 4
  const pagesObjNum = 5

  const pageObjNums: number[] = []
  for (let i = 0; i < totalPages; i++) {
    pageObjNums.push(pagesObjNum + 1 + i)
  }

  const streamObjNums: number[] = []
  for (let i = 0; i < totalPages; i++) {
    streamObjNums.push(pagesObjNum + totalPages + 1 + i)
  }

  const objects: { num: number; content: string }[] = []

  // 1: Catalog
  objects.push({
    num: catalogObjNum,
    content: `${catalogObjNum} 0 obj\n<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>\nendobj\n`,
  })

  // 2: Outlines
  objects.push({
    num: outlinesObjNum,
    content: `${outlinesObjNum} 0 obj\n<< /Type /Outlines /Count 0 >>\nendobj\n`,
  })

  // 3: Font F1 (Helvetica)
  objects.push({
    num: fontF1ObjNum,
    content: `${fontF1ObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  })

  // 4: Font F2 (Helvetica-Bold)
  objects.push({
    num: fontF2ObjNum,
    content: `${fontF2ObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`,
  })

  // 5: Pages
  const kidsStr = pageObjNums.map((n) => `${n} 0 R`).join(' ')
  objects.push({
    num: pagesObjNum,
    content: `${pagesObjNum} 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${totalPages} >>\nendobj\n`,
  })

  // Páginas
  for (let i = 0; i < totalPages; i++) {
    const pNum = pageObjNums[i]
    const sNum = streamObjNums[i]
    objects.push({
      num: pNum,
      content: `${pNum} 0 obj\n<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [0 0 595 842] /Contents ${sNum} 0 R /Resources << /Font << /F1 ${fontF1ObjNum} 0 R /F2 ${fontF2ObjNum} 0 R >> >> >>\nendobj\n`,
    })
  }

  // Streams de cada página
  for (let i = 0; i < totalPages; i++) {
    const sNum = streamObjNums[i]
    const streamData = pageStreamContents[i]
    const streamBytes = new TextEncoder().encode(streamData)
    objects.push({
      num: sNum,
      content: `${sNum} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${streamData}\nendstream\nendobj\n`,
    })
  }

  // Ordenar objetos pelo número
  objects.sort((a, b) => a.num - b.num)

  // Construir PDF com tabela de referência cruzada (xref)
  let offset = 9 // Comprimento de '%PDF-1.4\n'
  const xref: string[] = ['xref', `0 ${totalObjects + 1}`, '0000000000 65535 f ']

  for (const obj of objects) {
    const pad = ('0000000000' + offset).slice(-10)
    xref.push(`${pad} 00000 n `)
    offset += new TextEncoder().encode(obj.content).length
  }

  const startxref = offset
  const trailer = `trailer\n<< /Size ${totalObjects + 1} /Root ${catalogObjNum} 0 R >>\nstartxref\n${startxref}\n%%EOF\n`

  const finalPdfStr =
    '%PDF-1.4\n' + objects.map((o) => o.content).join('') + xref.join('\n') + '\n' + trailer
  return new TextEncoder().encode(finalPdfStr)
}

function escapePdfText(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos para fonte padrão Helvetica
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

// Substitui {variavel} pelos valores fornecidos e remove quaisquer placeholders não reconhecidos
function interpolateTemplate(template: string, vars: Record<string, string>): string {
  if (!template) return ''
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key] ?? ''
    }
    return ''
  })
}

// Validação de formato de e-mail (regex)
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    // Usar estritamente a chave SUPABASE_SERVICE_ROLE_KEY para contornar RLS e executar tarefas administrativas
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Configuração do servidor ausente (SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos).',
          message: 'Configuração de backend incompleta no ambiente.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    let body: any = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }
    const { action = 'executar_job', force = false, test_email = false, manual = false } = body
    const isManualRun = manual === true || action === 'enviar_manual' || action === 'enviar_teste'

    // 1. Carregar parâmetros atuais da tabela public.parametros
    const { data: paramsData, error: paramsErr } = await supabaseAdmin
      .from('parametros')
      .select('chave, valor')

    if (paramsErr) throw paramsErr

    const paramMap = new Map<string, string>()
    ;(paramsData || []).forEach((p: { chave: string; valor: string }) =>
      paramMap.set(p.chave, p.valor),
    )

    const ativo = paramMap.get('auditoria_envio_ativo') === 'true'
    const rawDestinatarios = paramMap.get('auditoria_destinatarios') || ''
    const assuntoTemplate =
      paramMap.get('auditoria_assunto') || 'Relatório de Auditoria — {data_referencia}'
    const corpoTemplate =
      paramMap.get('auditoria_corpo') || 'Segue em anexo o Relatório de Auditoria.'
    const remetente = paramMap.get('auditoria_remetente') || 'sys.biblioteca.cep@email.org'
    const diasRetroativos = Math.max(
      1,
      Math.min(365, parseInt(paramMap.get('auditoria_dias_retroativos') || '30', 10)),
    )
    const diaEnvioConfig = Math.max(
      1,
      Math.min(31, parseInt(paramMap.get('auditoria_dia_envio') || '1', 10)),
    )
    const diasRetencao = Math.max(1, parseInt(paramMap.get('auditoria_dias_retencao') || '90', 10))

    // Timezone America/Sao_Paulo
    const nowUtc = new Date()
    // Obter data/hora formatada no fuso America/Sao_Paulo
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    const parts = formatter.formatToParts(nowUtc)
    const partMap: Record<string, string> = {}
    parts.forEach((p) => {
      partMap[p.type] = p.value
    })

    const currentYear = parseInt(partMap.year, 10)
    const currentMonth = parseInt(partMap.month, 10)
    const currentDay = parseInt(partMap.day, 10)
    const anoMes = `${partMap.year}-${partMap.month}`
    const dataReferenciaExtenso = `${partMap.day}/${partMap.month}/${partMap.year} ${partMap.hour}:${partMap.minute}`

    // Determinar o último dia do mês atual para regras de meses mais curtos (fevereiro 28/29, abril 30, etc.)
    const lastDayOfMonth = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate()
    const targetExecutionDay = Math.min(diaEnvioConfig, lastDayOfMonth)

    // Se for ação de notificação avulsa de reserva / fila de espera
    if (action === 'enviar_notificacao_reserva') {
      const targetEmails = Array.isArray(body.to) ? body.to : [body.to].filter(Boolean)
      const subject = body.subject || 'Livro liberado para empréstimo'
      const textBody = body.body || 'Seu livro reservado está pronto para retirada.'

      const emailResult = await sendEmailOrSimulate({
        to: targetEmails,
        from: remetente,
        subject,
        body: textBody,
      })

      return new Response(
        JSON.stringify({
          success: emailResult.success,
          message: emailResult.message,
          provider: emailResult.provider,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Se for ação explícita de teste legada, manter compatibilidade
    if (action === 'enviar_teste_amostra') {
      return await handleSendTest({
        supabaseAdmin,
        rawDestinatarios,
        remetente,
        assuntoTemplate,
        corpoTemplate,
        diasRetroativos,
        dataReferenciaExtenso,
      })
    }

    // Se a ação for execução do job agendado (automático)
    if (!isManualRun && !force) {
      if (!ativo) {
        return new Response(
          JSON.stringify({
            success: false,
            skipped: true,
            message: 'Envio automático inativo nas configurações do sistema.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Validação do dia do mês quando não for disparo manual
      if (currentDay !== targetExecutionDay) {
        return new Response(
          JSON.stringify({
            success: false,
            skipped: true,
            message: `Hoje é dia ${currentDay}, mas o job está configurado para o dia ${targetExecutionDay} do mês.`,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Validação de Idempotência: verificar se já rodou com sucesso no mês atual
      const { data: existingExecution } = await supabaseAdmin
        .from('job_execucoes')
        .select('*')
        .eq('ano_mes', anoMes)
        .eq('tipo_job', 'auditoria_mensal_expurgo')
        .maybeSingle()

      if (existingExecution && existingExecution.status === 'sucesso') {
        return new Response(
          JSON.stringify({
            success: true,
            skipped: true,
            message: `Job mensal de auditoria já foi executado com sucesso para ${anoMes} em ${existingExecution.data_execucao}.`,
            execucao: existingExecution,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // 2. Tratar lista mista de e-mails: separar válidos e inválidos
    const emailList = rawDestinatarios
      .split(',')
      .map((e: string) => e.trim())
      .filter((e: string) => e.length > 0)

    const validEmails: string[] = []
    const invalidEmails: string[] = []

    for (const email of emailList) {
      if (EMAIL_REGEX.test(email)) {
        validEmails.push(email)
      } else {
        invalidEmails.push(email)
      }
    }

    if (invalidEmails.length > 0) {
      // Registrar aviso na auditoria sobre e-mails inválidos encontrados
      await supabaseAdmin.from('historico').insert({
        tipo: 'Aviso de Configuração de E-mail',
        descricao: `E-mails inválidos ignorados na lista de destinatários de auditoria: ${invalidEmails.join(', ')}`,
        entidade_tipo: 'sistema',
        entidade_id: 'job_auditoria',
        observacao: 'Apenas os destinatários válidos receberão o relatório mensal.',
      })
    }

    if (validEmails.length === 0) {
      const errMsg =
        'Nenhum e-mail de destinatário válido configurado para o envio do relatório de auditoria.'
      try {
        await supabaseAdmin.from('historico').insert({
          tipo: 'Falha no Envio de Auditoria',
          descricao: errMsg,
          entidade_tipo: 'sistema',
          entidade_id: 'job_auditoria',
          observacao: 'O expurgo NÃO foi realizado devido à ausência de destinatários válidos.',
        })
      } catch (logErr) {
        console.warn('Não foi possível gravar histórico de falha:', logErr)
      }

      return new Response(JSON.stringify({ success: false, error: errMsg, message: errMsg }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Iniciar registro de execução do Job (lock/registro inicial)
    const startTime = Date.now()
    const initMessage = isManualRun
      ? 'Executando disparo manual do relatório de auditoria em PDF e envio de e-mail...'
      : 'Executando geração de relatório em PDF e disparo do job mensal...'

    let jobRecord: any = null
    if (!isManualRun) {
      // No agendamento automático mensal, manter upsert com a chave composta (ano_mes, tipo_job)
      const { data: record } = await supabaseAdmin
        .from('job_execucoes')
        .upsert(
          {
            ano_mes: anoMes,
            tipo_job: 'auditoria_mensal_expurgo',
            status: 'pendente',
            destinatarios: validEmails.join(', '),
            mensagem: initMessage,
          },
          { onConflict: 'ano_mes,tipo_job' },
        )
        .select()
        .single()
      jobRecord = record
    } else {
      // No disparo manual, para não sobrescrever nem violar a chave de idempotência mensal,
      // registramos o registro com tipo_job explicativo 'auditoria_manual'
      const { data: record } = await supabaseAdmin
        .from('job_execucoes')
        .insert({
          ano_mes: `${anoMes}-manual-${Date.now().toString(36)}`,
          tipo_job: 'auditoria_manual',
          status: 'pendente',
          destinatarios: validEmails.join(', '),
          mensagem: initMessage,
        })
        .select()
        .single()
      jobRecord = record
    }

    // FLUXO DO JOB (ORDEM OBRIGATÓRIA):
    // 1. GERAR PDF COM OS ÚLTIMOS N DIAS
    // 2. ENVIAR E-MAIL COM O PDF ANEXO
    // 3. SE SUCESSO: EXECUTAR EXPURGO EM LOTES. SE FALHAR O E-MAIL: NÃO EXPURGAR!

    // Passo 1: Buscar registros do período (últimos N dias a partir de agora)
    const cutoffStartDate = new Date(nowUtc.getTime() - diasRetroativos * 24 * 60 * 60 * 1000)
    const dataInicioStr = cutoffStartDate.toISOString()

    const { data: logsData, error: logsError } = await supabaseAdmin
      .from('historico')
      .select(
        'id, tipo, descricao, entidade_tipo, entidade_id, usuario_id, created_at, id_leitor, observacao',
      )
      .gte('created_at', dataInicioStr)
      .order('created_at', { ascending: false })

    if (logsError) throw logsError

    const rawLogs = logsData || []
    const totalRegistros = rawLogs.length
    const dataInicioBR = `${String(cutoffStartDate.getUTCDate()).padStart(2, '0')}/${String(cutoffStartDate.getUTCMonth() + 1).padStart(2, '0')}/${cutoffStartDate.getUTCFullYear()}`
    const dataFimBR = `${partMap.day}/${partMap.month}/${partMap.year}`

    // Mapear perfis/usuários dos registros para exibir o Nome do Usuário em cada operação
    const uniqueUserIds = Array.from(
      new Set(
        rawLogs
          .map((l: any) => l.usuario_id)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
      ),
    )

    const userNamesMap = new Map<string, string>()
    if (uniqueUserIds.length > 0) {
      const { data: profilesData, error: profilesErr } = await supabaseAdmin
        .from('profiles')
        .select('id, nome, full_name, email')
        .in('id', uniqueUserIds)

      if (!profilesErr && profilesData) {
        for (const p of profilesData) {
          const resolved = (p.nome || p.full_name || p.email || 'Operador').trim()
          userNamesMap.set(p.id, resolved)
        }
      }
    }

    // Colunas do relatório PDF oficial paginado
    // Larguras em caracteres (soma ~120 chars, perfeitamente compatível com A4 em 7.5pt/8pt)
    const pdfColumns: PdfColumn[] = [
      { title: 'Data/Hora', width: 16 },
      { title: 'Operacao', width: 22 },
      { title: 'Entidade', width: 20 },
      { title: 'Usuario', width: 20 },
      { title: 'Descricao', width: 38 },
    ]

    const tableRows = rawLogs.map((l: any) => {
      let operadorName = 'N/D'
      if (l.usuario_id && userNamesMap.has(l.usuario_id)) {
        operadorName = userNamesMap.get(l.usuario_id)!
      } else if (l.usuario_id) {
        operadorName = 'Operador'
      } else if (
        l.entidade_tipo === 'sistema' ||
        (!l.usuario_id && l.tipo?.toLowerCase().includes('job'))
      ) {
        operadorName = 'Sistema'
      }

      const entidadeStr = l.entidade_id
        ? `${l.entidade_tipo}: ${l.entidade_id}`
        : l.entidade_tipo || '-'
      const descCompleta = (l.descricao || '-') + (l.observacao ? ` (Obs: ${l.observacao})` : '')

      return [
        new Date(l.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        l.tipo || 'Operação',
        entidadeStr,
        operadorName,
        descCompleta,
      ]
    })

    const pdfBytes = createMultiPagePdfDocument(
      'Biblioteca CEP - Relatorio de Auditoria (Logs)',
      `Historico Oficial de Operacoes e Eventos (${diasRetroativos} dias retroativos)`,
      [
        `Periodo de Cobertura: ${dataInicioBR} ate ${dataFimBR}`,
        `Data de Emissao: ${dataReferenciaExtenso} (America/Sao_Paulo)`,
        `Total de Registros Encontrados: ${totalRegistros}`,
        totalRegistros === 0
          ? 'AVISO: Nenhum registro de auditoria gerado no periodo.'
          : 'Status da Base: Operacoes consolidadas.',
      ],
      pdfColumns,
      tableRows,
    )

    // Converter PDF em base64
    let binary = ''
    for (let i = 0; i < pdfBytes.length; i++) {
      binary += String.fromCharCode(pdfBytes[i])
    }
    const pdfBase64 = btoa(binary)

    // Montar assunto e corpo com variáveis interpoladas
    const systemUrl =
      Deno.env.get('SITE_URL') ||
      Deno.env.get('APP_URL') ||
      'https://desenvolvimento-do-projeto-copy-5b68d.goskip.app'
    const linkSistema = `${systemUrl.replace(/\/+$/, '')}/historico?tab=logs`

    const templateVariables: Record<string, string> = {
      data_inicio: dataInicioBR,
      data_fim: dataFimBR,
      total_registros: String(totalRegistros),
      data_referencia: dataReferenciaExtenso,
      link_sistema: linkSistema,
    }

    const subject = interpolateTemplate(assuntoTemplate, templateVariables)
    let bodyText = interpolateTemplate(corpoTemplate, templateVariables)

    if (totalRegistros === 0) {
      bodyText += '\n\n[Aviso do Sistema: Nenhum registro de auditoria foi registrado no período].'
    }

    // Passo 2: Disparar e-mail (ou simulação caso sem provedor configurado)
    const emailResult = await sendEmailOrSimulate({
      to: validEmails,
      from: remetente,
      subject,
      body: bodyText,
      attachmentBase64: pdfBase64,
      attachmentName: `relatorio_auditoria_${anoMes}.pdf`,
    })

    const providerLabel =
      emailResult.provider === 'resend'
        ? '(Envio real efetuado via Resend)'
        : emailResult.provider === 'smtp'
          ? '(Envio real efetuado via SMTP / Gmail)'
          : '(Envio simulado — nenhum provedor configurado)'

    // Registrar no log da auditoria a tentativa de envio (auditoria da auditoria)
    const logTipo = isManualRun
      ? emailResult.success
        ? 'Disparo Manual de Auditoria Concluído'
        : 'Falha no Disparo Manual de Auditoria'
      : emailResult.success
        ? 'Envio de Auditoria Concluído'
        : 'Falha no Envio de Auditoria'

    const logDesc = isManualRun
      ? `Disparo manual do relatório de auditoria executado pelo operador. Enviado para ${validEmails.length} destinatário(s). ${providerLabel}.`
      : `Relatório de auditoria mensal enviado com sucesso para ${validEmails.length} destinatário(s). ${providerLabel}.`

    await supabaseAdmin.from('historico').insert({
      tipo: logTipo,
      descricao: emailResult.success
        ? logDesc
        : `Tentativa de envio de e-mail falhou (${emailResult.provider}): ${emailResult.message}`,
      entidade_tipo: 'sistema',
      entidade_id: isManualRun ? 'disparo_manual_auditoria' : 'job_auditoria',
      observacao: `Período: ${dataInicioBR} a ${dataFimBR}. Total de registros no relatório: ${totalRegistros}. Modo: ${isManualRun ? 'Disparo Manual' : 'Rotina Mensal'}.`,
    })

    if (!emailResult.success) {
      // Regra de negócio mandatória: Se o e-mail falhar, NÃO expurgar a base!
      const durationMs = Date.now() - startTime
      if (jobRecord?.id) {
        await supabaseAdmin
          .from('job_execucoes')
          .update({
            status: 'erro',
            registros_incluidos: totalRegistros,
            registros_expurgados: 0,
            duracao_ms: durationMs,
            mensagem: `Falha no envio do e-mail: ${emailResult.message}. Rotina de expurgo cancelada preventivamente.`,
            detalhes: { emailResult, isManualRun },
          })
          .eq('id', jobRecord.id)
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: `Falha no envio de e-mail: ${emailResult.message}. O expurgo foi cancelado para resguardar os dados da biblioteca.`,
          message: `Falha no envio do e-mail. A base de histórico NÃO foi expurgada.`,
          emailResult,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Passo 3: Executar expurgo em lotes somente após envio bem-sucedido
    // No disparo manual, o expurgo só deve ocorrer se estiver configurado/ativo conforme a regra
    let registrosExpurgados = 0
    let expurgoDetalhes: any = null
    const shouldPurge = !isManualRun || (isManualRun && ativo)

    if (shouldPurge) {
      try {
        const { data: purgeData, error: purgeErr } = await supabaseAdmin.rpc(
          'expurgar_historico_em_lotes',
          {
            p_dias_retencao: diasRetencao,
            p_batch_size: 500,
          },
        )

        if (purgeErr) throw purgeErr
        expurgoDetalhes = purgeData
        registrosExpurgados = purgeData?.total_removidos ?? 0
      } catch (purgeError: any) {
        console.error('Erro no expurgo de histórico:', purgeError)
        // Logar erro específico do expurgo
        await supabaseAdmin.from('historico').insert({
          tipo: 'Erro no Expurgo de Histórico',
          descricao: `Falha ao executar expurgo em lotes: ${purgeError.message}`,
          entidade_tipo: 'sistema',
          entidade_id: 'job_expurgo',
          observacao: 'O relatório em PDF e o e-mail foram entregues antes desta falha.',
        })
      }
    }

    const durationMs = Date.now() - startTime
    const finalMessage = isManualRun
      ? shouldPurge
        ? `Relatório enviado com sucesso via disparo manual para ${validEmails.join(', ')} (${totalRegistros} registros) e expurgo concluído (${registrosExpurgados} registros limpos).`
        : `Relatório completo enviado com sucesso via disparo manual para ${validEmails.join(', ')} (${totalRegistros} registros). Expurgo automático ignorado pois está inativo nas configurações.`
      : `Job concluído com sucesso. PDF gerado (${totalRegistros} registros), e-mail processado para ${validEmails.join(', ')} e expurgo finalizado (${registrosExpurgados} registros antigos limpos).`

    if (jobRecord?.id) {
      await supabaseAdmin
        .from('job_execucoes')
        .update({
          status: 'sucesso',
          registros_incluidos: totalRegistros,
          registros_expurgados: registrosExpurgados,
          duracao_ms: durationMs,
          mensagem: finalMessage,
          detalhes: {
            emailResult,
            expurgoDetalhes,
            invalidEmailsIgnored: invalidEmails,
            isManualRun,
            expurgoAtivo: ativo,
          },
        })
        .eq('id', jobRecord.id)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: finalMessage,
        ano_mes: anoMes,
        total_registros_relatorio: totalRegistros,
        registros_expurgados: registrosExpurgados,
        duracao_ms: durationMs,
        provedor_email: emailResult.provider,
        destinatarios_enviados: validEmails,
        destinatarios_invalidos: invalidEmails,
        is_manual: isManualRun,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('Erro na Edge Function auditoria_mensal_expurgo:', err)
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || 'Erro interno ao processar o job de auditoria.',
        message: err.message || 'Erro ao processar rotina de auditoria.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// Sub-rotina para envio de e-mail de teste
async function handleSendTest({
  supabaseAdmin,
  rawDestinatarios,
  remetente,
  assuntoTemplate,
  corpoTemplate,
  diasRetroativos,
  dataReferenciaExtenso,
}: any) {
  const emailList = (rawDestinatarios || '')
    .split(',')
    .map((e: string) => e.trim())
    .filter((e: string) => e.length > 0)

  const validEmails: string[] = []
  const invalidEmails: string[] = []
  for (const email of emailList) {
    if (EMAIL_REGEX.test(email)) validEmails.push(email)
    else invalidEmails.push(email)
  }

  if (validEmails.length === 0) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          'Nenhum e-mail de destinatário válido configurado. Insira ao menos 1 e-mail válido antes de testar.',
        message: 'Nenhum e-mail válido informado para envio de teste.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Gerar PDF de amostra
  const testCols: PdfColumn[] = [
    { title: 'Data/Hora', width: 16 },
    { title: 'Operacao', width: 22 },
    { title: 'Entidade', width: 20 },
    { title: 'Usuario', width: 20 },
    { title: 'Descricao', width: 38 },
  ]

  const pdfBytes = createMultiPagePdfDocument(
    'Biblioteca CEP - Relatorio de Auditoria [TESTE]',
    'Documento de Amostra para Validacao do Envio de Auditoria',
    [
      `Data de Emissao: ${dataReferenciaExtenso}`,
      'Tipo de Operacao: Disparo de Validacao / Teste de Conexao',
      `Destinatarios Testados: ${validEmails.join(', ')}`,
      'Total de Registros Encontrados: 2',
      'Status da Base: Amostra de teste para conferencia visual.',
    ],
    testCols,
    [
      [
        dataReferenciaExtenso,
        'Teste de Envio',
        'sistema: teste_email',
        'Administrador',
        'Validacao da rotina de auditoria automatica e geracao de PDF.',
      ],
      [
        dataReferenciaExtenso,
        'Status Provedor',
        'sistema: smtp_resend',
        'Sistema',
        'Checagem de credenciais de e-mail e layout do anexo paginado.',
      ],
    ],
  )

  let binary = ''
  for (let i = 0; i < pdfBytes.length; i++) binary += String.fromCharCode(pdfBytes[i])
  const pdfBase64 = btoa(binary)

  const systemUrl =
    Deno.env.get('SITE_URL') ||
    Deno.env.get('APP_URL') ||
    'https://desenvolvimento-do-projeto-copy-5b68d.goskip.app'
  const linkSistema = `${systemUrl.replace(/\/+$/, '')}/historico?tab=logs`

  const testVariables: Record<string, string> = {
    data_inicio: dataReferenciaExtenso,
    data_fim: dataReferenciaExtenso,
    total_registros: '2',
    data_referencia: dataReferenciaExtenso,
    link_sistema: linkSistema,
  }

  const subject = `[TESTE] ${interpolateTemplate(assuntoTemplate, testVariables)}`
  const interpolatedCorpo = interpolateTemplate(corpoTemplate, testVariables)
  const body = `Este e um disparo de teste solicitado manualmente nas Configuracoes do Sistema para validar o envio do Relatorio de Auditoria.\n\nDestinatarios: ${validEmails.join(', ')}\nRemetente: ${remetente}\n\nO PDF anexo contem a estrutura oficial de amostra.\n\n${interpolatedCorpo}`
  const result = await sendEmailOrSimulate({
    to: validEmails,
    from: remetente,
    subject,
    body,
    attachmentBase64: pdfBase64,
    attachmentName: 'relatorio_auditoria_amostra.pdf',
  })

  // Auditoria da auditoria
  await supabaseAdmin.from('historico').insert({
    tipo: 'Teste de Envio de Auditoria',
    descricao: `Disparo de e-mail de teste para ${validEmails.join(', ')}. Status: ${result.success ? 'Sucesso' : 'Falha'}. Modo: ${result.provider}.`,
    entidade_tipo: 'sistema',
    entidade_id: 'teste_email',
    observacao: result.message,
  })

  return new Response(
    JSON.stringify({
      success: result.success,
      message: result.message,
      provider: result.provider,
      destinatarios_enviados: validEmails,
      destinatarios_invalidos: invalidEmails,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

// Disparo real (via Resend, SMTP ou simulado com log transparente)
// Ordem de prioridade dos provedores:
// 1. Se RESEND_API_KEY existir -> usar Resend
// 2. Senão, se SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS existirem -> usar SMTP (Gmail ou similar)
// 3. Senão -> modo simulado (sucesso: true, resposta explicativa)
async function sendEmailOrSimulate({
  to,
  from,
  subject,
  body,
  attachmentBase64,
  attachmentName,
}: {
  to: string[]
  from: string
  subject: string
  body: string
  attachmentBase64: string
  attachmentName: string
}): Promise<{ success: boolean; message: string; provider: 'resend' | 'smtp' | 'simulado' }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')?.trim()

  // 1. Provedor Resend
  if (resendApiKey && resendApiKey.length > 5) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: from.includes('<') ? from : `Biblioteca CEP <${from}>`,
          to,
          subject,
          text: body,
          attachments: [
            {
              filename: attachmentName,
              content: attachmentBase64,
            },
          ],
        }),
      })

      if (!res.ok) {
        const errorText = await res.text()
        return {
          success: false,
          message: `Erro da API Resend (${res.status}): ${errorText}`,
          provider: 'resend',
        }
      }

      const resData = await res.json()
      return {
        success: true,
        message: `E-mail enviado com sucesso via Resend (ID: ${resData.id || 'ok'}).`,
        provider: 'resend',
      }
    } catch (e: any) {
      return {
        success: false,
        message: `Falha de rede ao conectar com provedor Resend: ${e.message}`,
        provider: 'resend',
      }
    }
  }

  // 2. Provedor SMTP (Gmail ou compatível)
  const smtpHost = Deno.env.get('SMTP_HOST')?.trim()
  const smtpPortStr = Deno.env.get('SMTP_PORT')?.trim()
  const smtpUser = Deno.env.get('SMTP_USER')?.trim()
  const smtpPass = Deno.env.get('SMTP_PASS')?.trim()

  const hasAllSmtpSecrets =
    Boolean(smtpHost) && Boolean(smtpPortStr) && Boolean(smtpUser) && Boolean(smtpPass)

  if (hasAllSmtpSecrets) {
    const smtpPort = parseInt(smtpPortStr || '465', 10) || 465
    return await sendViaSmtp({
      host: smtpHost!,
      port: smtpPort,
      user: smtpUser!,
      pass: smtpPass!,
      from,
      to,
      subject,
      body,
      attachmentBase64,
      attachmentName,
    })
  }

  // 3. Sem provedor configurado no momento: simulação fiel e transparente
  return {
    success: true,
    message: `Envio simulado com sucesso para ${to.join(', ')} com anexo ${attachmentName} (${Math.round((attachmentBase64.length * 3) / 4 / 1024)} KB). Nenhum provedor configurado (configure RESEND_API_KEY ou SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS nos segredos do Supabase).`,
    provider: 'simulado',
  }
}

// Envio direto via SMTP com suporte a TLS direto (porta 465) e STARTTLS (porta 587)
async function sendViaSmtp({
  host,
  port,
  user,
  pass,
  from,
  to,
  subject,
  body,
  attachmentBase64,
  attachmentName,
}: {
  host: string
  port: number
  user: string
  pass: string
  from: string
  to: string[]
  subject: string
  body: string
  attachmentBase64: string
  attachmentName: string
}): Promise<{ success: boolean; message: string; provider: 'smtp' }> {
  let conn: Deno.Conn | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  let readBuffer = ''

  const textDecoder = new TextDecoder()
  const textEncoder = new TextEncoder()

  // Conectar com timeout
  const connectPromise = async (): Promise<Deno.Conn> => {
    // Port 465 conecta direto com TLS; portas 587 ou 25 conectam em TCP puro e usam STARTTLS
    if (port === 465) {
      return await Deno.connectTls({ hostname: host, port })
    }
    return await Deno.connect({ hostname: host, port })
  }

  try {
    // Timeout global de 25s para toda a operação SMTP
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`Tempo limite (25s) esgotado ao conectar no servidor SMTP ${host}:${port}.`),
          ),
        25000,
      ),
    )

    const runSmtpSession = async (): Promise<string> => {
      conn = await connectPromise()
      reader = conn.readable.getReader()
      writer = conn.writable.getWriter()

      const readLine = async (): Promise<string> => {
        while (true) {
          const newlineIdx = readBuffer.indexOf('\n')
          if (newlineIdx !== -1) {
            const line = readBuffer.slice(0, newlineIdx).replace(/\r$/, '')
            readBuffer = readBuffer.slice(newlineIdx + 1)
            return line
          }
          const { value, done } = await reader!.read()
          if (done) {
            if (readBuffer.length > 0) {
              const line = readBuffer.replace(/\r$/, '')
              readBuffer = ''
              return line
            }
            throw new Error('Conexão SMTP encerrada inesperadamente pelo servidor.')
          }
          readBuffer += textDecoder.decode(value, { stream: true })
        }
      }

      const readResponse = async (): Promise<{
        code: number
        lines: string[]
        fullText: string
      }> => {
        const lines: string[] = []
        let lastCode = 0
        while (true) {
          const line = await readLine()
          lines.push(line)
          const match = line.match(/^(\d{3})([ -])(.*)$/)
          if (match) {
            lastCode = parseInt(match[1], 10)
            const isContinuation = match[2] === '-'
            if (!isContinuation) break
          } else {
            break
          }
        }
        return { code: lastCode, lines, fullText: lines.join(' | ') }
      }

      const writeCommand = async (cmd: string): Promise<void> => {
        await writer!.write(textEncoder.encode(cmd + '\r\n'))
      }

      // 1. Ler saudação inicial do servidor (código 220)
      const greeting = await readResponse()
      if (greeting.code !== 220) {
        throw new Error(`Saudação inicial SMTP rejeitada (${greeting.code}): ${greeting.fullText}`)
      }

      // 2. EHLO inicial
      await writeCommand(`EHLO localhost`)
      let ehloResp = await readResponse()
      if (ehloResp.code !== 250) {
        // Tentar HELO se EHLO não for suportado
        await writeCommand(`HELO localhost`)
        ehloResp = await readResponse()
        if (ehloResp.code !== 250) {
          throw new Error(
            `Handshake SMTP (EHLO/HELO) falhou (${ehloResp.code}): ${ehloResp.fullText}`,
          )
        }
      }

      // 3. Se não estiver em TLS (porta diferente de 465), negociar STARTTLS
      if (port !== 465) {
        await writeCommand('STARTTLS')
        const starttlsResp = await readResponse()
        if (starttlsResp.code !== 220) {
          throw new Error(
            `Servidor SMTP não aceitou STARTTLS na porta ${port} (${starttlsResp.code}): ${starttlsResp.fullText}`,
          )
        }

        // Liberar reader/writer antigos e atualizar conexão para TLS
        reader.releaseLock()
        writer.releaseLock()
        conn = await Deno.startTls(conn, { hostname: host })
        reader = conn.readable.getReader()
        writer = conn.writable.getWriter()
        readBuffer = ''

        // Re-enviar EHLO após estabelecer conexão segura TLS
        await writeCommand(`EHLO localhost`)
        const postTlsEhlo = await readResponse()
        if (postTlsEhlo.code !== 250) {
          throw new Error(
            `Handshake SMTP pós-STARTTLS falhou (${postTlsEhlo.code}): ${postTlsEhlo.fullText}`,
          )
        }
      }

      // 4. Autenticação AUTH LOGIN (padrão aceito por Gmail e SMTPs seguros)
      await writeCommand('AUTH LOGIN')
      const authResp = await readResponse()
      if (authResp.code !== 334) {
        throw new Error(
          `Servidor SMTP recusou início de autenticação (${authResp.code}): ${authResp.fullText}`,
        )
      }

      // Enviar usuário em Base64
      await writeCommand(btoa(user))
      const userResp = await readResponse()
      if (userResp.code !== 334) {
        throw new Error(
          `Usuário SMTP recusado pelo servidor (${userResp.code}): ${userResp.fullText}`,
        )
      }

      // Limpar espaços da senha de app (Gmail gera agrupada em 4 blocos de 4 chars com espaços)
      const sanitizedPass = pass.replace(/\s+/g, '')
      await writeCommand(btoa(sanitizedPass))
      const passResp = await readResponse()
      if (passResp.code !== 235) {
        throw new Error(
          `Autenticação SMTP recusada (${passResp.code}): ${passResp.fullText}. Para Gmail, verifique se está usando uma 'Senha de App' de 16 letras gerada em myaccount.google.com/apppasswords.`,
        )
      }

      // 5. MAIL FROM
      // Se from contiver nome e e-mail no formato 'Nome <email>', extrair apenas o endereço para envelope MAIL FROM
      const fromMatch = from.match(/<([^>]+)>/)
      const envelopeFrom = fromMatch ? fromMatch[1].trim() : from.trim() || user
      await writeCommand(`MAIL FROM:<${envelopeFrom}>`)
      const mailFromResp = await readResponse()
      if (mailFromResp.code !== 250) {
        throw new Error(`Remetente SMTP recusado (${mailFromResp.code}): ${mailFromResp.fullText}`)
      }

      // 6. RCPT TO (para cada destinatário)
      for (const recipient of to) {
        const rcptMatch = recipient.match(/<([^>]+)>/)
        const envelopeTo = rcptMatch ? rcptMatch[1].trim() : recipient.trim()
        await writeCommand(`RCPT TO:<${envelopeTo}>`)
        const rcptResp = await readResponse()
        if (rcptResp.code !== 250 && rcptResp.code !== 251) {
          throw new Error(
            `Destinatário SMTP recusado: ${recipient} (${rcptResp.code}): ${rcptResp.fullText}`,
          )
        }
      }

      // 7. DATA
      await writeCommand('DATA')
      const dataResp = await readResponse()
      if (dataResp.code !== 354) {
        throw new Error(`Comando DATA rejeitado (${dataResp.code}): ${dataResp.fullText}`)
      }

      // 8. Montar mensagem MIME multipart/mixed com cabeçalhos e anexo PDF
      const boundary = '==_Part_BibliotecaCEP_' + Date.now().toString(36)
      const fromHeader = from.includes('<') ? from : `Biblioteca CEP <${from || user}>`
      const toHeader = to.join(', ')

      // Dividir base64 em linhas de no máximo 76 caracteres (padrão RFC 2045)
      const base64Chunks: string[] = []
      for (let i = 0; i < attachmentBase64.length; i += 76) {
        base64Chunks.push(attachmentBase64.slice(i, i + 76))
      }
      const formattedAttachmentBase64 = base64Chunks.join('\r\n')

      const mimeMessage = [
        `From: ${fromHeader}`,
        `To: ${toHeader}`,
        `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
        `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 8bit',
        '',
        body,
        '',
        `--${boundary}`,
        `Content-Type: application/pdf; name="${attachmentName}"`,
        `Content-Disposition: attachment; filename="${attachmentName}"`,
        'Content-Transfer-Encoding: base64',
        '',
        formattedAttachmentBase64,
        '',
        `--${boundary}--`,
        '.',
      ].join('\r\n')

      await writeCommand(mimeMessage)
      const sendResp = await readResponse()
      if (sendResp.code !== 250) {
        throw new Error(
          `Falha no envio do corpo da mensagem (${sendResp.code}): ${sendResp.fullText}`,
        )
      }

      // 9. QUIT
      try {
        await writeCommand('QUIT')
        await readResponse()
      } catch {
        // Ignorar falha no QUIT após confirmação do envio (código 250 já recebido)
      }

      return sendResp.fullText || '250 OK'
    }

    const resultMessage = await Promise.race([runSmtpSession(), timeoutPromise])

    return {
      success: true,
      message: `E-mail enviado com sucesso via SMTP (${host}:${port}) com anexo ${attachmentName}.`,
      provider: 'smtp',
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Falha no envio via SMTP (${host}:${port}): ${err.message}`,
      provider: 'smtp',
    }
  } finally {
    try {
      if (reader) reader.releaseLock()
    } catch {}
    try {
      if (writer) writer.releaseLock()
    } catch {}
    try {
      if (conn) conn.close()
    } catch {}
  }
}
