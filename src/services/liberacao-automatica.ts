import { supabase } from '@/lib/supabase/client'

export interface LiberacaoAutomaticaResult {
  success: boolean
  emprestimos_liberados: number
  reservas_expiradas: number
  detalhes?: {
    emprestimos_liberados: number
    reservas_expiradas: number
    tolerancia_dias_uteis: number
  }
}

/**
 * Executa a liberação automática de empréstimos/reservas não retirados
 * (RPC processar_liberacoes_nao_retiradas no banco).
 *
 * Regra: 1 dia útil após a "data limite de retirada" / "Reserva Garantida até"
 * sem retirada → item liberado, exemplar volta a ficar disponível (ou vai para
 * o próximo da fila) e a ocorrência é registrada em public.historico.
 *
 * Disparo: executada no carregamento das telas staff (/emprestimos, /reservas)
 * — o projeto não usa pg_cron. Idempotente: o banco só processa linhas ainda
 * pendentes, então rodar duas vezes não duplica liberação nem log.
 *
 * O throttle por aba evita chamadas repetidas em menos de 5 minutos e que as
 * duas telas disparem a rotina simultaneamente.
 */
const THROTTLE_MS = 5 * 60 * 1000
let lastRunAt = 0

export async function executarLiberacaoAutomatica(
  _operadorNome?: string,
): Promise<LiberacaoAutomaticaResult | null> {
  // Guarda por aba: uma execução a cada 5 minutos, sem concorrência
  const now = Date.now()
  if (now - lastRunAt < THROTTLE_MS) {
    return null
  }
  if (typeof sessionStorage !== 'undefined') {
    if (sessionStorage.getItem('liberacao_automatica_em_execucao') === '1') {
      return null
    }
    sessionStorage.setItem('liberacao_automatica_em_execucao', '1')
  }

  lastRunAt = now

  try {
    const { data, error } = await (supabase.rpc as any)('processar_liberacoes_nao_retiradas', {
      p_operador_nome: 'Sistema (Automático)',
    })

    if (error) {
      console.warn('Erro ao processar liberações automáticas:', error)
      return null
    }

    const res = typeof data === 'string' ? JSON.parse(data) : data
    return res as LiberacaoAutomaticaResult
  } catch (err) {
    console.warn('Erro ao processar liberações automáticas:', err)
    return null
  } finally {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('liberacao_automatica_em_execucao')
    }
  }
}

export const LiberacaoAutomaticaService = {
  processar: executarLiberacaoAutomatica,
}
