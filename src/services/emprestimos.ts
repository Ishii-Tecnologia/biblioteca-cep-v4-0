import { supabase } from '@/lib/supabase/client'
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/supabase/types'
import { getPrazoEmprestimoDias, getPrazoRenovacaoDias, getMaxRenovacoes } from './parametros'
import { HistoricoService } from './historico'
import { formatDate } from '@/lib/utils'

export type Emprestimo = Tables<'emprestimo'>
export type EmprestimoInsert = TablesInsert<'emprestimo'>
export type EmprestimoUpdate = TablesUpdate<'emprestimo'>

export interface EmprestimoDetailed extends Emprestimo {
  status?: string
  data_limite_retirada?: string | null
  data_retirada_real?: string | null
  exemplar?: {
    id_exemplar: string
    seq: number
    status: string
    localizacao: string | null
    titulo?: {
      id_titulo: string
      titulo_de_livro: string
      autor: string
      editora: string | null
      capa_url: string | null
      categoria: string | null
      colecao?: string | null
    }
  }
  leitor?: {
    id_leitor: number
    nome_do_leitor: string
    email: string
    telefone: string | null
    bloqueado: boolean
  }
}

export const EmprestimosService = {
  async getByLeitor(id_leitor: number) {
    const { data, error } = await supabase
      .from('emprestimo')
      .select(`
        *,
        exemplar (
          id_exemplar,
          seq,
          status,
          localizacao,
          titulo (
            id_titulo,
            titulo_de_livro,
            autor,
            editora,
            capa_url,
            categoria,
            colecao
          )
        ),
        leitor (
          id_leitor,
          nome_do_leitor,
          email,
          telefone,
          bloqueado
        )
      `)
      .eq('id_leitor', id_leitor)
      .order('data_emprestimo', { ascending: false })

    if (error) throw error

    const now = new Date()
    return ((data || []) as unknown as EmprestimoDetailed[]).map((emp) => {
      const isReturned = !!emp.data_devolucao_real
      const expected = new Date(emp.data_prevista_devolucao)
      const isOverdue = !isReturned && expected < now
      let diffDays = 0
      if (isOverdue) {
        diffDays = Math.ceil((now.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24))
      }

      return {
        ...emp,
        atraso: emp.atraso || isOverdue,
        dias_atraso: isOverdue ? diffDays : emp.dias_atraso || 0,
      }
    })
  },

  async getAll(
    statusFilter: 'todos' | 'ativos' | 'atrasados' | 'devolvidos' = 'todos',
    searchQuery?: string,
  ) {
    let query = supabase
      .from('emprestimo')
      .select(`
        *,
        exemplar (
          id_exemplar,
          seq,
          status,
          localizacao,
          titulo (
            id_titulo,
            titulo_de_livro,
            autor,
            editora,
            capa_url,
            categoria,
            colecao
          )
        ),
        leitor (
          id_leitor,
          nome_do_leitor,
          email,
          telefone,
          bloqueado
        )
      `)
      .order('data_emprestimo', { ascending: false })

    if (statusFilter === 'ativos') {
      query = query.is('data_devolucao_real', null)
    } else if (statusFilter === 'devolvidos') {
      query = query.not('data_devolucao_real', 'is', null)
    } else if (statusFilter === 'atrasados') {
      const now = new Date().toISOString()
      query = query.is('data_devolucao_real', null).lt('data_prevista_devolucao', now)
    }

    const { data, error } = await query
    if (error) throw error

    let result = (data || []) as unknown as EmprestimoDetailed[]

    // Calculate real-time delay status
    const now = new Date()
    result = result.map((emp) => {
      const isReturned = !!emp.data_devolucao_real
      const expected = new Date(emp.data_prevista_devolucao)
      const isOverdue = !isReturned && expected < now
      let diffDays = 0
      if (isOverdue) {
        diffDays = Math.ceil((now.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24))
      }

      return {
        ...emp,
        atraso: emp.atraso || isOverdue,
        dias_atraso: isOverdue ? diffDays : emp.dias_atraso || 0,
      }
    })

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter((item) => {
        const bookTitle = item.exemplar?.titulo?.titulo_de_livro?.toLowerCase() || ''
        const author = item.exemplar?.titulo?.autor?.toLowerCase() || ''
        const readerName = item.leitor?.nome_do_leitor?.toLowerCase() || ''
        const readerEmail = item.leitor?.email?.toLowerCase() || ''
        const copyId = item.id_exemplar.toLowerCase()

        return (
          bookTitle.includes(q) ||
          author.includes(q) ||
          readerName.includes(q) ||
          readerEmail.includes(q) ||
          copyId.includes(q)
        )
      })
    }

    return result
  },

  async getDashboardMetrics() {
    // 1. Total books and available copies
    const { data: exemplares } = await supabase.from('exemplar').select('status')
    const totalExemplares = exemplares?.length || 0
    const disponiveis = exemplares?.filter((e) => e.status === 'Disponivel').length || 0
    const emprestados = exemplares?.filter((e) => e.status === 'Emprestado').length || 0
    const manutencao =
      exemplares?.filter(
        (e) =>
          e.status === 'Manutencao' || e.status === 'EM_MANUTENCAO' || e.status === 'Em Manutencao',
      ).length || 0

    // 2. Active readers
    const { count: totalLeitores } = await supabase
      .from('leitor')
      .select('*', { count: 'exact', head: true })
    const { count: leitoresBloqueados } = await supabase
      .from('leitor')
      .select('*', { count: 'exact', head: true })
      .eq('bloqueado', true)

    // 3. Titles count
    const { count: totalTitulos } = await supabase
      .from('titulo')
      .select('*', { count: 'exact', head: true })
      .eq('ativo', true)

    // 4. Active & Overdue Loans
    const { data: activeLoans } = await supabase
      .from('emprestimo')
      .select('id_emprestimo, data_prevista_devolucao, atraso, data_devolucao_real')
      .is('data_devolucao_real', null)

    const now = new Date()
    const totalAtivos = activeLoans?.length || 0
    const totalAtrasados =
      activeLoans?.filter((l) => l.atraso || new Date(l.data_prevista_devolucao) < now).length || 0

    // 5. Active Reservations
    const { count: totalReservas } = await supabase
      .from('reserva')
      .select('*', { count: 'exact', head: true })
      .eq('status_reserva', 'Ativa')

    return {
      totalTitulos: totalTitulos || 0,
      totalExemplares,
      exemplaresDisponiveis: disponiveis,
      exemplaresEmprestados: emprestados,
      exemplaresManutencao: manutencao,
      totalLeitores: totalLeitores || 0,
      leitoresBloqueados: leitoresBloqueados || 0,
      emprestimosAtivos: totalAtivos,
      emprestimosAtrasados: totalAtrasados,
      reservasAtivas: totalReservas || 0,
    }
  },

  /**
   * Conta empréstimos ativos para badges nos cabeçalhos (F-02)
   */
  async countActive(): Promise<number> {
    const { count, error } = await supabase
      .from('emprestimo')
      .select('*', { count: 'exact', head: true })
      .is('data_devolucao_real', null)

    if (error) return 0
    return count ?? 0
  },

  async createLoan(id_exemplar: string, id_leitor: number, operatorName = 'Sistema') {
    // Check if the RPC emprestar_exemplar is available
    const { data, error } = await supabase.rpc('emprestar_exemplar', {
      p_id_exemplar: id_exemplar,
      p_id_leitor: id_leitor,
      p_usuario_sistema: operatorName,
    })

    if (error) {
      // Fallback direct execution if RPC fails
      console.warn('RPC loan failed, falling back to direct query', error)

      // 1. Check exemplar
      const { data: ex, error: exErr } = await supabase
        .from('exemplar')
        .select('*')
        .eq('id_exemplar', id_exemplar)
        .single()
      if (exErr || !ex) throw new Error('Exemplar não encontrado.')
      if (ex.status !== 'Disponivel')
        throw new Error(`Exemplar não disponível. Status atual: ${ex.status}`)

      // 2. Check reader
      const { data: reader, error: rErr } = await supabase
        .from('leitor')
        .select('*')
        .eq('id_leitor', id_leitor)
        .single()
      if (rErr || !reader) throw new Error('Leitor não encontrado.')
      if (reader.bloqueado) throw new Error('Leitor bloqueado para novos empréstimos.')

      // 3. Compute dates (dynamic days from parameters)
      const prazoDias = await getPrazoEmprestimoDias()
      const now = new Date()
      const expected = new Date()
      expected.setDate(now.getDate() + prazoDias)

      // 4. Create loan
      const { data: newLoan, error: loanErr } = await supabase
        .from('emprestimo')
        .insert({
          id_exemplar: id_exemplar,
          id_leitor: id_leitor,
          data_emprestimo: now.toISOString(),
          data_prevista_devolucao: expected.toISOString(),
          atraso: false,
          dias_atraso: 0,
          numero_renovacoes: 0,
        })
        .select()
        .single()
      if (loanErr) throw loanErr

      // 5. Update exemplar
      await supabase
        .from('exemplar')
        .update({ status: 'Emprestado' })
        .eq('id_exemplar', id_exemplar)

      // 6. Log history
      const readerName = reader.nome_do_leitor || `Leitor #${id_leitor}`
      const expectedStrFormatted = formatDate(expected)
      await HistoricoService.log(
        id_exemplar,
        'Empréstimo',
        id_leitor,
        `Empréstimo do exemplar ${id_exemplar} para o leitor ${readerName} com prazo especial até ${expectedStrFormatted}`,
        operatorName,
        'exemplar',
      )

      return {
        sucesso: true,
        id_emprestimo: newLoan.id_emprestimo,
        message: 'Empréstimo realizado com sucesso!',
      }
    }

    const res = typeof data === 'string' ? JSON.parse(data) : data
    if (res && res.sucesso === false) {
      throw new Error(res.mensagem || res.error || 'Erro ao realizar empréstimo.')
    }

    // Se o RPC funcionou, buscar nome do leitor e registrar no histórico da tabela public.historico
    try {
      const { data: reader } = await supabase
        .from('leitor')
        .select('nome_do_leitor')
        .eq('id_leitor', id_leitor)
        .single()
      const readerName = reader?.nome_do_leitor || `Leitor #${id_leitor}`
      const devDateStr = res.data_prevista_devolucao
        ? formatDate(res.data_prevista_devolucao)
        : 'data prevista'

      await HistoricoService.log(
        id_exemplar,
        'Empréstimo',
        id_leitor,
        `Empréstimo do exemplar ${id_exemplar} para o leitor ${readerName}. Devolução prevista: ${devDateStr}`,
        operatorName,
        'exemplar',
      )
    } catch (logErr) {
      console.warn('Erro ao registrar log de empréstimo:', logErr)
    }

    // DECISÃO C CONFIRMADA: Executar verificação de vencimento em QUALQUER empréstimo
    try {
      const { ReservasService } = await import('./reservas')
      await ReservasService.checkAndExpirePickupDeadlines(operatorName)
    } catch (expCheckErr) {
      console.warn('Erro ao verificar vencimentos no empréstimo:', expCheckErr)
    }

    // Se um exemplar reservado estiver sendo emprestado para o leitor correspondente,
    // atender a reserva correspondente
    try {
      const { data: activeReserva } = await (supabase.from('reserva') as any)
        .select('id_reserva')
        .eq('exemplar_reservado_id', id_exemplar)
        .eq('id_leitor', id_leitor)
        .eq('status_reserva', 'Pronta para Retirada')
        .maybeSingle()

      if (activeReserva) {
        await (supabase.from('reserva') as any)
          .update({
            status_reserva: 'Atendida',
            data_atendimento: new Date().toISOString(),
          })
          .eq('id_reserva', activeReserva.id_reserva)
      }
    } catch (resErr) {
      console.warn('Erro ao atualizar reserva atendida no empréstimo:', resErr)
    }

    // REAGENDAMENTO EM CASCATA:
    // Se o livro retornar e for emprestado novamente (ou qualquer novo empréstimo deste título),
    // o próximo da fila tem sua data de reserva alterada automaticamente para o dia seguinte à nova devolução prevista.
    try {
      const { data: exObj } = await supabase
        .from('exemplar')
        .select('id_titulo')
        .eq('id_exemplar', id_exemplar)
        .maybeSingle()

      if (exObj?.id_titulo && res.data_prevista_devolucao) {
        const { ReservasService } = await import('./reservas')
        const targetExpectedDate = new Date(res.data_prevista_devolucao)
        await ReservasService.cascadeRescheduleQueue(
          exObj.id_titulo,
          targetExpectedDate,
          operatorName,
        )
      }
    } catch (cascadeErr) {
      console.warn('Erro ao disparar reagendamento em cascata da fila de reservas:', cascadeErr)
    }

    return res
  },

  /**
   * Confirma a retirada física do exemplar (PENDENTE_RETIRADA -> ATIVO)
   */
  async confirmPickup(id_emprestimo: number, operatorName = 'Operador') {
    const { data, error } = await supabase.rpc('confirmar_retirada_emprestimo', {
      p_emprestimo_id: id_emprestimo,
      p_operador_nome: operatorName,
    })

    if (error) throw error
    return data
  },

  async returnLoan(id_exemplar: string, operatorName = 'Sistema') {
    // Buscar exemplar e título antes da devolução
    const { data: exData } = await supabase
      .from('exemplar')
      .select('id_exemplar, id_titulo, titulo:id_titulo(titulo_de_livro)')
      .eq('id_exemplar', id_exemplar)
      .maybeSingle()

    const bookId = exData?.id_titulo
    const bookTitle = (exData?.titulo as any)?.titulo_de_livro || ''

    // Buscar empréstimo ativo antes da devolução para obter id_leitor e leitor
    const { data: loanBefore } = await supabase
      .from('emprestimo')
      .select('id_emprestimo, id_leitor, data_prevista_devolucao, leitor(nome_do_leitor)')
      .eq('id_exemplar', id_exemplar)
      .is('data_devolucao_real', null)
      .order('data_emprestimo', { ascending: false })
      .limit(1)
      .maybeSingle()

    let returnResult: any = null

    const { data, error } = await supabase.rpc('devolver_exemplar', {
      p_id_exemplar: id_exemplar,
      p_usuario_sistema: operatorName,
    })

    if (error) {
      console.warn('RPC return failed, falling back to direct table update', error)
      // Fallback
      const { data: loan, error: lErr } = await supabase
        .from('emprestimo')
        .select('*, leitor(nome_do_leitor), exemplar(titulo(titulo_de_livro))')
        .eq('id_exemplar', id_exemplar)
        .is('data_devolucao_real', null)
        .order('data_emprestimo', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lErr || !loan) throw new Error('Empréstimo ativo não encontrado para este exemplar.')

      const now = new Date()
      const expected = new Date(loan.data_prevista_devolucao)
      const isLate = now > expected
      const daysLate = isLate
        ? Math.ceil((now.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24))
        : 0

      await supabase
        .from('emprestimo')
        .update({
          data_devolucao_real: now.toISOString(),
          atraso: isLate,
          dias_atraso: daysLate,
        })
        .eq('id_emprestimo', loan.id_emprestimo)

      await supabase
        .from('exemplar')
        .update({ status: 'Disponivel' })
        .eq('id_exemplar', id_exemplar)

      const readerName = (loan.leitor as any)?.nome_do_leitor || `Leitor #${loan.id_leitor}`
      const forcedBookTitle = (loan as any)?.exemplar?.titulo?.titulo_de_livro || id_exemplar
      await HistoricoService.log(
        id_exemplar,
        'Devolução',
        loan.id_leitor,
        `Devolução forçada do exemplar ${id_exemplar} (${forcedBookTitle}) pelo operador ${operatorName}.`,
        operatorName,
        'exemplar',
      )
      returnResult = { sucesso: true, mensagem: 'Devolução registrada com sucesso!' }
    } else {
      const res = typeof data === 'string' ? JSON.parse(data) : data
      if (res && res.sucesso === false) {
        throw new Error(res.mensagem || res.error || 'Erro ao registrar devolução.')
      }
      returnResult = res

      // Se o RPC funcionou, registrar log no HistoricoService
      try {
        const readerName =
          (loanBefore?.leitor as any)?.nome_do_leitor ||
          (loanBefore?.id_leitor ? `Leitor #${loanBefore.id_leitor}` : 'Leitor')
        const daysLate = res.dias_atraso || 0
        const delayInfo = daysLate > 0 ? ` (com ${daysLate} dia(s) de atraso)` : ' (no prazo)'

        await HistoricoService.log(
          id_exemplar,
          'Devolução',
          loanBefore?.id_leitor,
          `Devolução do exemplar ${id_exemplar} pelo leitor ${readerName}.${delayInfo}`,
          operatorName,
          'exemplar',
        )
      } catch (logErr) {
        console.warn('Erro ao registrar log de devolução:', logErr)
      }
    }

    // DECISÃO C CONFIRMADA: Executar verificação de vencimento em QUALQUER devolução
    if (bookId) {
      try {
        const { ReservasService } = await import('./reservas')
        await ReservasService.checkAndExpirePickupDeadlines(operatorName)
      } catch (expCheckErr) {
        console.warn('Erro ao verificar vencimentos na devolução:', expCheckErr)
      }
    }

    // Regra de Devolução & Entrega Antecipada:
    // Se o livro for devolvido antes da data prevista, notificar por e-mail o próximo da fila
    // informando que o livro já está disponível, e alterar a data de agendamento dele para o dia seguinte à entrega antecipada.
    // Se for devolução comum com fila ativa, notificar o primeiro leitor para comparecer.
    if (bookId) {
      try {
        const { getPrazoRetiradaDiasUteis } = await import('./parametros')
        const { addBusinessDays } = await import('@/lib/utils')
        const { NotificacaoService } = await import('./notificacoes')

        // Checar se foi entrega antecipada:
        const now = new Date()
        let isEarlyReturn = false
        if (loanBefore?.data_prevista_devolucao) {
          const expectedDate = new Date(loanBefore.data_prevista_devolucao)
          // Se hoje for anterior à data prevista em pelo menos 1 dia
          isEarlyReturn = now.getTime() < expectedDate.getTime() - 12 * 60 * 60 * 1000
        }

        // Verificar primeiro leitor na fila
        const { data: queueList } = await (supabase.from('reserva') as any)
          .select(`
            id_reserva,
            id_titulo,
            id_leitor,
            ordem_fila,
            titulo:id_titulo(titulo_de_livro),
            leitor:id_leitor(nome_do_leitor, email)
          `)
          .eq('id_titulo', bookId)
          .in('status_reserva', ['Ativa', 'Pronta para Retirada'])
          .order('ordem_fila', { ascending: true })
          .order('data_reserva', { ascending: true })
          .limit(1)

        if (queueList && queueList.length > 0) {
          const firstReserva = queueList[0]
          const prazoUteis = await getPrazoRetiradaDiasUteis()
          const limitDate = addBusinessDays(now, prazoUteis)
          limitDate.setHours(18, 0, 0, 0)

          // Data de agendamento: dia seguinte à entrega (antecipada ou padrão)
          const diaSeguinte = new Date(now)
          diaSeguinte.setDate(diaSeguinte.getDate() + 1)
          const diaSeguinteIso = diaSeguinte.toISOString().split('T')[0]

          // Marcar exemplar como 'Reservado' para este primeiro leitor
          await supabase
            .from('exemplar')
            .update({ status: 'Reservado' })
            .eq('id_exemplar', id_exemplar)

          // Atualizar status_reserva para 'Pronta para Retirada' e data de agendamento
          await (supabase.from('reserva') as any)
            .update({
              status_reserva: 'Pronta para Retirada',
              data_limite_retirada: limitDate.toISOString(),
              data_limite_desejada: diaSeguinteIso,
              exemplar_reservado_id: id_exemplar,
              notificacao_enviada: true,
              data_notificacao: now.toISOString(),
            })
            .eq('id_reserva', firstReserva.id_reserva)

          const firstReaderName =
            firstReserva.leitor?.nome_do_leitor || `Leitor #${firstReserva.id_leitor}`
          const firstReaderEmail = firstReserva.leitor?.email || ''
          const effectiveTitle = firstReserva.titulo?.titulo_de_livro || bookTitle || bookId

          // Disparar notificação por e-mail com indicação de entrega antecipada se aplicável
          await NotificacaoService.notificarLiberacaoLivro({
            id_reserva: firstReserva.id_reserva,
            leitorNome: firstReaderName,
            leitorEmail: firstReaderEmail,
            tituloLivro: effectiveTitle,
            dataLimiteRetirada: limitDate,
            idExemplar: id_exemplar,
            operatorName,
            motivoEvento: isEarlyReturn ? 'entrega_antecipada' : 'liberacao',
          })

          returnResult.primeiro_da_fila_notificado = {
            id_reserva: firstReserva.id_reserva,
            leitor: firstReaderName,
            email: firstReaderEmail,
            data_limite: limitDate.toISOString(),
            entrega_antecipada: isEarlyReturn,
            nova_data_agendamento: diaSeguinteIso,
          }
        }
      } catch (queueErr) {
        console.warn('Erro ao verificar/notificar primeiro da fila na devolução:', queueErr)
      }
    }

    return returnResult
  },

  async renewLoan(id_emprestimo: number, operatorName = 'Sistema') {
    // Buscar empréstimo antes de renovar para obter exemplar e leitor
    const { data: loanBefore } = await supabase
      .from('emprestimo')
      .select(
        'id_emprestimo, id_exemplar, id_leitor, data_prevista_devolucao, leitor(nome_do_leitor)',
      )
      .eq('id_emprestimo', id_emprestimo)
      .single()

    const { data, error } = await supabase.rpc('renovar_emprestimo', {
      p_id_emprestimo: id_emprestimo,
      p_usuario_sistema: operatorName,
    })

    if (error) {
      console.warn('RPC renew failed, falling back to manual renewal', error)
      // Fallback
      const { data: loan, error: lErr } = await supabase
        .from('emprestimo')
        .select('*, exemplar(*), leitor(nome_do_leitor)')
        .eq('id_emprestimo', id_emprestimo)
        .single()

      if (lErr || !loan) throw new Error('Empréstimo não encontrado.')
      if (loan.data_devolucao_real) throw new Error('Livro já devolvido.')
      const limiteRenovacoes = await getMaxRenovacoes()
      if (loan.numero_renovacoes >= limiteRenovacoes)
        throw new Error(`Limite de renovação atingido (máx: ${limiteRenovacoes} renovação(ões)).`)

      const prazoDias = await getPrazoRenovacaoDias()
      const currentExpected = new Date(loan.data_prevista_devolucao)
      const newExpected = new Date(currentExpected)
      newExpected.setDate(newExpected.getDate() + prazoDias)

      await supabase
        .from('emprestimo')
        .update({
          data_prevista_devolucao: newExpected.toISOString(),
          numero_renovacoes: (loan.numero_renovacoes || 0) + 1,
          atraso: false,
          dias_atraso: 0,
        })
        .eq('id_emprestimo', id_emprestimo)

      const readerName = (loan.leitor as any)?.nome_do_leitor || `Leitor #${loan.id_leitor}`

      const newExpectedFormatted = formatDate(newExpected)
      await HistoricoService.log(
        loan.id_exemplar,
        'Renovação',
        loan.id_leitor,
        `Renovação do empréstimo #${id_emprestimo} - Exemplar ${loan.id_exemplar} para o leitor ${readerName} até ${newExpectedFormatted}`,
        operatorName,
        'exemplar',
      )

      return {
        sucesso: true,
        nova_data_prevista: newExpected.toISOString(),
        mensagem: 'Empréstimo renovado com sucesso!',
      }
    }

    const res = typeof data === 'string' ? JSON.parse(data) : data
    if (res && (res.sucesso === false || res.success === false)) {
      throw new Error(res.mensagem || res.message || res.error || 'Erro ao renovar empréstimo.')
    }

    // Se o RPC funcionou, registrar log no HistoricoService
    try {
      const readerName =
        (loanBefore?.leitor as any)?.nome_do_leitor ||
        (loanBefore?.id_leitor ? `Leitor #${loanBefore.id_leitor}` : 'Leitor')
      const copyId = loanBefore?.id_exemplar || ''
      const devDateStr = res.nova_data_prevista ? formatDate(res.nova_data_prevista) : 'nova data'

      await HistoricoService.log(
        copyId,
        'Renovação',
        loanBefore?.id_leitor,
        `Renovação do empréstimo do exemplar ${copyId} para o leitor ${readerName} até ${devDateStr}`,
        operatorName,
        'exemplar',
      )
    } catch (logErr) {
      console.warn('Erro ao registrar log de renovação:', logErr)
    }

    // REAGENDAMENTO EM CASCATA NA RENOVAÇÃO:
    // Se o empréstimo foi renovado, a devolução foi adiada. Reagendar a fila de espera da obra!
    try {
      const copyId = loanBefore?.id_exemplar
      if (copyId && res.nova_data_prevista) {
        const { data: exObj } = await supabase
          .from('exemplar')
          .select('id_titulo')
          .eq('id_exemplar', copyId)
          .maybeSingle()

        if (exObj?.id_titulo) {
          const { ReservasService } = await import('./reservas')
          const targetExpectedDate = new Date(res.nova_data_prevista)
          await ReservasService.cascadeRescheduleQueue(
            exObj.id_titulo,
            targetExpectedDate,
            operatorName,
          )
        }
      }
    } catch (cascadeRenErr) {
      console.warn('Erro ao reagendar cascata na renovação:', cascadeRenErr)
    }

    return res
  },
}
