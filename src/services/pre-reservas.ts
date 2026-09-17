import { supabase } from '@/lib/supabase/client'

export type PreReservaStatus = 'PENDENTE_VALIDACAO' | 'APROVADO' | 'REJEITADO'

export interface PreReserva {
  id: number
  leitor_id: number
  livro_id: string
  status: PreReservaStatus
  motivo_rejeicao?: string | null
  operador_id?: string | null
  operador_nome?: string | null
  data_validacao?: string | null
  resultado_fluxo?: string | null
  created_at: string
}

export interface PreReservaDetailed extends PreReserva {
  leitor?: {
    id_leitor: number
    nome_do_leitor: string
    email: string
    telefone?: string | null
    status?: string
    bloqueado?: boolean
  }
  livro?: {
    id_titulo: string
    titulo_de_livro: string
    autor: string
    capa_url?: string | null
    categoria?: string | null
    colecao?: string | null
  }
  exemplares_disponiveis?: number
  total_exemplares?: number
  total_fila?: number
}

export const PreReservasService = {
  /**
   * Leitor solicita livro -> cria pré-reserva (PENDENTE_VALIDACAO)
   */
  async solicitar(leitorId: number, livroId: string, solicitanteNome = 'Leitor'): Promise<any> {
    const { data, error } = await supabase.rpc('criar_pre_reserva', {
      p_leitor_id: leitorId,
      p_livro_id: livroId,
      p_operador_nome: solicitanteNome,
    })

    if (error) throw error
    return data
  },

  /**
   * Operador valida: APROVAR ou REJEITAR
   */
  async validar(
    id: number,
    acao: 'APROVAR' | 'REJEITAR',
    motivoRejeicao?: string,
    operadorId?: string,
    operadorNome = 'Operador',
  ): Promise<any> {
    const { data, error } = await supabase.rpc('validar_pre_reserva', {
      p_pre_reserva_id: id,
      p_acao: acao,
      p_motivo_rejeicao: motivoRejeicao || null,
      p_operador_id: operadorId || null,
      p_operador_nome: operadorNome,
    })

    if (error) throw error
    return data
  },

  /**
   * Lista pré-reservas com suporte a filtro de status e leitor
   */
  async getAll(
    status?: PreReservaStatus | 'all',
    leitorId?: number,
  ): Promise<PreReservaDetailed[]> {
    let query = supabase.from('pre_reserva').select('*').order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (leitorId) {
      query = query.eq('leitor_id', leitorId)
    }

    const { data: preReservas, error } = await query
    if (error) throw error

    if (!preReservas || preReservas.length === 0) return []

    const leitorIds = Array.from(new Set(preReservas.map((pr: any) => pr.leitor_id)))
    const livroIds = Array.from(new Set(preReservas.map((pr: any) => pr.livro_id)))

    const [{ data: leitores }, { data: livros }, { data: exemplares }, { data: reservas }] =
      await Promise.all([
        supabase
          .from('leitor')
          .select('id_leitor, nome_do_leitor, email, telefone, status, bloqueado')
          .in('id_leitor', leitorIds),
        supabase
          .from('titulo')
          .select('id_titulo, titulo_de_livro, autor, capa_url, categoria, colecao')
          .in('id_titulo', livroIds),
        supabase.from('exemplar').select('id_titulo, status').in('id_titulo', livroIds),
        supabase
          .from('reserva')
          .select('id_titulo, status_reserva, status')
          .in('id_titulo', livroIds),
      ])

    const leitorMap = new Map<number, any>()
    ;(leitores || []).forEach((l: any) => leitorMap.set(l.id_leitor, l))

    const livroMap = new Map<string, any>()
    ;(livros || []).forEach((lv: any) => livroMap.set(lv.id_titulo, lv))

    const totalExemplaresMap = new Map<string, number>()
    const dispExemplaresMap = new Map<string, number>()
    ;(exemplares || []).forEach((ex: any) => {
      totalExemplaresMap.set(ex.id_titulo, (totalExemplaresMap.get(ex.id_titulo) || 0) + 1)
      const st = (ex.status || '').toUpperCase()
      if (st === 'DISPONIVEL' || st === 'DISPONÍVEL') {
        dispExemplaresMap.set(ex.id_titulo, (dispExemplaresMap.get(ex.id_titulo) || 0) + 1)
      }
    })

    const filaCountMap = new Map<string, number>()
    ;(reservas || []).forEach((r: any) => {
      const st = (r.status || '').toUpperCase()
      const stR = r.status_reserva
      if (st === 'NA_FILA' || st === 'NOTIFICADO' || stR === 'Ativa') {
        filaCountMap.set(r.id_titulo, (filaCountMap.get(r.id_titulo) || 0) + 1)
      }
    })

    return preReservas.map((pr: any) => ({
      ...pr,
      leitor: leitorMap.get(pr.leitor_id),
      livro: livroMap.get(pr.livro_id),
      exemplares_disponiveis: dispExemplaresMap.get(pr.livro_id) || 0,
      total_exemplares: totalExemplaresMap.get(pr.livro_id) || 0,
      total_fila: filaCountMap.get(pr.livro_id) || 0,
    }))
  },

  /**
   * Conta pré-reservas pendentes de validação
   */
  async countPendentes(): Promise<number> {
    const { count, error } = await supabase
      .from('pre_reserva')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'PENDENTE_VALIDACAO')

    if (error) return 0
    return count || 0
  },
}
