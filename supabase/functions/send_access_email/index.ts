import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  authenticateCaller,
  checkRateLimit,
  extractClientIp,
  logTransicaoAuditoria,
} from '../_shared/auth.ts'

interface SendAccessEmailPayload {
  to: string
  nome: string
  linkAcesso?: string
  tipoEnvio?: 'primeiro_acesso' | 'recuperacao_senha' | 'comunicado_geral'
  matricula?: string
  origemChamada?: string
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
    // Envio de e-mails de acesso requer papel de staff (admin, operador ou operador_diretoria)
    const authResult = await authenticateCaller(req, {
      requireStaff: true,
      requireAdmin: false,
    })

    if ('response' in authResult) {
      return authResult.response
    }

    const { caller } = authResult

    // 2. Rate Limiting: máx. 5 chamadas por minuto por usuário / IP
    const clientIp = extractClientIp(req)
    const rateKey = `send_access_email:${caller.userId}:${clientIp}`
    const rateCheck = checkRateLimit(rateKey, 5, 60_000)

    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: `Limite de envio de e-mails atingido (máximo de 5 envios por minuto). Por favor, aguarde ${rateCheck.resetInSeconds} segundos.`,
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

    const payload: SendAccessEmailPayload = await req.json()
    const {
      to,
      nome,
      linkAcesso,
      tipoEnvio = 'primeiro_acesso',
      matricula,
      origemChamada = 'app_gestao',
    } = payload

    if (!to || !nome) {
      return new Response(JSON.stringify({ error: 'Os campos "to" e "nome" são obrigatórios.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const mailSender =
      Deno.env.get('MAIL_SENDER') || 'Biblioteca CEP <nao-responder@biblioteca.cep.org.br>'

    const link =
      linkAcesso ||
      `${req.headers.get('origin') || 'https://biblioteca-cep.vercel.app'}/redefinir-senha`

    const isRecuperacao = tipoEnvio === 'recuperacao_senha'
    const subject = isRecuperacao
      ? 'Biblioteca CEP — Instruções para Redefinição de Senha'
      : 'Biblioteca CEP — Seu Primeiro Acesso ao Sistema'

    const htmlBody = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">Biblioteca CEP</h2>
        <p>Olá, <strong>${nome}</strong>!</p>
        <p>${
          isRecuperacao
            ? 'Uma solicitação de redefinição de senha foi registrada para o seu usuário no sistema da biblioteca.'
            : 'Seu cadastro na Biblioteca do Colégio Estadual do Paraná foi ativado com sucesso.'
        }</p>
        ${matricula ? `<p><strong>Matrícula:</strong> ${matricula}</p>` : ''}
        <p style="margin: 30px 0;">
          <a href="${link}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            ${isRecuperacao ? 'Redefinir Minha Senha' : 'Definir Minha Senha de Acesso'}
          </a>
        </p>
        <p style="color: #64748b; font-size: 14px;">
          Se o botão acima não funcionar, copie e cole o link a seguir no seu navegador:<br/>
          <a href="${link}" style="color: #2563eb;">${link}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">
          Mensagem automática da Biblioteca do Colégio Estadual do Paraná (CEP). Solicitada por: ${caller.nome || caller.email}. Por favor, não responda este e-mail.
        </p>
      </div>
    `

    let emailSent = false
    let externalId: string | null = null

    if (resendApiKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: mailSender,
          to: [to],
          subject,
          html: htmlBody,
        }),
      })

      const resData = await res.json()
      if (res.ok) {
        emailSent = true
        externalId = resData.id
      } else {
        console.error('Falha ao enviar e-mail via Resend:', resData)
      }
    } else {
      console.warn('RESEND_API_KEY não configurada. Simulando envio de e-mail de acesso para:', to)
      emailSent = true
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Registrar o disparo no banco via RPC existente se disponível
    try {
      await supabaseAdmin.rpc('registrar_envio_email_acesso', {
        p_destinatario: to,
        p_nome: nome,
        p_tipo: tipoEnvio,
        p_sucesso: emailSent,
      })
    } catch (_rpcErr) {
      // Ignora caso rpc não exista
    }

    // Auditoria de transições e histórico
    await logTransicaoAuditoria({
      supabaseAdmin,
      entidade: 'email_acesso',
      registroId: to,
      estadoAnterior: null,
      estadoNovo: emailSent ? 'enviado' : 'falha',
      operadorId: caller.userId,
      operadorNome: caller.nome || caller.email,
      motivo: `Disparo de e-mail (${tipoEnvio}) para "${nome}" <${to}> solicitado pelo operador "${caller.nome || caller.email}"`,
      payload: {
        operador_id: caller.userId,
        operador_papel: caller.papel,
        destinatario_email: to,
        destinatario_nome: nome,
        tipo_envio: tipoEnvio,
        origem: origemChamada,
        sucesso: emailSent,
        external_id: externalId,
      },
    })

    try {
      await supabaseAdmin.from('historico').insert({
        tipo: 'Envio de E-mail de Acesso',
        descricao: `E-mail de ${tipoEnvio} enviado para "${nome}" (${to}) pelo operador "${caller.nome || caller.email}" (${caller.papel}).`,
        entidade_tipo: 'leitor',
        entidade_id: to,
        usuario_id: caller.userId,
        observacao: emailSent ? 'E-mail despachado com sucesso.' : 'Falha no provedor de e-mail.',
      })
    } catch (histErr) {
      console.warn('Aviso ao registrar histórico de envio de e-mail:', histErr)
    }

    return new Response(
      JSON.stringify({
        success: emailSent,
        message: emailSent
          ? 'E-mail de acesso processado com sucesso.'
          : 'Provedor de e-mail indisponível ou rejeitou a mensagem.',
        externalId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno ao disparar e-mail de acesso.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
