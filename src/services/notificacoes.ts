import { supabase } from '@/lib/supabase/client'
import { HistoricoService } from './historico'
import { getEmailLiberacaoTemplates, getPrazoRetiradaDiasUteis } from './parametros'
import { formatDateBR } from '@/lib/utils'

export interface NotificacaoResult {
  success: boolean
  message: string
  provider: 'resend' | 'smtp' | 'simulado'
  destinatario: string
  assunto: string
  corpo: string
}

export const NotificacaoService = {
  /**
   * Interpola variáveis no template do e-mail de liberação de livro:
   * {titulo_do_livro}, {nome_do_leitor}, {prazo_retirada_dias_uteis}, {data_limite_retirada}
   */
  interpolate(
    template: string,
    vars: {
      titulo_do_livro: string
      nome_do_leitor?: string
      prazo_retirada_dias_uteis?: number | string
      data_limite_retirada?: string
    },
  ): string {
    let res = template
    const dict: Record<string, string> = {
      titulo_do_livro: vars.titulo_do_livro || '',
      nome_do_leitor: vars.nome_do_leitor || 'Leitor',
      prazo_retirada_dias_uteis: String(vars.prazo_retirada_dias_uteis ?? 7),
      data_limite_retirada: vars.data_limite_retirada || '',
    }

    for (const [key, value] of Object.entries(dict)) {
      const reg = new RegExp(`\\{${key}\\}`, 'gi')
      res = res.replace(reg, value)
    }

    return res
  },

  /**
   * Dispara a notificação de liberação de livro para retirada ao leitor.
   * Reutiliza a infraestrutura existente de envio (via Edge Function auditoria_mensal_expurgo
   * ou fallback seguro/simulado). Registra o evento no histórico do sistema.
   */
  async notificarLiberacaoLivro({
    id_reserva,
    leitorNome,
    leitorEmail,
    tituloLivro,
    dataLimiteRetirada,
    idExemplar,
    operatorName = 'Sistema',
    motivoEvento,
  }: {
    id_reserva: number
    leitorNome: string
    leitorEmail: string
    tituloLivro: string
    dataLimiteRetirada: Date
    idExemplar?: string
    operatorName?: string
    motivoEvento?: string
  }): Promise<NotificacaoResult> {
    const templates = await getEmailLiberacaoTemplates()
    const prazoUteis = await getPrazoRetiradaDiasUteis()

    const dataLimiteStr = formatDateBR(dataLimiteRetirada)

    const vars = {
      titulo_do_livro: tituloLivro,
      nome_do_leitor: leitorNome,
      prazo_retirada_dias_uteis: prazoUteis,
      data_limite_retirada: dataLimiteStr,
    }

    const subject = NotificacaoService.interpolate(templates.titulo, vars)
    const body = NotificacaoService.interpolate(templates.mensagem, vars)

    let provider: 'resend' | 'smtp' | 'simulado' = 'simulado'
    let success = true
    let outcomeMessage = `Notificação de retirada enviada com sucesso para ${leitorNome} (${leitorEmail}).`

    // Se houver e-mail válido, tentar disparar via Edge Function de auditoria ou registrar simulação
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!leitorEmail || !emailRegex.test(leitorEmail)) {
      success = false
      outcomeMessage = `Leitor ${leitorNome} não possui e-mail válido cadastrado (${leitorEmail || 'não informado'}).`
    } else {
      try {
        // Tentar invocar Edge Function para disparo real caso configurado
        const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke(
          'auditoria_mensal_expurgo',
          {
            body: {
              action: 'enviar_notificacao_reserva',
              to: [leitorEmail],
              subject,
              body,
            },
          },
        )

        if (!edgeErr && edgeRes && edgeRes.success) {
          provider = edgeRes.provider || 'smtp'
          outcomeMessage = edgeRes.message || outcomeMessage
        } else {
          // Modo simulado transparente (provedor simulado conforme regras da biblioteca)
          provider = 'simulado'
          outcomeMessage = `[Modo Simulado / Registro] E-mail de liberação preparado para ${leitorEmail}: "${subject}". Prazo de retirada: até ${dataLimiteStr} (${prazoUteis} dias úteis).`
        }
      } catch (err: any) {
        provider = 'simulado'
        outcomeMessage = `[Modo Simulado] E-mail de liberação registrado para ${leitorEmail}: "${subject}".`
      }
    }

    // Registrar no histórico da biblioteca
    try {
      await HistoricoService.log(
        idExemplar || `reserva_${id_reserva}`,
        'Notificação de Retirada',
        undefined,
        `Notificação de livro liberado (Reserva #${id_reserva}) enviada para ${leitorNome} (${leitorEmail}). Obra: "${tituloLivro}". Prazo para retirada: ${prazoUteis} dias úteis (até ${dataLimiteStr}). Modo: ${provider}.`,
        operatorName,
        idExemplar ? 'exemplar' : 'titulo',
      )
    } catch (logErr) {
      console.warn('Erro ao registrar histórico de notificação de retirada:', logErr)
    }

    return {
      success,
      message: outcomeMessage,
      provider,
      destinatario: leitorEmail,
      assunto: subject,
      corpo: body,
    }
  },
}
