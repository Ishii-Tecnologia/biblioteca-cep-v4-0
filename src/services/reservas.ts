import { supabase } from '@/lib/supabase/client'
import { HistoricoService } from './historico'
import { getTempoReservaGarantidaHoras } from './parametros'

export interface ReservaDetailed {
  id_reserva: number
  id_titulo: string
  id_leitor: number
  data_reserva: string
  status_reserva: 'Ativa' | 'Pronta para Retirada' | 'Atendida' | 'Cancelada' | 'Expirada' | string
  status?: string
  data_atendimento: string | null
  ordem_fila?: number
  data_limite_desejada?: string | null
  data_limite_retirada?: string | null
  exemplar_reservado_id?: string | null
  notificacao_enviada?: boolean
  data_notificacao?: string | null
  posicao_fila?: number
  total_fila?: number
  data_estimada_disponibilidade?: string | null
  horas_restantes_garantida?: number | null
  historico_evento?: {
    tipo: string
    descricao: string
    created_at: string
    observacao?: string | null
  } | null
  titulo?: {
    titulo_de_livro: string
    autor: string
    categoria?: string
    capa_url?: string
    colecao?: string
  }
  leitor?: {
    nome_do_leitor: string
    email: string
    telefone?: string
    bloqueado?: boolean
  }
}

export interface FilaItemAdmin {
  id_reserva: number
  id_titulo: string
  id_leitor: number
  data_reserva: string
  status_reserva: string
  ordem_fila: number
  posicao: number
  data_limite_desejada?: string | null
  data_limite_retirada?: string | null
  exemplar_reservado_id?: string | null
  leitor_nome: string
  leitor_email: string
  leitor_telefone?: string
}

export const ReservasService = {
  /**
   * Busca todas as reservas
   */
  async getAll(statusFilter = 'Ativa') {
    let query = supabase
      .from('reserva')
      .select(`
        *,
        titulo:id_titulo(
          titulo_de_livro,
          autor,
          categoria,
          capa_url
        ),
        leitor:id_leitor(
          nome_do_leitor,
          email,
          telefone,
          bloqueado
        )
      `)
      .order('data_reserva', { ascending: true })

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'Ativa') {
        query = query.in('status_reserva', ['Ativa', 'Pronta para Retirada'])
      } else {
        query = query.eq('status_reserva', statusFilter)
      }
    }

    const { data, error } = await query
    if (error) throw error
    return ReservasService.enrichReservations((data || []) as unknown as ReservaDetailed[])
  },

  /**
   * Busca reservas de um leitor específico
   */
  async getByLeitor(id_leitor: number, statusFilter = 'all') {
    let query = supabase
      .from('reserva')
      .select(`
        *,
        titulo:id_titulo(
          titulo_de_livro,
          autor,
          categoria,
          capa_url
        ),
        leitor:id_leitor(
          nome_do_leitor,
          email,
          telefone,
          bloqueado
        )
      `)
      .eq('id_leitor', id_leitor)
      .order('data_reserva', { ascending: false })

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'Ativa') {
        query = query.in('status_reserva', ['Ativa', 'Pronta para Retirada'])
      } else {
        query = query.eq('status_reserva', statusFilter)
      }
    }

    const { data, error } = await query
    if (error) throw error
    return ReservasService.enrichReservations((data || []) as unknown as ReservaDetailed[])
  },

  /**
   * Obtém a fila completa e ordenada de leitores para um livro específico (Visão Admin)
   */
  async getQueueByBook(id_titulo: string): Promise<FilaItemAdmin[]> {
    const { data, error } = await (supabase.from('reserva') as any)
      .select(`
        *,
        leitor:id_leitor (
          nome_do_leitor,
          email,
          telefone
        )
      `)
      .eq('id_titulo', id_titulo)
      .in('status_reserva', ['Ativa', 'Pronta para Retirada'])
      .order('ordem_fila', { ascending: true })
      .order('data_reserva', { ascending: true })

    if (error) throw error

    return (data || []).map((item: any, index: number) => ({
      id_reserva: item.id_reserva,
      id_titulo: item.id_titulo,
      id_leitor: item.id_leitor,
      data_reserva: item.data_reserva,
      status_reserva: item.status_reserva,
      ordem_fila: item.ordem_fila || index + 1,
      posicao: index + 1,
      data_limite_desejada: item.data_limite_desejada,
      data_limite_retirada: item.data_limite_retirada,
      exemplar_reservado_id: item.exemplar_reservado_id,
      leitor_nome: item.leitor?.nome_do_leitor || `Leitor #${item.id_leitor}`,
      leitor_email: item.leitor?.email || '',
      leitor_telefone: item.leitor?.telefone || '',
    }))
  },

  /**
   * Enriquece as reservas com posição na fila, data estimada de disponibilidade e tempo de reserva garantida
   */
  async enrichReservations(items: ReservaDetailed[]): Promise<ReservaDetailed[]> {
    if (!items || items.length === 0) return []

    const uniqueTitulos = Array.from(new Set(items.map((i) => i.id_titulo)))
    let activeQueueByTitulo: Record<
      string,
      { id_reserva: number; data_reserva: string; ordem_fila?: number }[]
    > = {}

    let expectedReturnsByTitulo: Record<string, Date[]> = {}

    if (uniqueTitulos.length > 0) {
      // 1. Fila de reservas ativas
      const { data: allActive } = await (supabase.from('reserva') as any)
        .select('id_reserva, id_titulo, data_reserva, ordem_fila, status_reserva')
        .in('id_titulo', uniqueTitulos)
        .in('status_reserva', ['Ativa', 'Pronta para Retirada'])
        .order('ordem_fila', { ascending: true })
        .order('data_reserva', { ascending: true })

      if (allActive) {
        for (const act of allActive as any[]) {
          if (!activeQueueByTitulo[act.id_titulo]) {
            activeQueueByTitulo[act.id_titulo] = []
          }
          activeQueueByTitulo[act.id_titulo].push({
            id_reserva: act.id_reserva,
            data_reserva: act.data_reserva,
            ordem_fila: act.ordem_fila || 0,
          })
        }
      }

      // 2. Empréstimos ativos e datas previstas de devolução
      const { data: activeLoans } = await supabase
        .from('emprestimo')
        .select('id_emprestimo, id_exemplar, data_prevista_devolucao, exemplar!inner(id_titulo)')
        .in('exemplar.id_titulo', uniqueTitulos)
        .is('data_devolucao_real', null)
        .order('data_prevista_devolucao', { ascending: true })

      if (activeLoans) {
        for (const loan of activeLoans) {
          const titId = (loan.exemplar as any)?.id_titulo
          if (titId && loan.data_prevista_devolucao) {
            if (!expectedReturnsByTitulo[titId]) {
              expectedReturnsByTitulo[titId] = []
            }
            expectedReturnsByTitulo[titId].push(new Date(loan.data_prevista_devolucao))
          }
        }
      }
    }

    // 3. Buscar histórico para eventos de atendimento/cancelamento
    const { data: logs } = await supabase
      .from('historico')
      .select('id, tipo, descricao, created_at, observacao')
      .ilike('tipo', 'Reserva%')
      .order('created_at', { ascending: false })
      .limit(200)

    const historicoMap: Record<
      number,
      { tipo: string; descricao: string; created_at: string; observacao?: string | null }
    > = {}

    if (logs) {
      for (const log of logs) {
        const match = log.descricao?.match(/Reserva #(\d+)/i)
        if (match && match[1]) {
          const resId = parseInt(match[1], 10)
          if (!historicoMap[resId]) {
            historicoMap[resId] = {
              tipo: log.tipo,
              descricao: log.descricao,
              created_at: log.created_at,
              observacao: log.observacao,
            }
          }
        }
      }
    }

    const now = new Date()

    return items.map((res) => {
      let posicao_fila: number | undefined
      let total_fila: number | undefined
      let data_estimada_disponibilidade: string | null = null
      let horas_restantes_garantida: number | null = null

      if (res.status_reserva === 'Ativa' || res.status_reserva === 'Pronta para Retirada') {
        const queue = activeQueueByTitulo[res.id_titulo] || []
        const idx = queue.findIndex((q) => q.id_reserva === res.id_reserva)
        if (idx !== -1) {
          posicao_fila = idx + 1
          total_fila = queue.length
        } else {
          posicao_fila = 1
          total_fila = 1
        }

        // Estimar data de disponibilidade baseada na posição na fila e devoluções previstas
        const returns = expectedReturnsByTitulo[res.id_titulo] || []
        if (returns.length > 0 && posicao_fila) {
          const returnIdx = Math.min(posicao_fila - 1, returns.length - 1)
          const targetReturnDate = new Date(returns[returnIdx])
          if (targetReturnDate < now) {
            const adjusted = new Date(now)
            adjusted.setDate(adjusted.getDate() + 1)
            data_estimada_disponibilidade = adjusted.toISOString()
          } else {
            data_estimada_disponibilidade = targetReturnDate.toISOString()
          }
        } else if (posicao_fila === 1) {
          const fallback = new Date(now)
          fallback.setDate(fallback.getDate() + 7)
          data_estimada_disponibilidade = fallback.toISOString()
        }

        if (res.status_reserva === 'Pronta para Retirada' && res.data_limite_retirada) {
          const limit = new Date(res.data_limite_retirada)
          const diffMs = limit.getTime() - now.getTime()
          horas_restantes_garantida = Math.max(0, Math.round(diffMs / (1000 * 60 * 60)))
        }
      }

      const historico_evento = historicoMap[res.id_reserva] || null

      return {
        ...res,
        posicao_fila,
        total_fila,
        data_estimada_disponibilidade,
        horas_restantes_garantida,
        historico_evento,
      }
    })
  },

  /**
   * Conta reservas ativas pendentes para badge no cabeçalho
   */
  async countActive(): Promise<number> {
    const { count, error } = await supabase
      .from('reserva')
      .select('*', { count: 'exact', head: true })
      .in('status_reserva', ['Ativa', 'Pronta para Retirada'])

    if (error) return 0
    return count ?? 0
  },

  /**
   * Pular Fila / Mover para o topo da fila (Admin)
   */
  async promoteToTopOfQueue(id_reserva: number, operatorName = 'Administrador') {
    const { data: res, error: resErr } = await supabase
      .from('reserva')
      .select('*, titulo(titulo_de_livro), leitor(nome_do_leitor)')
      .eq('id_reserva', id_reserva)
      .single()

    if (resErr || !res) throw new Error('Reserva não encontrada.')

    const { data: queue } = await (supabase.from('reserva') as any)
      .select('id_reserva, ordem_fila, data_reserva')
      .eq('id_titulo', res.id_titulo)
      .in('status_reserva', ['Ativa', 'Pronta para Retirada'])
      .order('ordem_fila', { ascending: true })
      .order('data_reserva', { ascending: true })

    if (!queue || queue.length <= 1) return

    let currentRank = 1
    await (supabase.from('reserva') as any)
      .update({ ordem_fila: currentRank })
      .eq('id_reserva', id_reserva)

    for (const item of queue as any[]) {
      if (item.id_reserva !== id_reserva) {
        currentRank++
        await (supabase.from('reserva') as any)
          .update({ ordem_fila: currentRank })
          .eq('id_reserva', item.id_reserva)
      }
    }

    try {
      const bookTitle = (res.titulo as any)?.titulo_de_livro || res.id_titulo
      const readerName = (res.leitor as any)?.nome_do_leitor || `Leitor #${res.id_leitor}`
      await HistoricoService.log(
        res.id_titulo,
        'Fila Reordenada',
        res.id_leitor,
        `Prioridade alterada (Pular Fila): Reserva #${id_reserva} do leitor ${readerName} ("${bookTitle}") promovida para a 1ª posição da fila pelo administrador ${operatorName}.`,
        operatorName,
        'titulo',
      )
    } catch (logErr) {
      console.warn('Erro ao registrar log de reordenação:', logErr)
    }
  },

  /**
   * Reordenar posição de uma reserva na fila (mover para cima ou para baixo)
   */
  async reorderQueue(
    id_titulo: string,
    orderedReservaIds: number[],
    operatorName = 'Administrador',
  ) {
    for (let i = 0; i < orderedReservaIds.length; i++) {
      const resId = orderedReservaIds[i]
      await (supabase.from('reserva') as any).update({ ordem_fila: i + 1 }).eq('id_reserva', resId)
    }

    try {
      await HistoricoService.log(
        id_titulo,
        'Fila Reordenada',
        undefined,
        `Fila de espera da obra ${id_titulo} reordenada manualmente pelo operador ${operatorName}.`,
        operatorName,
        'titulo',
      )
    } catch (logErr) {
      console.warn('Erro ao registrar log:', logErr)
    }
  },

  /**
   * Marcar livro como "Pronto para Retirada" com tempo de Reserva Garantida (ex: 24h)
   * e disparar notificação por e-mail/push/toast
   */
  async markReadyForPickup(
    id_reserva: number,
    id_exemplar?: string,
    customHours?: number,
    operatorName = 'Sistema',
  ) {
    const { data: res, error: resErr } = await supabase
      .from('reserva')
      .select('*, titulo(titulo_de_livro), leitor(nome_do_leitor, email, telefone)')
      .eq('id_reserva', id_reserva)
      .single()

    if (resErr || !res) throw new Error('Reserva não encontrada.')

    const { getPrazoRetiradaDiasUteis } = await import('./parametros')
    const { addBusinessDays } = await import('@/lib/utils')
    const { NotificacaoService } = await import('./notificacoes')

    let limitDate: Date
    let hours = customHours || 0

    if (customHours) {
      limitDate = new Date()
      limitDate.setHours(limitDate.getHours() + customHours)
    } else {
      const prazoUteis = await getPrazoRetiradaDiasUteis()
      limitDate = addBusinessDays(new Date(), prazoUteis)
      // Definir horário de encerramento no final do dia útil (18:00)
      limitDate.setHours(18, 0, 0, 0)
    }

    if (id_exemplar) {
      await supabase.from('exemplar').update({ status: 'Reservado' }).eq('id_exemplar', id_exemplar)
    }

    const { data, error } = await (supabase.from('reserva') as any)
      .update({
        status_reserva: 'Pronta para Retirada',
        data_limite_retirada: limitDate.toISOString(),
        exemplar_reservado_id: id_exemplar || null,
        notificacao_enviada: true,
        data_notificacao: new Date().toISOString(),
      })
      .eq('id_reserva', id_reserva)
      .select()
      .single()

    if (error) throw error

    const bookTitle = (res.titulo as any)?.titulo_de_livro || res.id_titulo
    const readerName = (res.leitor as any)?.nome_do_leitor || `Leitor #${res.id_leitor}`
    const readerEmail = (res.leitor as any)?.email || ''

    try {
      await HistoricoService.log(
        res.id_titulo,
        'Reserva Disponível',
        res.id_leitor,
        `Obra "${bookTitle}" liberada para retirada do leitor ${readerName} (${readerEmail}). Prazo até ${limitDate.toLocaleDateString('pt-BR')}. Notificação enviada.`,
        operatorName,
        'titulo',
      )
    } catch (logErr) {
      console.warn('Erro ao registrar log de reserva disponível:', logErr)
    }

    // Disparar notificação por e-mail via NotificacaoService
    try {
      await NotificacaoService.notificarLiberacaoLivro({
        id_reserva,
        leitorNome: readerName,
        leitorEmail: readerEmail,
        tituloLivro: bookTitle,
        dataLimiteRetirada: limitDate,
        idExemplar: id_exemplar,
        operatorName,
      })
    } catch (notifErr) {
      console.warn('Erro ao disparar e-mail de liberação de livro:', notifErr)
    }

    return {
      data,
      limitDate,
      hours,
      readerName,
      readerEmail,
      bookTitle,
    }
  },

  /**
   * Avalia a disponibilidade e regras para reserva de uma obra.
   * Retorna se todos os exemplares estão emprestados, a data de devolução mais próxima
   * e a sugestão de data de reserva (dia seguinte à data de devolução prevista).
   */
  async checkReservationAvailability(
    id_titulo: string,
    data_limite_desejada?: string | null,
  ): Promise<{
    disponivelParaEmprestimoDireto: boolean
    todosEmprestados: boolean
    filaCheia: boolean
    totalNaFila: number
    limiteFila: number
    dataPrevistaDevolucaoProxima: string | null
    dataSugeridaReserva: string | null // Dia seguinte à devolução prevista (ISO YYYY-MM-DD)
    sugerirNovaData: boolean
  }> {
    const { getLimiteMaximoFilaEspera } = await import('./parametros')
    const limiteFila = await getLimiteMaximoFilaEspera()

    const { data: exemplares } = await supabase
      .from('exemplar')
      .select('id_exemplar, status')
      .eq('id_titulo', id_titulo)

    const totalCopies = exemplares?.length || 0
    const disponiveis = (exemplares || []).filter((e) => e.status === 'Disponivel')
    const disponivelParaEmprestimoDireto = disponiveis.length > 0

    const { count: totalNaFila } = await supabase
      .from('reserva')
      .select('*', { count: 'exact', head: true })
      .eq('id_titulo', id_titulo)
      .in('status_reserva', ['Ativa', 'Pronta para Retirada'])

    const filaCheia = (totalNaFila || 0) >= limiteFila

    // Buscar empréstimos ativos para este título
    const { data: activeLoans } = await supabase
      .from('emprestimo')
      .select('id_emprestimo, data_prevista_devolucao, exemplar!inner(id_titulo)')
      .eq('exemplar.id_titulo', id_titulo)
      .is('data_devolucao_real', null)
      .order('data_prevista_devolucao', { ascending: true })

    const todosEmprestados =
      totalCopies > 0 &&
      !disponivelParaEmprestimoDireto &&
      (activeLoans?.length || 0) >= totalCopies

    let dataPrevistaDevolucaoProxima: string | null = null
    let dataSugeridaReserva: string | null = null
    let sugerirNovaData = false

    if (activeLoans && activeLoans.length > 0) {
      const proximaDevolucao = new Date(activeLoans[0].data_prevista_devolucao)
      dataPrevistaDevolucaoProxima = activeLoans[0].data_prevista_devolucao

      // Dia seguinte à data de entrega prevista
      const diaSeguinte = new Date(proximaDevolucao)
      diaSeguinte.setDate(diaSeguinte.getDate() + 1)
      const diaSeguinteIso = diaSeguinte.toISOString().split('T')[0]
      dataSugeridaReserva = diaSeguinteIso

      if (data_limite_desejada) {
        const desejada = new Date(data_limite_desejada + 'T23:59:59')
        // Se a data desejada for ANTERIOR à data prevista de devolução (ou no mesmo dia antes da liberação)
        // todos os exemplares estão emprestados até essa data limite
        if (desejada <= proximaDevolucao) {
          sugerirNovaData = true
        }
      }
    }

    return {
      disponivelParaEmprestimoDireto,
      todosEmprestados,
      filaCheia,
      totalNaFila: totalNaFila || 0,
      limiteFila,
      dataPrevistaDevolucaoProxima,
      dataSugeridaReserva,
      sugerirNovaData,
    }
  },

  async create(
    id_titulo: string,
    id_leitor: number,
    operatorName?: string,
    data_limite_desejada?: string | null,
  ) {
    const { getLimiteMaximoFilaEspera } = await import('./parametros')
    const limiteFila = await getLimiteMaximoFilaEspera()

    const { data: exemplares } = await supabase
      .from('exemplar')
      .select('id_exemplar, status')
      .eq('id_titulo', id_titulo)

    const disponiveis = (exemplares || []).filter((e) => e.status === 'Disponivel')
    if (disponiveis.length > 0) {
      throw new Error(
        'Esta obra possui exemplar(es) disponível(is) na biblioteca. Realize o empréstimo direto em vez de reservar.',
      )
    }

    // Regra 3.1 & 3.2: Fila de espera aceita no máximo N leitores (padrão 3)
    const { count: totalNaFila } = await supabase
      .from('reserva')
      .select('*', { count: 'exact', head: true })
      .eq('id_titulo', id_titulo)
      .in('status_reserva', ['Ativa', 'Pronta para Retirada'])

    if ((totalNaFila || 0) >= limiteFila) {
      throw new Error('Fila de espera está completa!')
    }

    const { count: userActiveReservas } = await supabase
      .from('reserva')
      .select('*', { count: 'exact', head: true })
      .eq('id_leitor', id_leitor)
      .in('status_reserva', ['Ativa', 'Pronta para Retirada'])

    if ((userActiveReservas || 0) >= 3) {
      throw new Error('Limite máximo de 3 reservas ativas simultâneas atingido para este leitor.')
    }

    const { data: existing } = await supabase
      .from('reserva')
      .select('id_reserva')
      .eq('id_titulo', id_titulo)
      .eq('id_leitor', id_leitor)
      .in('status_reserva', ['Ativa', 'Pronta para Retirada'])
      .maybeSingle()

    if (existing) {
      throw new Error('Você já possui uma reserva ativa na fila para esta obra.')
    }

    const { data: emprestimosAtivosDoLeitor } = await supabase
      .from('emprestimo')
      .select('id_emprestimo, exemplar!inner(id_titulo)')
      .eq('id_leitor', id_leitor)
      .is('data_devolucao_real', null)
      .eq('exemplar.id_titulo', id_titulo)

    if (emprestimosAtivosDoLeitor && emprestimosAtivosDoLeitor.length > 0) {
      throw new Error('Você já possui um exemplar desta mesma obra emprestado atualmente.')
    }

    // Preservar validação de acervo da diretoria
    const { data: tituloObj } = await (supabase.from('titulo') as any)
      .select('colecao, titulo_de_livro')
      .eq('id_titulo', id_titulo)
      .single()

    const { data: reader } = await (supabase.from('leitor') as any)
      .select('bloqueado, nome_do_leitor, acesso_diretoria, id_auth')
      .eq('id_leitor', id_leitor)
      .single()

    if (reader?.bloqueado) {
      throw new Error('Leitor com cadastro bloqueado não pode solicitar reservas.')
    }

    if (tituloObj?.colecao === 'diretoria') {
      let hasAccess = Boolean(reader?.acesso_diretoria)
      if (!hasAccess && reader?.id_auth) {
        const { data: prof } = await (supabase.from('profiles') as any)
          .select('papel')
          .eq('id', reader.id_auth)
          .maybeSingle()
        if (prof && (prof.papel === 'admin' || prof.papel === 'operador_diretoria')) {
          hasAccess = true
        }
      }
      if (!hasAccess) {
        throw new Error(
          'O leitor selecionado não possui permissão para reservar livros da Coleção da Diretoria.',
        )
      }
    }

    const tituloNome = tituloObj?.titulo_de_livro || id_titulo
    const leitorNome = reader?.nome_do_leitor || `Leitor #${id_leitor}`

    const { data: currentQueue } = await (supabase.from('reserva') as any)
      .select('ordem_fila')
      .eq('id_titulo', id_titulo)
      .in('status_reserva', ['Ativa', 'Pronta para Retirada'])
      .order('ordem_fila', { ascending: false })
      .limit(1)

    const nextOrder =
      (currentQueue && currentQueue.length > 0 ? (currentQueue[0] as any).ordem_fila || 0 : 0) + 1

    const { data, error } = await (supabase.from('reserva') as any)
      .insert({
        id_titulo,
        id_leitor,
        status_reserva: 'Ativa',
        ordem_fila: nextOrder,
        data_reserva: new Date().toISOString(),
        data_limite_desejada: data_limite_desejada || null,
      })
      .select()
      .single()

    if (error) throw error

    try {
      await HistoricoService.log(
        id_titulo,
        'Reserva Criada',
        id_leitor,
        `Reserva da obra "${tituloNome}" solicitada para o leitor ${leitorNome} (posição ${nextOrder} na fila)`,
        operatorName || 'Sistema',
        'titulo',
      )
    } catch (logErr) {
      console.warn('Erro ao registrar log de reserva criada:', logErr)
    }

    return data
  },

  /**
   * Avança a fila de espera para o próximo leitor da obra e dispara notificação por e-mail.
   * Se houver exemplar reservado, transfere para a reserva do próximo leitor.
   * Atualiza a data de agendamento (data_limite_desejada) do leitor para o dia seguinte da disponibilidade.
   */
  async advanceQueueToNext(
    id_titulo: string,
    id_exemplar?: string | null,
    operatorName = 'Sistema',
    motivo = 'Avanço da Fila',
    tipoEvento:
      | 'liberacao'
      | 'entrega_antecipada'
      | 'avanco_fila_cancelamento'
      | 'avanco_fila_vencimento' = 'liberacao',
    dataDisponibilidadeBase?: Date,
  ) {
    const { getPrazoRetiradaDiasUteis } = await import('./parametros')
    const { addBusinessDays } = await import('@/lib/utils')
    const { NotificacaoService } = await import('./notificacoes')

    // Buscar próximo leitor da fila com status 'Ativa'
    const { data: nextList, error: nextErr } = await (supabase.from('reserva') as any)
      .select(`
        id_reserva,
        id_titulo,
        id_leitor,
        ordem_fila,
        data_limite_desejada,
        titulo:id_titulo(titulo_de_livro),
        leitor:id_leitor(nome_do_leitor, email)
      `)
      .eq('id_titulo', id_titulo)
      .eq('status_reserva', 'Ativa')
      .order('ordem_fila', { ascending: true })
      .order('data_reserva', { ascending: true })
      .limit(1)

    if (nextErr) {
      console.warn('Erro ao buscar próximo da fila:', nextErr)
      return null
    }

    if (!nextList || nextList.length === 0) {
      // Sem mais ninguém na fila: se havia exemplar retido, torná-lo disponível
      if (id_exemplar) {
        await supabase
          .from('exemplar')
          .update({ status: 'Disponivel' })
          .eq('id_exemplar', id_exemplar)
      }
      return null
    }

    const proximaReserva = nextList[0]
    const prazoUteis = await getPrazoRetiradaDiasUteis()
    const now = new Date()
    const dataLimite = addBusinessDays(now, prazoUteis)
    dataLimite.setHours(18, 0, 0, 0)

    // Agendamento sugerido/atualizado: dia seguinte à data em que o livro ficou disponível
    const baseDate = dataDisponibilidadeBase || now
    const diaSeguinte = new Date(baseDate)
    diaSeguinte.setDate(diaSeguinte.getDate() + 1)
    const diaSeguinteIso = diaSeguinte.toISOString().split('T')[0]

    // Atualizar próxima reserva para 'Pronta para Retirada' e sua data de agendamento desejada
    await (supabase.from('reserva') as any)
      .update({
        status_reserva: 'Pronta para Retirada',
        data_limite_retirada: dataLimite.toISOString(),
        data_limite_desejada: diaSeguinteIso,
        exemplar_reservado_id: id_exemplar || null,
        notificacao_enviada: true,
        data_notificacao: now.toISOString(),
      })
      .eq('id_reserva', proximaReserva.id_reserva)

    // Se houver exemplar, manter como 'Reservado'
    if (id_exemplar) {
      await supabase.from('exemplar').update({ status: 'Reservado' }).eq('id_exemplar', id_exemplar)
    }

    const bookTitle = (proximaReserva.titulo as any)?.titulo_de_livro || id_titulo
    const readerName =
      (proximaReserva.leitor as any)?.nome_do_leitor || `Leitor #${proximaReserva.id_leitor}`
    const readerEmail = (proximaReserva.leitor as any)?.email || ''

    try {
      await HistoricoService.log(
        id_titulo,
        'Fila Avançada',
        proximaReserva.id_leitor,
        `Vez da fila passou para o próximo leitor: Reserva #${proximaReserva.id_reserva} (${readerName}) liberada para retirada até ${dataLimite.toLocaleDateString('pt-BR')} (${prazoUteis} dias úteis). Agendamento atualizado para ${diaSeguinte.toLocaleDateString('pt-BR')}. Motivo: ${motivo}.`,
        operatorName,
        'titulo',
      )
    } catch (logErr) {
      console.warn('Erro ao registrar log de avanço de fila:', logErr)
    }

    // Notificar por e-mail o próximo leitor
    try {
      await NotificacaoService.notificarLiberacaoLivro({
        id_reserva: proximaReserva.id_reserva,
        leitorNome: readerName,
        leitorEmail: readerEmail,
        tituloLivro: bookTitle,
        dataLimiteRetirada: dataLimite,
        idExemplar: id_exemplar || undefined,
        operatorName,
        motivoEvento: tipoEvento,
      })
    } catch (notifErr) {
      console.warn('Erro ao notificar próximo leitor da fila:', notifErr)
    }

    return proximaReserva
  },

  /**
   * REAGENDAMENTO EM CASCATA:
   * Se o livro for emprestado novamente (ou o empréstimo renovado),
   * o próximo leitor da fila tem sua data de agendamento (data_limite_desejada)
   * alterada automaticamente para o dia seguinte à nova devolução prevista.
   * Se houver outros na fila, suas previsões também são encadeadas.
   */
  async cascadeRescheduleQueue(
    id_titulo: string,
    novaDevolucaoPrevista: Date,
    operatorName = 'Sistema',
  ) {
    const { data: queue, error } = await (supabase.from('reserva') as any)
      .select(`
        id_reserva,
        id_titulo,
        id_leitor,
        ordem_fila,
        data_limite_desejada,
        titulo:id_titulo(titulo_de_livro),
        leitor:id_leitor(nome_do_leitor, email)
      `)
      .eq('id_titulo', id_titulo)
      .eq('status_reserva', 'Ativa')
      .order('ordem_fila', { ascending: true })
      .order('data_reserva', { ascending: true })

    if (error || !queue || queue.length === 0) return []

    // Próximo da fila (1º): dia seguinte à data prevista de devolução
    const diaSeguinte = new Date(novaDevolucaoPrevista)
    diaSeguinte.setDate(diaSeguinte.getDate() + 1)
    const novaDataIso = diaSeguinte.toISOString().split('T')[0]

    const updatedList = []

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]
      // Para o 1º da fila, exatamente dia seguinte à devolução prevista.
      // Para os subsequentes, projeta-se em cascata baseada no prazo padrão de empréstimo (15 dias por leitor).
      const projectedDate = new Date(diaSeguinte)
      if (i > 0) {
        projectedDate.setDate(projectedDate.getDate() + i * 15)
      }
      const projIso = projectedDate.toISOString().split('T')[0]

      await (supabase.from('reserva') as any)
        .update({
          data_limite_desejada: projIso,
        })
        .eq('id_reserva', item.id_reserva)

      const bookTitle = (item.titulo as any)?.titulo_de_livro || id_titulo
      const readerName = (item.leitor as any)?.nome_do_leitor || `Leitor #${item.id_leitor}`

      try {
        await HistoricoService.log(
          id_titulo,
          'Reagendamento em Cascata',
          item.id_leitor,
          `Data de reserva #${item.id_reserva} (${readerName}) reagendada automaticamente para ${projectedDate.toLocaleDateString('pt-BR')} (dia seguinte à devolução prevista da obra "${bookTitle}").`,
          operatorName,
          'titulo',
        )
      } catch (logErr) {
        console.warn('Erro ao registrar log de reagendamento em cascata:', logErr)
      }

      updatedList.push({ id_reserva: item.id_reserva, nova_data: projIso })
    }

    return updatedList
  },

  /**
   * Checa reservas com status 'Pronta para Retirada' cujo prazo de retirada expirou.
   * Se expirou, marca como 'Expirada', passa a vez para o próximo da fila e notifica-o.
   */
  async checkAndExpirePickupDeadlines(operatorName = 'Sistema') {
    const now = new Date()
    const { data: expiredList, error } = await (supabase.from('reserva') as any)
      .select(`
        id_reserva,
        id_titulo,
        id_leitor,
        exemplar_reservado_id,
        data_limite_retirada,
        titulo:id_titulo(titulo_de_livro),
        leitor:id_leitor(nome_do_leitor, email)
      `)
      .eq('status_reserva', 'Pronta para Retirada')
      .not('data_limite_retirada', 'is', null)
      .lt('data_limite_retirada', now.toISOString())

    if (error) {
      console.warn('Erro ao verificar prazos expirados:', error)
      return []
    }

    const processed = []

    for (const exp of (expiredList || []) as any[]) {
      // 1. Marcar como Expirada
      await (supabase.from('reserva') as any)
        .update({ status_reserva: 'Expirada' })
        .eq('id_reserva', exp.id_reserva)

      const bookTitle = exp.titulo?.titulo_de_livro || exp.id_titulo
      const readerName = exp.leitor?.nome_do_leitor || `Leitor #${exp.id_leitor}`

      try {
        await HistoricoService.log(
          exp.id_titulo,
          'Reserva Expirada',
          exp.id_leitor,
          `Prazo de retirada da Reserva #${exp.id_reserva} expirou para ${readerName} (obra "${bookTitle}"). A vez passou para o próximo da fila.`,
          operatorName,
          'titulo',
        )
      } catch (logErr) {
        console.warn('Erro ao registrar log de reserva expirada:', logErr)
      }

      // 2. Passar a vez para o próximo leitor da fila
      await ReservasService.advanceQueueToNext(
        exp.id_titulo,
        exp.exemplar_reservado_id,
        operatorName,
        `Prazo de retirada expirado do leitor ${readerName}`,
        'avanco_fila_vencimento',
      )

      processed.push(exp)
    }

    return processed
  },

  async cancel(id_reserva: number, operatorName?: string) {
    const { data: reserva } = await (supabase.from('reserva') as any)
      .select(`
        id_reserva,
        id_titulo,
        id_leitor,
        status_reserva,
        exemplar_reservado_id,
        titulo:id_titulo(titulo_de_livro),
        leitor:id_leitor(nome_do_leitor)
      `)
      .eq('id_reserva', id_reserva)
      .single()

    const wasReadyOrActive =
      reserva?.status_reserva === 'Pronta para Retirada' || reserva?.status_reserva === 'Ativa'
    const hadCopy = (reserva as any)?.exemplar_reservado_id

    const { data, error } = await supabase
      .from('reserva')
      .update({ status_reserva: 'Cancelada' })
      .eq('id_reserva', id_reserva)
      .select()
      .single()

    if (error) throw error

    if (reserva) {
      const bookTitle = (reserva.titulo as any)?.titulo_de_livro || reserva.id_titulo
      const readerName = (reserva.leitor as any)?.nome_do_leitor || `Leitor #${reserva.id_leitor}`
      try {
        await HistoricoService.log(
          reserva.id_titulo,
          'Reserva Cancelada',
          reserva.id_leitor,
          `Reserva #${id_reserva} da obra "${bookTitle}" para o leitor ${readerName} foi cancelada`,
          operatorName || 'Sistema',
          'titulo',
        )
      } catch (logErr) {
        console.warn('Erro ao registrar log de reserva cancelada:', logErr)
      }

      // Regra: quando um leitor desistir/cancelar, a fila avança para o próximo
      // e notifica-o por e-mail
      if (wasReadyOrActive) {
        await ReservasService.advanceQueueToNext(
          reserva.id_titulo,
          hadCopy,
          operatorName || 'Sistema',
          `Cancelamento / Desistência da reserva #${id_reserva} (${readerName})`,
          'avanco_fila_cancelamento',
        )
      }
    }

    return data
  },

  async fulfill(id_reserva: number, operatorName = 'Sistema') {
    // 1. Tenta executar via RPC transacional atômico atender_reserva
    const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)('atender_reserva', {
      p_id_reserva: id_reserva,
      p_operador_nome: operatorName,
    })

    if (!rpcErr && rpcData) {
      const res = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData
      if (res && res.success) {
        try {
          const bookTitle = res.livro_titulo || 'Livro'
          const readerName = res.leitor_nome || `Leitor #${res.id_leitor}`
          const copyId = res.id_exemplar

          await HistoricoService.log(
            copyId,
            'Reserva Atendida',
            res.id_leitor,
            `Reserva #${id_reserva} atendida: exemplar ${copyId} ("${bookTitle}") liberado para o leitor ${readerName} (Aguardando Retirada)`,
            operatorName,
            'exemplar',
          )
        } catch (logError) {
          console.warn('Erro ao registrar log da reserva atendida:', logError)
        }
        return res
      }
    }

    // Se o RPC retornou erro explícito que não seja função inexistente, propaga
    if (
      rpcErr &&
      !rpcErr.message?.includes('function public.atender_reserva') &&
      !rpcErr.message?.includes('could not find function')
    ) {
      throw new Error(rpcErr.message || 'Erro ao atender reserva.')
    }

    // 2. Fallback resiliente com busca case-insensitive e suporte a BLOQUEADO/RESERVADO/DISPONIVEL
    const { data: reservaData, error: resErr } = await (supabase.from('reserva') as any)
      .select(`
        *,
        titulo:id_titulo(titulo_de_livro, colecao),
        leitor:id_leitor(nome_do_leitor, acesso_diretoria, id_auth)
      `)
      .eq('id_reserva', id_reserva)
      .single()

    if (resErr || !reservaData) {
      throw new Error('Reserva não encontrada.')
    }

    let copyToUseId = (reservaData as any).exemplar_reservado_id

    if (!copyToUseId) {
      // Buscar exemplares disponíveis ou já bloqueados/reservados do título
      const { data: exemplares, error: exErr } = await supabase
        .from('exemplar')
        .select('id_exemplar, status, seq')
        .eq('id_titulo', reservaData.id_titulo)

      if (exErr) throw exErr

      const list = exemplares || []
      // Prioridade 1: Disponível (qualquer casing)
      const disp = list.find((e) =>
        ['disponivel', 'disponível'].includes((e.status || '').toLowerCase()),
      )
      if (disp) {
        copyToUseId = disp.id_exemplar
      } else {
        // Prioridade 2: Bloqueado ou Reservado
        const bloq = list.find((e) =>
          ['bloqueado', 'reservado'].includes((e.status || '').toLowerCase()),
        )
        if (bloq) {
          copyToUseId = bloq.id_exemplar
        }
      }
    }

    if (!copyToUseId) {
      throw new Error('Nenhum exemplar disponível para atender esta reserva no momento.')
    }

    // Verificar se o título é da diretoria e se o leitor possui acesso
    const tituloObj = reservaData.titulo
    if (tituloObj?.colecao === 'diretoria') {
      const readerObj = reservaData.leitor
      let hasAccess = Boolean(readerObj?.acesso_diretoria)
      if (!hasAccess && readerObj?.id_auth) {
        const { data: prof } = await (supabase.from('profiles') as any)
          .select('papel')
          .eq('id', readerObj.id_auth)
          .maybeSingle()
        if (prof && (prof.papel === 'admin' || prof.papel === 'operador_diretoria')) {
          hasAccess = true
        }
      }
      if (!hasAccess) {
        throw new Error(
          'O leitor selecionado não possui permissão para retirar livros da Diretoria.',
        )
      }
    }

    const { getPrazoRetiradaDiasUteis } = await import('./parametros')
    const { addBusinessDays } = await import('@/lib/utils')
    const prazoUteis = await getPrazoRetiradaDiasUteis()
    const now = new Date()
    const limitDate = addBusinessDays(now, prazoUteis)
    limitDate.setHours(18, 0, 0, 0)

    const expected = new Date()
    expected.setDate(now.getDate() + 15)

    const { data, error } = await supabase
      .from('reserva')
      .update({
        status_reserva: 'Atendida',
        status: 'CONTEMPLADO',
        data_atendimento: now.toISOString(),
        exemplar_reservado_id: copyToUseId,
      })
      .eq('id_reserva', id_reserva)
      .select()
      .single()

    if (error) throw error

    // Verificar se já existe empréstimo PENDENTE_RETIRADA
    const { data: existingLoan } = await supabase
      .from('emprestimo')
      .select('id_emprestimo')
      .eq('id_exemplar', copyToUseId)
      .eq('id_leitor', reservaData.id_leitor)
      .is('data_devolucao_real', null)
      .maybeSingle()

    if (!existingLoan) {
      const { error: loanErr } = await supabase.from('emprestimo').insert({
        id_exemplar: copyToUseId,
        id_leitor: reservaData.id_leitor,
        data_emprestimo: now.toISOString(),
        data_prevista_devolucao: expected.toISOString(),
        data_limite_retirada: limitDate.toISOString(),
        status: 'PENDENTE_RETIRADA',
        atraso: false,
      })
      if (loanErr) throw loanErr
    }

    // Exemplar passa para BLOQUEADO aguardando retirada física
    await supabase.from('exemplar').update({ status: 'BLOQUEADO' }).eq('id_exemplar', copyToUseId)

    try {
      const bookTitle = (reservaData.titulo as any)?.titulo_de_livro || reservaData.id_titulo
      const readerName =
        (reservaData.leitor as any)?.nome_do_leitor || `Leitor #${reservaData.id_leitor}`

      await HistoricoService.log(
        copyToUseId,
        'Reserva Atendida',
        reservaData.id_leitor,
        `Reserva #${id_reserva} atendida: exemplar ${copyToUseId} ("${bookTitle}") liberado para o leitor ${readerName} (Aguardando Retirada)`,
        operatorName,
        'exemplar',
      )
    } catch (logError) {
      console.warn('Erro ao registrar log da reserva atendida:', logError)
    }

    return data
  },
}
