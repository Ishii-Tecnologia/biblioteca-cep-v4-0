import { supabase } from '@/lib/supabase/client'

export interface AuditoriaTransicao {
  id: number
  entidade: string
  registro_id: string
  estado_anterior?: string | null
  estado_novo: string
  operador_id?: string | null
  operador_nome?: string | null
  motivo?: string | null
  payload?: any
  created_at: string
}

export const AuditoriaTransicoesService = {
  async getAll(
    entidade?: string,
    registroId?: string,
    limit: number = 100,
  ): Promise<AuditoriaTransicao[]> {
    let query = supabase
      .from('auditoria_transicoes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (entidade && entidade !== 'all') {
      query = query.eq('entidade', entidade)
    }

    if (registroId) {
      query = query.eq('registro_id', registroId)
    }

    const { data, error } = await query
    if (error) throw error
    return (data as AuditoriaTransicao[]) || []
  },

  async registrar(
    entidade: string,
    registroId: string,
    estadoAnterior: string | null,
    estadoNovo: string,
    operadorNome: string = 'Sistema',
    motivo?: string,
    payload?: any,
  ): Promise<void> {
    const { error } = await supabase.from('auditoria_transicoes').insert({
      entidade,
      registro_id: String(registroId),
      estado_anterior: estadoAnterior,
      estado_novo: estadoNovo,
      operador_nome: operadorNome,
      motivo: motivo || null,
      payload: payload || null,
    })

    if (error) console.warn('Erro ao registrar transição de estado:', error)
  },
}
