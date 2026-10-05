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
    // Aceita Authorization Bearer token de usuário staff (quando disparado manualmente pelo painel)
    // OU token de cron/service-role (quando executado via pg_cron / webhook do sistema)
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    const token = match ? match[1].trim() : ''

    const cronSecret = Deno.env.get('CRON_SECRET') || ''
    const isCronAuthorized =
      (cronSecret && token === cronSecret) || (supabaseServiceKey && token === supabaseServiceKey)

    let callerUser: any = null

    if (!isCronAuthorized) {
      // Exige autenticação de staff se não for cron token
      const authResult = await authenticateCaller(req, {
        requireStaff: true,
        requireAdmin: false,
      })

      if ('response' in authResult) {
        return authResult.response
      }

      callerUser = authResult.caller
      chamadorInfo = `Operador ${callerUser.nome || callerUser.email} (${callerUser.papel})`

      // Rate limit: máx 5 chamadas manuais por minuto
      const clientIp = extractClientIp(req)
      const rateKey = `process_expirations:${callerUser.userId}:${clientIp}`
      const rateCheck = checkRateLimit(rateKey, 5, 60_000)
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: `Muitas execuções manuais de expiração. Aguarde ${rateCheck.resetInSeconds} segundos.`,
            code: 'TOO_MANY_REQUESTS',
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    } else {
      chamadorInfo = 'Rotina agendada (Cron / Service Role)'
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Chama a RPC de banco que processa pré-reservas e reservas expiradas
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'processar_expiracoes_automaticas',
    )

    if (rpcError) {
      console.error('Erro ao executar processar_expiracoes_automaticas:', rpcError)
      return new Response(
        JSON.stringify({
          error: 'Falha ao processar expirações automáticas no banco.',
          details: rpcError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const elapsed = Date.now() - startTime

    // Registrar em auditoria
    await logTransicaoAuditoria({
      supabaseAdmin: supabase,
      entidade: 'expiracoes_automaticas',
      registroId: new Date().toISOString(),
      estadoAnterior: null,
      estadoNovo: 'executado',
      operadorId: callerUser?.userId || null,
      operadorNome: callerUser?.nome || chamadorInfo,
      motivo: `Execução da rotina de expirações de reservas e pré-reservas (${chamadorInfo})`,
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
      JSON.stringify({ error: err.message || 'Erro interno na função process-expirations.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
