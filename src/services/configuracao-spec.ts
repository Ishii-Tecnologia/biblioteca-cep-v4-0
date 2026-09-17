import { supabase } from '@/lib/supabase/client'

export interface ConfiguracaoParam {
  chave: string
  valor: string
  descricao?: string | null
  updated_at?: string
}

export const ConfiguracoesSpecService = {
  async getAll(): Promise<ConfiguracaoParam[]> {
    const { data, error } = await supabase
      .from('configuracao')
      .select('*')
      .order('chave', { ascending: true })

    if (error) throw error
    return (data as ConfiguracaoParam[]) || []
  },

  async getMap(): Promise<Record<string, string>> {
    const list = await this.getAll()
    const map: Record<string, string> = {}
    list.forEach((c) => {
      map[c.chave] = c.valor
    })
    return map
  },

  async get(chave: string, defaultValue: string = ''): Promise<string> {
    const { data, error } = await supabase
      .from('configuracao')
      .select('valor')
      .eq('chave', chave)
      .maybeSingle()

    if (error || !data) return defaultValue
    return data.valor
  },

  async set(chave: string, valor: string, descricao?: string): Promise<void> {
    const { error } = await supabase.from('configuracao').upsert({
      chave,
      valor,
      ...(descricao !== undefined ? { descricao } : {}),
      updated_at: new Date().toISOString(),
    })

    if (error) throw error
  },

  async setBatch(params: Record<string, string>): Promise<void> {
    const entries = Object.entries(params).map(([chave, valor]) => ({
      chave,
      valor,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase.from('configuracao').upsert(entries)
    if (error) throw error
  },

  async getPrazoRetiradaDiasUteis(): Promise<number> {
    const val = await this.get('PRAZO_RETIRADA_DIAS_UTEIS', '4')
    return parseInt(val, 10) || 4
  },

  async getLimiteFilaReservas(): Promise<number> {
    const val = await this.get('LIMITE_FILA_RESERVAS', '2')
    return parseInt(val, 10) || 2
  },

  async getLimiteEmprestimosLeitor(): Promise<number> {
    const val = await this.get('LIMITE_EMPRESTIMOS_LEITOR', '4')
    return parseInt(val, 10) || 4
  },

  async getLimiteReservasLeitor(): Promise<number> {
    const val = await this.get('LIMITE_RESERVAS_LEITOR', '4')
    return parseInt(val, 10) || 4
  },
}
