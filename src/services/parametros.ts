import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/lib/supabase/types'

export type Parametro = Tables<'parametros'>

export async function getPrazoEmprestimoDias(): Promise<number> {
  const { data } = await supabase
    .from('parametros')
    .select('valor')
    .eq('chave', 'prazo_emprestimo_dias')
    .maybeSingle()
  return data ? parseInt(data.valor) : 15
}

export async function getPrazoRenovacaoDias(): Promise<number> {
  const { data } = await supabase
    .from('parametros')
    .select('valor')
    .eq('chave', 'prazo_renovacao_dias')
    .maybeSingle()
  return data ? parseInt(data.valor) : 15
}

export async function getMaxRenovacoes(): Promise<number> {
  const { data } = await supabase
    .from('parametros')
    .select('valor')
    .eq('chave', 'max_renovacoes')
    .maybeSingle()
  return data ? parseInt(data.valor) : 1
}

export async function getTempoReservaGarantidaHoras(): Promise<number> {
  const { data } = await supabase
    .from('parametros')
    .select('valor')
    .eq('chave', 'tempo_reserva_garantida_horas')
    .maybeSingle()
  return data ? parseInt(data.valor, 10) : 24
}

export async function getCsvSeparador(): Promise<string> {
  const { data } = await supabase
    .from('parametros')
    .select('valor')
    .eq('chave', 'csv_separador')
    .maybeSingle()
  return data?.valor === ',' ? ',' : ';'
}

export async function getPrazoRetiradaDiasUteis(): Promise<number> {
  const { data } = await supabase
    .from('parametros')
    .select('valor')
    .eq('chave', 'prazo_retirada_dias_uteis')
    .maybeSingle()
  return data ? parseInt(data.valor, 10) : 7
}

export async function getLimiteMaximoFilaEspera(): Promise<number> {
  const { data } = await supabase
    .from('parametros')
    .select('valor')
    .eq('chave', 'limite_maximo_fila_espera')
    .maybeSingle()
  return data ? parseInt(data.valor, 10) : 3
}

export async function getEmailLiberacaoTemplates(): Promise<{
  titulo: string
  mensagem: string
}> {
  const { data } = await supabase
    .from('parametros')
    .select('chave, valor')
    .in('chave', ['email_liberacao_titulo', 'email_liberacao_mensagem'])

  let titulo = 'Livro {titulo_do_livro} liberado para empréstimo.'
  let mensagem =
    'O livro {titulo_do_livro} está liberado para empréstimo. Você tem o prazo de 7 dias úteis para a retirada. Procure a Biblioteca para realizar o empréstimo. Obrigado! CEP'

  if (data) {
    for (const item of data) {
      if (item.chave === 'email_liberacao_titulo' && item.valor) {
        titulo = item.valor
      }
      if (item.chave === 'email_liberacao_mensagem' && item.valor) {
        mensagem = item.valor
      }
    }
  }

  return { titulo, mensagem }
}

export const ParametrosService = {
  async getAll() {
    const { data, error } = await supabase.from('parametros').select('*')

    if (error) throw error
    return data
  },

  async getByName(name: string, defaultValue: string): Promise<string> {
    const { data } = await supabase
      .from('parametros')
      .select('valor')
      .eq('chave', name)
      .maybeSingle()

    return data?.valor || defaultValue
  },

  async updateParam(chave: string, valor: string, descricao?: string) {
    const { data, error } = await supabase
      .from('parametros')
      .upsert(
        {
          chave,
          valor,
          ...(descricao ? { descricao } : {}),
        },
        { onConflict: 'chave' },
      )
      .select()
      .single()

    if (error) throw error
    return data
  },

  async checkOverdueRoutine() {
    try {
      const { data, error } = await supabase.rpc('verificar_atrasos_geral')
      if (error) console.error('Erro na rotina de verificação de atrasos:', error)

      // Executar também a checagem de expiração de prazos de retirada de reservas
      try {
        const { ReservasService } = await import('./reservas')
        await ReservasService.checkAndExpirePickupDeadlines('Rotina Automática')
      } catch (resErr) {
        console.warn('Erro ao checar expiração de reservas na rotina:', resErr)
      }

      return data
    } catch (e) {
      console.error('Erro ao chamar verificar_atrasos_geral:', e)
      return 0
    }
  },
}
