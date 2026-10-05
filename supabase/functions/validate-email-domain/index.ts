import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticateCaller, checkRateLimit, extractClientIp } from '../_shared/auth.ts'

interface RequestPayload {
  domain?: string
  email?: string
}

interface DnsRecord {
  name: string
  type: number
  TTL: number
  data: string
}

interface DnsResponse {
  Status: number
  TC: boolean
  RD: boolean
  RA: boolean
  AD: boolean
  CD: boolean
  Question?: Array<{ name: string; type: number }>
  Answer?: DnsRecord[]
  Authority?: DnsRecord[]
  Comment?: string
}

const COMMON_FREE_PROVIDERS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.com.br',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'uol.com.br',
  'bol.com.br',
  'terra.com.br',
  'ig.com.br',
])

const DISPOSABLE_PATTERNS = [
  'tempmail',
  'guerrillamail',
  '10minutemail',
  'mailinator',
  'throwaway',
  'yopmail',
  'sharklasers',
  'dispostable',
  'trashmail',
  'getairmail',
  'crazymailing',
  'mytempemail',
]

function extractDomain(input: string): string {
  const clean = input.trim().toLowerCase()
  if (clean.includes('@')) {
    const parts = clean.split('@')
    return parts[parts.length - 1].trim()
  }
  return clean
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .trim()
}

async function queryDnsOverHttps(name: string, type: string): Promise<DnsResponse | null> {
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
  ]

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: 'application/dns-json',
          'user-agent': 'cep-library-validator/1.0',
        },
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) {
        return (await res.json()) as DnsResponse
      }
    } catch {
      // Tenta próximo endpoint
    }
  }
  return null
}

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Blindagem OWASP: Exigir token de usuário autenticado
    // Esta função é chamada no cadastro de leitores e usuários (portanto exige usuário autenticado no sistema)
    const authResult = await authenticateCaller(req, {
      requireStaff: false, // aceita qualquer usuário com conta ativa autenticada
      requireAdmin: false,
    })

    if ('response' in authResult) {
      return authResult.response
    }

    const { caller } = authResult

    // 2. Rate Limiting: máx. 30 consultas por minuto por usuário / IP
    const clientIp = extractClientIp(req)
    const rateKey = `validate_email_domain:${caller.userId}:${clientIp}`
    const rateCheck = checkRateLimit(rateKey, 30, 60_000)

    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          valid: true,
          reachable: true,
          error: 'Limite de validações de e-mail excedido temporariamente.',
          code: 'TOO_MANY_REQUESTS',
          retryAfterSeconds: rateCheck.resetInSeconds,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(rateCheck.resetInSeconds),
          },
        },
      )
    }

    const body: RequestPayload = await req.json().catch(() => ({}))
    const rawInput = body.domain || body.email || ''

    if (!rawInput) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'Nenhum domínio ou e-mail fornecido.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const domain = extractDomain(rawInput)

    const domainRegex =
      /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i
    if (!domain || !domainRegex.test(domain) || domain.length > 253) {
      return new Response(
        JSON.stringify({
          valid: false,
          domain,
          reachable: false,
          mxFound: false,
          aFound: false,
          disposable: false,
          isCommonProvider: false,
          reason: 'Formato de domínio inválido.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const isDisposable = DISPOSABLE_PATTERNS.some((pattern) => domain.includes(pattern))
    if (isDisposable) {
      return new Response(
        JSON.stringify({
          valid: false,
          domain,
          reachable: false,
          mxFound: false,
          aFound: false,
          disposable: true,
          isCommonProvider: false,
          reason: 'Domínio descartável / temporário não permitido.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const isCommon = COMMON_FREE_PROVIDERS.has(domain)
    if (isCommon) {
      return new Response(
        JSON.stringify({
          valid: true,
          domain,
          reachable: true,
          mxFound: true,
          aFound: true,
          disposable: false,
          isCommonProvider: true,
          details: 'Provedor conhecido e confiável.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Consulta registros MX (type 15)
    const mxResp = await queryDnsOverHttps(domain, 'MX')
    const hasMx = Boolean(
      mxResp && mxResp.Status === 0 && mxResp.Answer && mxResp.Answer.length > 0,
    )

    // Se não encontrou MX, consulta registro A (type 1)
    let hasA = false
    if (!hasMx) {
      const aResp = await queryDnsOverHttps(domain, 'A')
      hasA = Boolean(aResp && aResp.Status === 0 && aResp.Answer && aResp.Answer.length > 0)
    }

    const domainExists = hasMx || hasA

    return new Response(
      JSON.stringify({
        valid: domainExists,
        domain,
        reachable: domainExists,
        mxFound: hasMx,
        aFound: hasA,
        disposable: false,
        isCommonProvider: false,
        reason: domainExists
          ? 'Domínio ativo com registros DNS válidos.'
          : 'Domínio não possui servidores de e-mail (MX) ou registro de host (A).',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        valid: true, // Fail-open para não travar formulário de cadastro em caso de instabilidade DNS
        reachable: true,
        error: err.message,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
