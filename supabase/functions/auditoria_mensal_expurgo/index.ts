import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  authenticateCaller,
  checkRateLimit,
  extractClientIp,
  logTransicaoAuditoria,
} from '../_shared/auth.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let chamadorInfo = 'serviço agendado ou invocação interna'

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          error: 'Configuração do servidor ausente (SUPABASE_URL / SERVICE_ROLE_KEY)',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Blindagem OWASP: Exigir autorização.
    // Aceita token de cron/service-role (quando executado agendado mensalmente via pg_cron)
    // OU JWT de administrador (quando disparado manualmente pelo painel de Auditoria em Configurações)
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    const token = match ? match[1].trim() : ''

    const cronSecret = Deno.env.get('CRON_SECRET') || ''
    const isCronAuthorized =
      (cronSecret && token === cronSecret) || (supabaseServiceKey && token === supabaseServiceKey)

    let callerUser: any = null

    if (!isCronAuthorized) {
      // Disparo manual: EXCLUSIVO do Administrador
      const authResult = await authenticateCaller(req, {
        requireStaff: true,
        requireAdmin: true,
      })

      if ('response' in authResult) {
        return authResult.response
      }

      callerUser = authResult.caller
      chamadorInfo = `Administrador ${callerUser.nome || callerUser.email}`

      // Rate limit: máx 3 execuções manuais por minuto
      const clientIp = extractClientIp(req)
      const rateKey = `auditoria_mensal_expurgo:${callerUser.userId}:${clientIp}`
      const rateCheck = checkRateLimit(rateKey, 3, 60_000)
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: `Muitas solicitações de expurgo de auditoria. Aguarde ${rateCheck.resetInSeconds} segundos.`,
            code: 'TOO_MANY_REQUESTS',
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    } else {
      chamadorInfo = 'Rotina agendada mensal (Cron / Service Role)'
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Executa a procedure de banco que expurga registros antigos conforme política LGPD
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'executar_auditoria_mensal_expurgo',
    )

    if (rpcError) {
      console.error('Erro ao executar executar_auditoria_mensal_expurgo:', rpcError)
      return new Response(
        JSON.stringify({
          error: 'Falha ao executar rotina de expurgo de auditoria no banco.',
          details: rpcError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const elapsed = Date.now() - startTime

    // Registrar o evento de expurgo em auditoria_transicoes
    await logTransicaoAuditoria({
      supabaseAdmin: supabase,
      entidade: 'auditoria_expurgo',
      registroId: new Date().toISOString(),
      estadoAnterior: null,
      estadoNovo: 'concluido',
      operadorId: callerUser?.userId || null,
      operadorNome: callerUser?.nome || chamadorInfo,
      motivo: `Execução do expurgo mensal de dados de auditoria (${chamadorInfo})`,
      payload: {
        resultado: rpcResult,
        duracao_ms: elapsed,
        chamador: chamadorInfo,
      },
    })

    return new Response(
      JSON.stringify({
        success: true,
        duracao_ms: elapsed,
        resultado: rpcResult,
        executado_por: chamadorInfo,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno na função auditoria_mensal_expurgo.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
