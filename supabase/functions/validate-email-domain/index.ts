import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'

interface DomainValidationCacheEntry {
  valid: boolean
  reason?: string
  expiresAt: number
}

// Cache em memória (TTL: 24 horas)
const domainCache = new Map<string, DomainValidationCacheEntry>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 horas
const DNS_TIMEOUT_MS = 3500 // 3.5 segundos de timeout

function cleanExpiredCache(): void {
  const now = Date.now()
  for (const [key, entry] of domainCache.entries()) {
    if (entry.expiresAt < now) {
      domainCache.delete(key)
    }
  }
}

/**
 * Resolve DNS com timeout estrito.
 * Se o timeout estourar ou ocorrer erro de rede desconhecido, lança para tratamento fail-open.
 */
async function resolveDnsWithTimeout(
  domain: string,
  recordType: 'MX' | 'A' | 'AAAA',
  timeoutMs: number,
): Promise<any[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const promise = (Deno as any).resolveDns(domain, recordType)
    const timeoutPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(
          new Error(
            `DNS_TIMEOUT: Timeout de ${timeoutMs}ms ao resolver ${recordType} para ${domain}`,
          ),
        )
      })
    })

    const result = await Promise.race([promise, timeoutPromise])
    return Array.isArray(result) ? result : []
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido. Utilize POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    let body: any
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Corpo JSON inválido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rawDomain = typeof body?.domain === 'string' ? body.domain : ''
    const rawEmail = typeof body?.email === 'string' ? body.email : ''

    let domain = rawDomain.trim().toLowerCase()
    if (!domain && rawEmail) {
      const parts = rawEmail.trim().toLowerCase().split('@')
      if (parts.length === 2) {
        domain = parts[1]
      }
    }

    // Normalizar removendo caracteres inválidos ou espaços
    domain = domain.replace(/^@/, '').trim()

    if (!domain || domain.length < 3 || !domain.includes('.')) {
      return new Response(
        JSON.stringify({
          valid: false,
          reason: 'Domínio de e-mail inválido ou incompleto.',
          cached: false,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Limpar cache periodicamente se crescer muito
    if (domainCache.size > 2000) {
      cleanExpiredCache()
    }

    // Verificar cache em memória
    const cached = domainCache.get(domain)
    const now = Date.now()
    if (cached && cached.expiresAt > now) {
      return new Response(
        JSON.stringify({
          valid: cached.valid,
          reason: cached.reason,
          domain,
          cached: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 1. Tentar resolver registros MX
    let hasMx = false
    let dnsResolutionFailed = false
    let failReason = ''

    try {
      const mxRecords = await resolveDnsWithTimeout(domain, 'MX', DNS_TIMEOUT_MS)
      if (mxRecords && mxRecords.length > 0) {
        hasMx = true
      }
    } catch (mxErr: any) {
      const msg = mxErr?.message || String(mxErr)
      if (msg.includes('DNS_TIMEOUT') || msg.includes('network') || msg.includes('timed out')) {
        dnsResolutionFailed = true
        failReason = 'timeout'
        console.warn(
          `[validate-email-domain] Timeout/erro de rede ao resolver MX para ${domain}:`,
          msg,
        )
      } else {
        // Erro específico de DNS (ex: NotFound, NameResolution, etc.)
        // Segue para fallback checando registro A
      }
    }

    // 2. Se não encontrou MX e não foi erro de rede/timeout, tentar registros A / AAAA como fallback
    let hasA = false
    if (!hasMx && !dnsResolutionFailed) {
      try {
        const aRecords = await resolveDnsWithTimeout(domain, 'A', DNS_TIMEOUT_MS)
        if (aRecords && aRecords.length > 0) {
          hasA = true
        }
      } catch (aErr: any) {
        const msg = aErr?.message || String(aErr)
        if (msg.includes('DNS_TIMEOUT') || msg.includes('network') || msg.includes('timed out')) {
          dnsResolutionFailed = true
          failReason = 'timeout'
          console.warn(
            `[validate-email-domain] Timeout/erro de rede ao resolver A para ${domain}:`,
            msg,
          )
        }
      }
    }

    // Se houve erro de timeout / falha de rede do servidor DNS:
    // FALHAR ABERTO (fail-open) para não bloquear cadastros legítimos
    if (dnsResolutionFailed) {
      console.warn(
        `[validate-email-domain] Fail-open acionado para ${domain} devido a ${failReason}. Permitindo e-mail.`,
      )
      return new Response(
        JSON.stringify({
          valid: true,
          reason: 'Verificação DNS indisponível no momento. Permitido por tolerância.',
          domain,
          cached: false,
          failOpen: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const isValid = hasMx || hasA
    const responsePayload = {
      valid: isValid,
      reason: isValid
        ? undefined
        : `O domínio "@${domain}" não possui registros de e-mail (MX) válidos na internet e não pode receber mensagens.`,
      domain,
      cached: false,
    }

    // Salvar no cache com TTL de 24h
    domainCache.set(domain, {
      valid: isValid,
      reason: responsePayload.reason,
      expiresAt: now + CACHE_TTL_MS,
    })

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[validate-email-domain] Erro inesperado:', err)
    // Fail-open em caso de erro inesperado na Edge Function
    return new Response(
      JSON.stringify({
        valid: true,
        reason: 'Verificação falhou por erro interno. Permitido por tolerância.',
        failOpen: true,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
