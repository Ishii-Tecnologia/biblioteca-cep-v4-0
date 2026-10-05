import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  authenticateCaller,
  checkRateLimit,
  extractClientIp,
  logTransicaoAuditoria,
} from '../_shared/auth.ts'

interface ResetPasswordPayload {
  user_id: string
  new_password: string
}

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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

    // 1. Blindagem OWASP A01: Exigir JWT de autenticação do chamador
    // Redefinição administrativa de senha de outro usuário é um comando sensível: EXCLUSIVO do papel admin!
    const authResult = await authenticateCaller(req, {
      requireStaff: true,
      requireAdmin: true,
    })

    if ('response' in authResult) {
      return authResult.response
    }

    const { caller } = authResult

    // 2. Rate Limiting: máx. 5 chamadas por minuto por usuário / IP
    const clientIp = extractClientIp(req)
    const rateKey = `admin_reset_password:${caller.userId}:${clientIp}`
    const rateCheck = checkRateLimit(rateKey, 5, 60_000)

    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: `Muitas tentativas de redefinição de senha. Limite de 5 chamadas por minuto excedido. Aguarde ${rateCheck.resetInSeconds} segundos antes de tentar novamente.`,
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

    const payload: ResetPasswordPayload = await req.json()
    const { user_id, new_password } = payload

    if (!user_id || !new_password) {
      return new Response(
        JSON.stringify({ error: 'Os campos user_id e new_password são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Nova Política de Senha Mínima: 8 caracteres
    if (new_password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'A nova senha deve ter no mínimo 8 caracteres.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Obter dados do usuário alvo para auditoria
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, nome, full_name, papel, role')
      .eq('id', user_id)
      .maybeSingle()

    const targetEmail = targetProfile?.email || 'desconhecido'
    const targetNome = targetProfile?.nome || targetProfile?.full_name || targetEmail

    // Atualiza a senha via Auth Admin API
    const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      {
        password: new_password,
      },
    )

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Marca no metadata e no banco que a redefinição de senha foi concluída
    try {
      await supabaseAdmin.rpc('marcar_reset_senha_pendente', {
        p_user_id: user_id,
        p_pendente: false,
      })
    } catch (rpcErr) {
      console.warn('Aviso ao chamar marcar_reset_senha_pendente:', rpcErr)
    }

    // Registrar em auditoria_transicoes e historico com operador responsável
    await logTransicaoAuditoria({
      supabaseAdmin,
      entidade: 'usuario',
      registroId: user_id,
      estadoAnterior: 'senha_anterior',
      estadoNovo: 'senha_redefinida',
      operadorId: caller.userId,
      operadorNome: caller.nome || caller.email,
      motivo: `Redefinição administrativa de senha realizada pelo administrador "${caller.nome || caller.email}"`,
      payload: {
        admin_responsavel_id: caller.userId,
        admin_responsavel_email: caller.email,
        usuario_alvo_id: user_id,
        usuario_alvo_email: targetEmail,
      },
    })

    try {
      await supabaseAdmin.from('historico').insert({
        tipo: 'Redefinição de Senha',
        descricao: `Senha do usuário "${targetNome}" (${targetEmail}) redefinida administrativamente pelo administrador "${caller.nome || caller.email}".`,
        entidade_tipo: 'usuario',
        entidade_id: user_id,
        usuario_id: caller.userId,
        observacao:
          'Operação executada via Edge Function protegida com restrição exclusiva a Administrador.',
      })
    } catch (histErr) {
      console.warn('Aviso ao registrar histórico de redefinição de senha:', histErr)
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: updateData.user.id,
        message: 'Senha atualizada com sucesso pelo administrador.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno ao redefinir senha do usuário.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
