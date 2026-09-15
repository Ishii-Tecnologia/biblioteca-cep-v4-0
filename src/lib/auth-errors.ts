/**
 * Helper para detecção e mensagens amigáveis de Rate Limit (HTTP 429) no envio de e-mails do Supabase Auth.
 */

export const RATE_LIMIT_USER_MESSAGE =
  'Você já enviou um e-mail para este leitor recentemente. Aguarde alguns minutos antes de reenviar.'

export const RATE_LIMIT_WINDOW_SECONDS = 60 // 60 segundos de cooldown entre reenvios

/**
 * Detecta se um erro retornado pelo Supabase Auth é de limite de taxa/rate limit (429 / "rate limit").
 */
export function isRateLimitError(error: any): boolean {
  if (!error) return false

  const status = error.status || error.statusCode || error.code
  if (status === 429 || status === '429' || status === 'over_email_send_rate_limit') {
    return true
  }

  const msg = String(error.message || error.error_description || error || '').toLowerCase()
  return (
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests') ||
    msg.includes('email rate limit exceeded') ||
    msg.includes('over_email_send_rate_limit') ||
    msg.includes('muitas requisições')
  )
}

/**
 * Retorna mensagem amigável caso seja rate limit, ou a mensagem original de erro.
 */
export function getFriendlyAuthErrorMessage(
  error: any,
  fallback = 'Falha ao processar solicitação.',
): string {
  if (isRateLimitError(error)) {
    return RATE_LIMIT_USER_MESSAGE
  }
  return (
    error?.message || error?.error_description || (typeof error === 'string' ? error : fallback)
  )
}

/**
 * Calcula quantos segundos restam de espera com base na data do último envio.
 * Retorna 0 se o cooldown já tiver expirado ou se não houver envio registrado.
 */
export function getRemainingCooldownSeconds(
  lastSentAt: string | Date | null | undefined,
  cooldownWindowSeconds = RATE_LIMIT_WINDOW_SECONDS,
): number {
  if (!lastSentAt) return 0
  const lastTime = new Date(lastSentAt).getTime()
  if (isNaN(lastTime)) return 0

  const now = Date.now()
  const elapsedSeconds = Math.floor((now - lastTime) / 1000)
  const remaining = cooldownWindowSeconds - elapsedSeconds

  return remaining > 0 ? remaining : 0
}
