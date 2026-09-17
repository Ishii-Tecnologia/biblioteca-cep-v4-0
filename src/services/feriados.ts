import { supabase } from '@/lib/supabase/client'

export interface Feriado {
  id: number
  data: string
  descricao: string
  ano?: number
  created_at?: string
}

export interface FeriadoInsert {
  data: string
  descricao: string
}

export const FeriadosService = {
  async getAll(ano?: number): Promise<Feriado[]> {
    let query = supabase.from('feriado').select('*').order('data', { ascending: true })

    if (ano) {
      query = query.gte('data', `${ano}-01-01`).lte('data', `${ano}-12-31`)
    }

    const { data, error } = await query
    if (error) throw error
    return (data as Feriado[]) || []
  },

  async create(feriado: FeriadoInsert): Promise<Feriado> {
    const { data, error } = await supabase
      .from('feriado')
      .insert({
        data: feriado.data,
        descricao: feriado.descricao.trim(),
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new Error('Já existe um feriado cadastrado para esta data.')
      }
      throw error
    }
    return data as Feriado
  },

  async update(id: number, feriado: Partial<FeriadoInsert>): Promise<Feriado> {
    const { data, error } = await supabase
      .from('feriado')
      .update({
        ...(feriado.data ? { data: feriado.data } : {}),
        ...(feriado.descricao ? { descricao: feriado.descricao.trim() } : {}),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Feriado
  },

  async delete(id: number): Promise<void> {
    const { error } = await supabase.from('feriado').delete().eq('id', id)
    if (error) throw error
  },

  /**
   * Adiciona feriados nacionais padrão para um ano caso ainda não constem
   */
  async seedYearDefaults(ano: number): Promise<number> {
    const defaults = [
      { data: `${ano}-01-01`, descricao: 'Confraternização Universal' },
      { data: `${ano}-04-21`, descricao: 'Tiradentes' },
      { data: `${ano}-05-01`, descricao: 'Dia do Trabalho' },
      { data: `${ano}-09-07`, descricao: 'Independência do Brasil' },
      { data: `${ano}-10-12`, descricao: 'Nossa Senhora Aparecida' },
      { data: `${ano}-11-02`, descricao: 'Finados' },
      { data: `${ano}-11-15`, descricao: 'Proclamação da República' },
      { data: `${ano}-11-20`, descricao: 'Dia da Consciência Negra' },
      { data: `${ano}-12-25`, descricao: 'Natal' },
    ]

    const { data, error } = await supabase
      .from('feriado')
      .upsert(defaults, { onConflict: 'data', ignoreDuplicates: true })
      .select()

    if (error) throw error
    return data?.length || 0
  },
}
