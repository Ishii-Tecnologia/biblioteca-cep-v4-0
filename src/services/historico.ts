import { supabase } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'

export interface MovimentacaoReportItem {
  id: string | number
  tipo_registro: 'Empréstimo' | 'Devolução' | 'Reserva'
  data_evento: string
  titulo_livro: string
  id_exemplar?: string | null
  leitor_nome: string
  status: string
  detalhes: string
  colecao?: 'geral' | 'diretoria' | string
}

export interface HistoricoDetailed {
  id_log: number | string
  id_exemplar: string
  tipo_operacao: string
  data_hora: string
  id_leitor?: number | null
  usuario_sistema?: string | null
  detalhes?: string | null
  observacao?: string | null
  colecao?: 'geral' | 'diretoria' | string | null
  exemplar?: {
    id_exemplar: string
    titulo?: {
      titulo_de_livro: string
      autor: string
      colecao?: string
    }
  }
  leitor?: {
    nome_do_leitor: string
    email: string
  }
}

export const HistoricoService = {
  async getAll(
    limit = 0,
    operationFilter?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<HistoricoDetailed[]> {
    let query = supabase.from('historico').select('*').order('created_at', { ascending: false })

    if (limit > 0) {
      query = query.limit(limit)
    }

    if (operationFilter && operationFilter !== 'all' && operationFilter !== 'todos') {
      if (operationFilter === 'manutencao_todas' || operationFilter === 'Manutenção') {
        query = query.or('tipo.ilike.%manuten%,tipo.ilike.%manutencao%')
      } else if (operationFilter === 'acervo_geral') {
        query = query.or('tipo.ilike.%livro%,tipo.ilike.%exemplar%,tipo.ilike.%acervo%')
      } else {
        query = query.ilike('tipo', operationFilter)
      }
    }

    if (startDate && startDate.trim()) {
      // Começo do dia em formato ISO local
      query = query.gte('created_at', `${startDate.trim()}T00:00:00`)
    }

    if (endDate && endDate.trim()) {
      // Fim do dia
      query = query.lte('created_at', `${endDate.trim()}T23:59:59.999Z`)
    }

    const { data, error } = await query
    if (error) {
      console.error('Erro ao buscar histórico:', error)
      throw error
    }

    const rows = data || []

    // Coletar id_leitores, id_exemplares e usuario_ids únicos para enriquecimento
    const readerIds = Array.from(
      new Set(
        rows
          .map((r: any) => r.id_leitor)
          .filter((id): id is number => typeof id === 'number' && !isNaN(id)),
      ),
    )

    const userIds = Array.from(
      new Set(
        rows
          .map((r: any) => r.usuario_id)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
      ),
    )

    const exemplarIds = Array.from(
      new Set(
        rows
          .filter(
            (r: any) =>
              (r.entidade_tipo === 'exemplar' || (!r.entidade_tipo && r.tipo)) && r.entidade_id,
          )
          .map((r: any) => r.entidade_id)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
      ),
    )

    const tituloIds = Array.from(
      new Set(
        rows
          .filter((r: any) => r.entidade_tipo === 'titulo' && r.entidade_id)
          .map((r: any) => r.entidade_id)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
      ),
    )

    const readersMap = new Map<number, { nome_do_leitor: string; email: string }>()
    if (readerIds.length > 0) {
      const { data: readersData, error: readersErr } = await supabase
        .from('leitor')
        .select('id_leitor, nome_do_leitor, email')
        .in('id_leitor', readerIds)

      if (!readersErr && readersData) {
        for (const r of readersData) {
          readersMap.set(r.id_leitor, {
            nome_do_leitor: r.nome_do_leitor,
            email: r.email,
          })
        }
      }
    }

    const usersMap = new Map<string, string>()
    if (userIds.length > 0) {
      const { data: profilesData, error: profilesErr } = await supabase
        .from('profiles')
        .select('id, nome, full_name, email')
        .in('id', userIds)

      if (!profilesErr && profilesData) {
        for (const p of profilesData) {
          const displayName = (p.nome || p.full_name || p.email || 'Operador').trim()
          usersMap.set(p.id, displayName)
        }
      }

      // Fallback para usuário autenticado atual se coincidir com usuario_id
      try {
        const { data: currentAuth } = await supabase.auth.getUser()
        if (currentAuth?.user?.id && !usersMap.has(currentAuth.user.id)) {
          const metaName =
            currentAuth.user.user_metadata?.full_name ||
            currentAuth.user.user_metadata?.nome ||
            currentAuth.user.email?.split('@')[0]
          if (metaName) {
            usersMap.set(currentAuth.user.id, metaName.trim())
          }
        }
      } catch {
        // silencioso
      }
    }

    const exemplarsMap = new Map<
      string,
      {
        id_exemplar: string
        titulo?: {
          titulo_de_livro: string
          autor: string
          colecao?: string
        }
      }
    >()
    if (exemplarIds.length > 0) {
      const { data: exemplarsData, error: exemplarsErr } = await supabase
        .from('exemplar')
        .select(`
          id_exemplar,
          titulo:id_titulo(
            titulo_de_livro,
            autor,
            colecao
          )
        `)
        .in('id_exemplar', exemplarIds)

      if (!exemplarsErr && exemplarsData) {
        for (const ex of exemplarsData as any[]) {
          exemplarsMap.set(ex.id_exemplar, {
            id_exemplar: ex.id_exemplar,
            titulo: Array.isArray(ex.titulo) ? ex.titulo[0] : ex.titulo,
          })
        }
      }
    }

    const titulosDirectMap = new Map<string, { colecao: string; titulo_de_livro?: string }>()
    if (tituloIds.length > 0) {
      const { data: titulosData, error: titulosErr } = await supabase
        .from('titulo')
        .select('id_titulo, colecao, titulo_de_livro')
        .in('id_titulo', tituloIds)

      if (!titulosErr && titulosData) {
        for (const t of titulosData as any[]) {
          titulosDirectMap.set(t.id_titulo, {
            colecao: t.colecao || 'geral',
            titulo_de_livro: t.titulo_de_livro,
          })
        }
      }
    }

    const mapped: HistoricoDetailed[] = rows.map((item: any) => {
      const entidadeId = item.entidade_id ? String(item.entidade_id) : '-'
      const leitorInfo = item.id_leitor ? readersMap.get(item.id_leitor) : undefined
      const exemplarInfo =
        item.entidade_tipo === 'exemplar' || (!item.entidade_tipo && item.tipo)
          ? exemplarsMap.get(entidadeId)
          : undefined

      // Determinar coleção associada (se for de exemplar ou título)
      let rowColecao: 'geral' | 'diretoria' | string | null = null
      if (exemplarInfo?.titulo?.colecao) {
        rowColecao = exemplarInfo.titulo.colecao
      } else if (item.entidade_tipo === 'titulo' && titulosDirectMap.has(entidadeId)) {
        rowColecao = titulosDirectMap.get(entidadeId)!.colecao
      } else if (entidadeId.toUpperCase().startsWith('DIR-')) {
        rowColecao = 'diretoria'
      }

      let operadorName = 'Sistema'
      if (item.usuario_id && usersMap.has(item.usuario_id)) {
        operadorName = usersMap.get(item.usuario_id)!
      } else if (item.usuario_id) {
        operadorName = 'Operador'
      }

      return {
        id_log: item.id,
        id_exemplar: entidadeId,
        tipo_operacao: item.tipo,
        data_hora: item.created_at,
        id_leitor: item.id_leitor,
        usuario_sistema: operadorName,
        detalhes: item.descricao,
        observacao: item.observacao || null,
        colecao: rowColecao,
        leitor: leitorInfo,
        exemplar: exemplarInfo,
      }
    })

    return mapped
  },

  async countWithFilters(
    operationFilter?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<number> {
    let query = supabase.from('historico').select('id', { count: 'exact', head: true })

    if (operationFilter && operationFilter !== 'all' && operationFilter !== 'todos') {
      if (operationFilter === 'manutencao_todas' || operationFilter === 'Manutenção') {
        query = query.or('tipo.ilike.%manuten%,tipo.ilike.%manutencao%')
      } else if (operationFilter === 'acervo_geral') {
        query = query.or('tipo.ilike.%livro%,tipo.ilike.%exemplar%,tipo.ilike.%acervo%')
      } else {
        query = query.ilike('tipo', operationFilter)
      }
    }

    if (startDate && startDate.trim()) {
      query = query.gte('created_at', `${startDate.trim()}T00:00:00`)
    }

    if (endDate && endDate.trim()) {
      query = query.lte('created_at', `${endDate.trim()}T23:59:59.999Z`)
    }

    const { count, error } = await query
    if (error) {
      console.error('Erro ao contar histórico:', error)
      return 0
    }
    return count ?? 0
  },

  async deleteWithFilters(
    olderThanDaysOrFilter?: number | string,
    operationFilter?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<number> {
    let opFilter = operationFilter
    let start = startDate
    let end = endDate

    if (typeof olderThanDaysOrFilter === 'number') {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - olderThanDaysOrFilter)
      end = cutoff.toISOString()
    } else if (typeof olderThanDaysOrFilter === 'string' && !isNaN(Number(olderThanDaysOrFilter))) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - parseInt(olderThanDaysOrFilter, 10))
      end = cutoff.toISOString()
    } else if (typeof olderThanDaysOrFilter === 'string') {
      opFilter = olderThanDaysOrFilter
    }
    const count = await this.countWithFilters(opFilter, start, end)
    if (count === 0) return 0

    let query = supabase.from('historico').delete()

    if (opFilter && opFilter !== 'todos') {
      if (opFilter === 'manutencao_todas' || opFilter === 'Manutenção') {
        query = query.or('tipo.ilike.%manuten%,tipo.ilike.%manutencao%')
      } else if (opFilter === 'acervo_geral') {
        query = query.or('tipo.ilike.%livro%,tipo.ilike.%exemplar%,tipo.ilike.%acervo%')
      } else {
        query = query.eq('tipo', opFilter)
      }
    }

    if (start) {
      query = query.gte('created_at', start)
    }

    if (end) {
      query = query.lte('created_at', end)
    }
    const { error } = await query
    if (error) {
      console.error('Erro ao limpar histórico:', error)
      throw error
    }

    return count
  },

  async log(
    id_exemplar: string,
    tipo_operacao: string,
    id_leitor?: number | null,
    detalhes?: string,
    usuario_sistema = 'Sistema',
    entidade_tipo = 'exemplar',
    explicitUserId?: string | null,
    observacao?: string | null,
  ) {
    let finalDescricao = detalhes
    if (!finalDescricao) {
      if (id_leitor) {
        finalDescricao = `${tipo_operacao} do exemplar ${id_exemplar} para o leitor #${id_leitor}`
      } else {
        finalDescricao = `${tipo_operacao} do exemplar ${id_exemplar}`
      }
    }

    let resolvedUserId: string | null = explicitUserId || null
    if (!resolvedUserId) {
      try {
        const { data: authData } = await supabase.auth.getUser()
        if (authData?.user?.id) {
          resolvedUserId = authData.user.id
        }
      } catch {
        // Fallback se não autenticado
      }
    }

    // Se temos usuario_sistema explícito e usuário logado, garantir que o profile tenha nome coerente se ainda não tiver
    if (
      resolvedUserId &&
      usuario_sistema &&
      usuario_sistema !== 'Sistema' &&
      usuario_sistema !== 'Operador'
    ) {
      try {
        // Atualização não-bloqueante de fallback para garantir nome no profile
        void Promise.resolve(
          supabase
            .from('profiles')
            .update({ nome: usuario_sistema, full_name: usuario_sistema })
            .eq('id', resolvedUserId)
            .is('nome', null),
        ).catch(() => {})
      } catch {
        // ignora
      }
    }

    const { data, error } = await supabase
      .from('historico')
      .insert({
        tipo: tipo_operacao,
        descricao: finalDescricao,
        entidade_tipo: entidade_tipo,
        entidade_id: id_exemplar || '',
        id_leitor: id_leitor || null,
        usuario_id: resolvedUserId,
        observacao: observacao?.trim() || null,
      })
      .select()

    if (error) {
      console.error('Erro ao inserir log no histórico:', error)
    }

    return data
  },

  async getTitulosComExemplares() {
    const { data, error } = await supabase
      .from('titulo')
      .select(`
        id_titulo,
        titulo_de_livro,
        autor,
        categoria,
        editora,
        colecao,
        ativo,
        created_at,
        exemplar(
          id_exemplar,
          seq,
          status,
          localizacao,
          created_at
        )
      `)
      .order('titulo_de_livro', { ascending: true })

    if (error) throw error
    return (data || []).map((t: any) => ({
      ...t,
      colecao: t.colecao || (t.id_titulo?.toUpperCase().startsWith('DIR-') ? 'diretoria' : 'geral'),
    }))
  },

  async getUsuariosReport() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name', { ascending: true })

    if (error) throw error
    return data || []
  },

  async getLeitoresReport() {
    const { data, error } = await supabase
      .from('leitor')
      .select('*, emprestimo(id_emprestimo, data_devolucao_real, atraso, data_prevista_devolucao)')
      .order('nome_do_leitor', { ascending: true })

    if (error) throw error

    const now = new Date()
    return (data || []).map((l: any) => {
      const loans = l.emprestimo || []
      const activeLoans = loans.filter((lo: any) => !lo.data_devolucao_real)
      const overdueLoans = activeLoans.filter((lo: any) => {
        if (lo.atraso) return true
        if (lo.data_prevista_devolucao) {
          return new Date(lo.data_prevista_devolucao) < now
        }
        return false
      })

      return {
        id_leitor: l.id_leitor,
        id_auth: l.id_auth,
        nome_do_leitor: l.nome_do_leitor,
        email: l.email,
        telefone: l.telefone,
        data_cadastro: l.data_cadastro,
        bloqueado: l.bloqueado,
        foto: l.foto || null,
        created_at: l.created_at,
        emprestimos_ativos: activeLoans.length,
        emprestimos_atrasados: overdueLoans.length,
        total_emprestimos: loans.length,
      }
    })
  },

  async getMovimentacoesPorData(dataInicio?: string, dataFim?: string) {
    let empQuery = supabase
      .from('emprestimo')
      .select(`
        id_emprestimo,
        data_emprestimo,
        data_prevista_devolucao,
        data_devolucao_real,
        atraso,
        id_exemplar,
        exemplar (
          id_exemplar,
          titulo (
            titulo_de_livro,
            colecao
          )
        ),
        leitor (
          nome_do_leitor
        )
      `)
      .order('data_emprestimo', { ascending: false })

    if (dataInicio) {
      empQuery = empQuery.gte('data_emprestimo', dataInicio)
    }
    if (dataFim) {
      empQuery = empQuery.lte('data_emprestimo', `${dataFim}T23:59:59.999Z`)
    }

    const { data: loansData, error: loansErr } = await empQuery
    if (loansErr) throw loansErr

    let resQuery = supabase
      .from('reserva')
      .select(`
        id_reserva,
        data_reserva,
        data_atendimento,
        status_reserva,
        id_titulo,
        titulo (
          titulo_de_livro,
          colecao
        ),
        leitor (
          nome_do_leitor
        )
      `)
      .order('data_reserva', { ascending: false })

    if (dataInicio) {
      resQuery = resQuery.gte('data_reserva', dataInicio)
    }
    if (dataFim) {
      resQuery = resQuery.lte('data_reserva', `${dataFim}T23:59:59.999Z`)
    }

    const { data: reservasData, error: resErr } = await resQuery
    if (resErr) throw resErr

    const movimentacoes: MovimentacaoReportItem[] = []

    ;(loansData || []).forEach((loan: any) => {
      const bookTitle = loan.exemplar?.titulo?.titulo_de_livro || 'Título não identificado'
      const reader = loan.leitor?.nome_do_leitor || 'Leitor não identificado'

      // Cálculo dinâmico do status do empréstimo:
      // se data_devolucao_real estiver preenchido é "Devolvido"; se atraso for true é "Atrasado"; caso contrário é "Emprestado"
      let loanStatus = 'Emprestado'
      if (loan.data_devolucao_real) {
        loanStatus = 'Devolvido'
      } else if (loan.atraso) {
        loanStatus = 'Atrasado'
      }

      const colecaoLivro =
        loan.exemplar?.titulo?.colecao ||
        (loan.id_exemplar?.toUpperCase().startsWith('DIR-') ? 'diretoria' : 'geral')

      movimentacoes.push({
        id: `loan-${loan.id_emprestimo}`,
        tipo_registro: 'Empréstimo',
        data_evento: loan.data_emprestimo,
        titulo_livro: bookTitle,
        id_exemplar: loan.id_exemplar,
        leitor_nome: reader,
        status: loanStatus,
        detalhes: loan.data_devolucao_real
          ? `Devolvido em ${formatDate(loan.data_devolucao_real)}`
          : `Previsão: ${loan.data_prevista_devolucao ? formatDate(loan.data_prevista_devolucao) : '-'}`,
        colecao: colecaoLivro,
      })
    })

    ;(reservasData || []).forEach((res: any) => {
      const bookTitle = res.titulo?.titulo_de_livro || 'Título não identificado'
      const reader = res.leitor?.nome_do_leitor || 'Leitor não identificado'
      const colecaoLivro =
        res.titulo?.colecao ||
        (res.id_titulo?.toUpperCase().startsWith('DIR-') ? 'diretoria' : 'geral')

      movimentacoes.push({
        id: `res-${res.id_reserva}`,
        tipo_registro: 'Reserva',
        data_evento: res.data_reserva,
        titulo_livro: bookTitle,
        id_exemplar: null,
        leitor_nome: reader,
        status: res.status_reserva || 'Ativa',
        detalhes: res.data_atendimento
          ? `Atendida em ${formatDate(res.data_atendimento)}`
          : `Status: ${res.status_reserva || 'Ativa'}`,
        colecao: colecaoLivro,
      })
    })

    movimentacoes.sort(
      (a, b) => new Date(b.data_evento).getTime() - new Date(a.data_evento).getTime(),
    )

    return movimentacoes
  },
}
