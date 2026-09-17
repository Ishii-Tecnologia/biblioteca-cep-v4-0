import { supabase } from '@/lib/supabase/client'

/**
 * Lista curada e abrangente de domínios conhecidos de e-mails descartáveis/temporários.
 * Cobre os serviços mais frequentes (mailinator, 10minutemail, guerrillamail, yopmail, temp-mail,
 * throwawaymail, dispostable, maildrop, getnada, trashmail, sharklasers, grr.la, mailnesia, fakeinbox,
 * mintemail, spambog, mytemp.email e variações).
 */
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  // Mailinator & aliases
  'mailinator.com',
  'mailinater.com',
  'suremail.info',
  'spamherelots.com',
  'binkmail.com',
  'safetymail.info',
  'mailin8r.com',
  'chammy.info',
  'tradermail.info',
  'veryrealemail.com',
  'notmailinator.com',
  'reconmail.com',

  // Guerrilla Mail & aliases
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.biz',
  'guerrillamail.org',
  'guerrillamail.info',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  'pokemail.net',
  'spam4.me',

  // 10 Minute Mail & clones
  '10minutemail.com',
  '10minutemail.net',
  '10minutemail.org',
  '10minutemail.co.uk',
  '10minemail.com',
  '10minutemailbox.com',
  'minuteinbox.com',
  'tempmail.net',
  'tempmail.com',
  'temp-mail.org',
  'temp-mail.io',
  'tempmailo.com',
  'temp-mail.ru',
  'mytemp.email',
  'disposablemail.com',

  // Yopmail & aliases
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'cool.fr.nf',
  'courriel.fr.nf',
  'moncourrier.fr.nf',
  'monemail.fr.nf',
  'monmail.fr.nf',
  'hide.biz.st',
  'mytrashmail.com',

  // Trashmail & aliases
  'trashmail.com',
  'trashmail.net',
  'trashmail.me',
  'trashmail.at',
  'trashmail.io',
  'trashmail.org',
  'rcpt.at',
  'damnthespam.com',
  'wegwerfmail.de',
  'wegwerfmail.net',
  'wegwerfmail.org',

  // Maildrop, Getnada, Throwawaymail, Dispostable
  'maildrop.cc',
  'dispostable.com',
  'throwawaymail.com',
  'getnada.com',
  'abav.net',
  'givmail.com',
  'inboxbear.com',
  'dropmail.me',
  'emailondeck.com',
  'fakeinbox.com',
  'fakemailgenerator.com',
  'crazymailing.com',
  'mohmal.com',
  'mohmal.in',
  'mailnesia.com',
  'mintemail.com',
  'spambog.com',
  'spambog.de',
  'spambog.ru',
  'burnermail.io',
  'inboxkitten.com',
  'tempinbox.com',
  'generator.email',
  'guerrillamail.de',
  'throwawayemailaddresses.com',
  'fakemail.net',
  'disposable.me',
  'chacuo.net',
  '0815.ru',
  'zetmail.com',
  'harakirimail.com',
  'mailcatch.com',
  'tmail.io',
  'tmail.link',
  'tempail.com',
  'emailfake.com',
  'crazymail.com',
  'nada.ltd',
  'nada.email',
  'getairmail.com',
  'jetable.org',
  'kasmail.com',
  'mailexpire.com',
  'mailforspam.com',
  'mailmoat.com',
  'mailnull.com',
  'mailscrap.com',
  'mailslurp.com',
  'meltmail.com',
  'no-spam.ws',
  'nospam.ze.tc',
  'nospam4.us',
  'pookmail.com',
  'shortmail.net',
  'soodonims.com',
  'spambox.us',
  'spamfree24.org',
  'spamgourmet.com',
  'spamhole.com',
  'spaml.com',
  'tempmailer.com',
  'trashymail.com',
  'whyspam.me',
  'zoemail.org',
])

export interface EmailDomainValidationResult {
  valid: boolean
  isFormatValid: boolean
  isDisposable: boolean
  isDomainValid: boolean
  status: 'valid' | 'invalid_format' | 'disposable' | 'invalid_domain' | 'pending' | 'idle'
  message?: string
  domain?: string
}

// Cache local no navegador para evitar reconsultas à Edge Function durante a sessão
const clientDnsCache = new Map<string, { valid: boolean; reason?: string; timestamp: number }>()
const CLIENT_DNS_TTL_MS = 24 * 60 * 60 * 1000 // 24 horas

export const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Extrai o domínio de um endereço de e-mail.
 */
export function extractEmailDomain(email: string): string {
  const clean = email.trim().toLowerCase()
  const parts = clean.split('@')
  if (parts.length === 2) {
    return parts[1].trim()
  }
  return ''
}

/**
 * Valida o formato sintático do e-mail.
 */
export function isValidEmailFormat(email: string): boolean {
  const clean = email.trim()
  if (!clean || clean.length < 5 || clean.length > 254) return false
  return EMAIL_FORMAT_REGEX.test(clean)
}

/**
 * Verifica se o domínio é de um provedor temporário/descartável.
 */
export function isDisposableEmailDomain(domain: string): boolean {
  const clean = domain.trim().toLowerCase().replace(/^@/, '')
  if (!clean) return false

  if (DISPOSABLE_EMAIL_DOMAINS.has(clean)) return true

  // Checar variações de subdomínio (ex: abc.mailinator.com)
  const parts = clean.split('.')
  if (parts.length > 2) {
    const parentDomain = parts.slice(1).join('.')
    if (DISPOSABLE_EMAIL_DOMAINS.has(parentDomain)) return true
  }

  // Checagem de palavras-chave características de descarte no domínio
  const disposableKeywords = [
    'tempmail',
    'disposable',
    'throwaway',
    'fakeinbox',
    'guerrillamail',
    'mailinator',
    '10minutemail',
    'trashmail',
    'yopmail',
    'mytemp',
    'spambog',
    'mohmal',
  ]
  const domainNameOnly = parts[0]
  for (const kw of disposableKeywords) {
    if (domainNameOnly === kw || clean.startsWith(`${kw}.`)) {
      return true
    }
  }

  return false
}

/**
 * Validação síncrona preliminar (formato e descarte).
 * Retorna de imediato se o e-mail for inválido por formato ou descarte.
 */
export function validateEmailBasic(email: string): EmailDomainValidationResult {
  const clean = email.trim().toLowerCase()
  if (!clean) {
    return {
      valid: false,
      isFormatValid: false,
      isDisposable: false,
      isDomainValid: false,
      status: 'idle',
      message: undefined,
    }
  }

  if (!isValidEmailFormat(clean)) {
    return {
      valid: false,
      isFormatValid: false,
      isDisposable: false,
      isDomainValid: false,
      status: 'invalid_format',
      message: 'Formato de e-mail inválido. Ex.: nome@exemplo.com',
    }
  }

  const domain = extractEmailDomain(clean)
  if (isDisposableEmailDomain(domain)) {
    return {
      valid: false,
      isFormatValid: true,
      isDisposable: true,
      isDomainValid: false,
      domain,
      status: 'disposable',
      message:
        'Este e-mail parece ser temporário/descartável. Use um e-mail permanente (ex.: Gmail, Outlook).',
    }
  }

  return {
    valid: true,
    isFormatValid: true,
    isDisposable: false,
    isDomainValid: true,
    domain,
    status: 'valid',
  }
}

/**
 * Validação completa (formato + bloqueio temporário + consulta de DNS/MX via Edge Function).
 * Em caso de falha de conexão/timeout com a Edge Function, o comportamento é fail-open
 * para não prejudicar cadastros legítimos.
 */
export async function validateEmailDomainOnline(
  email: string,
): Promise<EmailDomainValidationResult> {
  const basic = validateEmailBasic(email)
  if (!basic.isFormatValid || basic.isDisposable) {
    return basic
  }

  const domain = basic.domain || extractEmailDomain(email)
  if (!domain) {
    return {
      valid: false,
      isFormatValid: false,
      isDisposable: false,
      isDomainValid: false,
      status: 'invalid_format',
      message: 'Domínio do e-mail não encontrado.',
    }
  }

  // Checar cache em memória do cliente
  const now = Date.now()
  const cached = clientDnsCache.get(domain)
  if (cached && now - cached.timestamp < CLIENT_DNS_TTL_MS) {
    if (!cached.valid) {
      return {
        valid: false,
        isFormatValid: true,
        isDisposable: false,
        isDomainValid: false,
        domain,
        status: 'invalid_domain',
        message:
          cached.reason ||
          `O domínio "@${domain}" não pode receber e-mails (sem registros MX/DNS válidos).`,
      }
    }
    return {
      valid: true,
      isFormatValid: true,
      isDisposable: false,
      isDomainValid: true,
      domain,
      status: 'valid',
    }
  }

  try {
    // Invocar Edge Function com timeout estrito no client (4s)
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      setTimeout(() => resolve({ data: null, error: { message: 'DNS_CLIENT_TIMEOUT' } }), 4000)
    })

    const fetchPromise = supabase.functions.invoke('validate-email-domain', {
      body: { domain, email: email.trim().toLowerCase() },
    })

    const { data, error } = await Promise.race([fetchPromise, timeoutPromise])

    if (error) {
      console.warn(
        `[email-validation] Aviso ao checar domínio via Edge Function (${domain}):`,
        error.message,
      )
      // Fail-open: aceita o e-mail com aviso silencioso se timeout/erro
      return {
        valid: true,
        isFormatValid: true,
        isDisposable: false,
        isDomainValid: true,
        domain,
        status: 'valid',
      }
    }

    if (data && typeof data.valid === 'boolean') {
      // Salva no cache do cliente
      clientDnsCache.set(domain, {
        valid: data.valid,
        reason: data.reason,
        timestamp: now,
      })

      if (!data.valid) {
        return {
          valid: false,
          isFormatValid: true,
          isDisposable: false,
          isDomainValid: false,
          domain,
          status: 'invalid_domain',
          message:
            data.reason ||
            `O domínio "@${domain}" não possui registros de e-mail válidos (sem registros MX). Verifique se digitou corretamente.`,
        }
      }

      return {
        valid: true,
        isFormatValid: true,
        isDisposable: false,
        isDomainValid: true,
        domain,
        status: 'valid',
      }
    }

    // Retorno inesperado da Edge Function: fail-open
    return {
      valid: true,
      isFormatValid: true,
      isDisposable: false,
      isDomainValid: true,
      domain,
      status: 'valid',
    }
  } catch (err: any) {
    console.warn(`[email-validation] Erro ao validar domínio de ${domain}:`, err)
    // Fail-open
    return {
      valid: true,
      isFormatValid: true,
      isDisposable: false,
      isDomainValid: true,
      domain,
      status: 'valid',
    }
  }
}
