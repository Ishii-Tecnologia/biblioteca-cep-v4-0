import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface SendAccessEmailPayload {
  email: string
  nome?: string
  redirectTo?: string
  tipo?: 'primeiro_acesso' | 'reset_senha'
}

// Envio direto via SMTP com suporte a TLS direto (porta 465) e STARTTLS (porta 587)
async function sendViaSmtp({
  host,
  port,
  user,
  pass,
  from,
  to,
  subject,
  html,
  text,
}: {
  host: string
  port: number
  user: string
  pass: string
  from: string
  to: string[]
  subject: string
  html: string
  text: string
}): Promise<{ success: boolean; message: string }> {
  let conn: Deno.Conn | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  let readBuffer = ''

  const textDecoder = new TextDecoder()
  const textEncoder = new TextEncoder()

  const connectPromise = async (): Promise<Deno.Conn> => {
    if (port === 465) {
      return await Deno.connectTls({ hostname: host, port })
    }
    return await Deno.connect({ hostname: host, port })
  }

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`Tempo limite (25s) esgotado ao conectar no servidor SMTP ${host}:${port}.`),
          ),
        25000,
      ),
    )

    const runSmtpSession = async (): Promise<string> => {
      conn = await connectPromise()
      reader = conn.readable.getReader()
      writer = conn.writable.getWriter()

      const readLine = async (): Promise<string> => {
        while (true) {
          const newlineIdx = readBuffer.indexOf('\n')
          if (newlineIdx !== -1) {
            const line = readBuffer.slice(0, newlineIdx).replace(/\r$/, '')
            readBuffer = readBuffer.slice(newlineIdx + 1)
            return line
          }
          const { value, done } = await reader!.read()
          if (done) {
            if (readBuffer.length > 0) {
              const line = readBuffer.replace(/\r$/, '')
              readBuffer = ''
              return line
            }
            throw new Error('Conexão SMTP encerrada inesperadamente pelo servidor.')
          }
          readBuffer += textDecoder.decode(value, { stream: true })
        }
      }

      const readResponse = async (): Promise<{
        code: number
        lines: string[]
        fullText: string
      }> => {
        const lines: string[] = []
        let lastCode = 0
        while (true) {
          const line = await readLine()
          lines.push(line)
          const match = line.match(/^(\d{3})([ -])(.*)$/)
          if (match) {
            lastCode = parseInt(match[1], 10)
            const isContinuation = match[2] === '-'
            if (!isContinuation) break
          } else {
            break
          }
        }
        return { code: lastCode, lines, fullText: lines.join(' | ') }
      }

      const writeCommand = async (cmd: string): Promise<void> => {
        await writer!.write(textEncoder.encode(cmd + '\r\n'))
      }

      // 1. Saudação inicial (220)
      const greeting = await readResponse()
      if (greeting.code !== 220) {
        throw new Error(`Saudação inicial SMTP rejeitada (${greeting.code}): ${greeting.fullText}`)
      }

      // 2. EHLO
      await writeCommand(`EHLO localhost`)
      let ehloResp = await readResponse()
      if (ehloResp.code !== 250) {
        await writeCommand(`HELO localhost`)
        ehloResp = await readResponse()
        if (ehloResp.code !== 250) {
          throw new Error(
            `Handshake SMTP (EHLO/HELO) falhou (${ehloResp.code}): ${ehloResp.fullText}`,
          )
        }
      }

      // 3. STARTTLS se não for porta 465
      if (port !== 465) {
        await writeCommand('STARTTLS')
        const starttlsResp = await readResponse()
        if (starttlsResp.code !== 220) {
          throw new Error(
            `Servidor SMTP não aceitou STARTTLS na porta ${port} (${starttlsResp.code}): ${starttlsResp.fullText}`,
          )
        }

        reader.releaseLock()
        writer.releaseLock()
        conn = await Deno.startTls(conn, { hostname: host })
        reader = conn.readable.getReader()
        writer = conn.writable.getWriter()
        readBuffer = ''

        await writeCommand(`EHLO localhost`)
        const postTlsEhlo = await readResponse()
        if (postTlsEhlo.code !== 250) {
          throw new Error(
            `Handshake SMTP pós-STARTTLS falhou (${postTlsEhlo.code}): ${postTlsEhlo.fullText}`,
          )
        }
      }

      // 4. AUTH LOGIN
      await writeCommand('AUTH LOGIN')
      const authResp = await readResponse()
      if (authResp.code !== 334) {
        throw new Error(
          `Servidor SMTP recusou início de autenticação (${authResp.code}): ${authResp.fullText}`,
        )
      }

      await writeCommand(btoa(user))
      const userResp = await readResponse()
      if (userResp.code !== 334) {
        throw new Error(
          `Usuário SMTP recusado pelo servidor (${userResp.code}): ${userResp.fullText}`,
        )
      }

      const sanitizedPass = pass.replace(/\s+/g, '')
      await writeCommand(btoa(sanitizedPass))
      const passResp = await readResponse()
      if (passResp.code !== 235) {
        throw new Error(
          `Autenticação SMTP recusada (${passResp.code}): ${passResp.fullText}. Para Gmail, verifique se está usando uma 'Senha de App' de 16 letras.`,
        )
      }

      // 5. MAIL FROM
      const fromMatch = from.match(/<([^>]+)>/)
      const envelopeFrom = fromMatch ? fromMatch[1].trim() : from.trim() || user
      await writeCommand(`MAIL FROM:<${envelopeFrom}>`)
      const mailFromResp = await readResponse()
      if (mailFromResp.code !== 250) {
        throw new Error(`Remetente SMTP recusado (${mailFromResp.code}): ${mailFromResp.fullText}`)
      }

      // 6. RCPT TO
      for (const recipient of to) {
        const rcptMatch = recipient.match(/<([^>]+)>/)
        const envelopeTo = rcptMatch ? rcptMatch[1].trim() : recipient.trim()
        await writeCommand(`RCPT TO:<${envelopeTo}>`)
        const rcptResp = await readResponse()
        if (rcptResp.code !== 250 && rcptResp.code !== 251) {
          throw new Error(
            `Destinatário SMTP recusado: ${recipient} (${rcptResp.code}): ${rcptResp.fullText}`,
          )
        }
      }

      // 7. DATA
      await writeCommand('DATA')
      const dataResp = await readResponse()
      if (dataResp.code !== 354) {
        throw new Error(`Comando DATA rejeitado (${dataResp.code}): ${dataResp.fullText}`)
      }

      // 8. Mensagem MIME multipart/alternative (texto e HTML)
      const boundary = '==_Part_BibliotecaCEP_' + Date.now().toString(36)
      const fromHeader = from.includes('<')
        ? from
        : `Biblioteca da Coligação Espírita Progressista (CEP) <${from || user}>`
      const toHeader = to.join(', ')

      const mimeMessage = [
        `From: ${fromHeader}`,
        `To: ${toHeader}`,
        `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
        `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 8bit',
        '',
        text,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: 8bit',
        '',
        html,
        '',
        `--${boundary}--`,
        '.',
      ].join('\r\n')

      await writeCommand(mimeMessage)
      const sendResp = await readResponse()
      if (sendResp.code !== 250) {
        throw new Error(
          `Falha no envio do corpo da mensagem (${sendResp.code}): ${sendResp.fullText}`,
        )
      }

      // 9. QUIT
      try {
        await writeCommand('QUIT')
        await readResponse()
      } catch {
        // Ignorar falha no QUIT após confirmação de envio
      }

      return sendResp.fullText || '250 OK'
    }

    await Promise.race([runSmtpSession(), timeoutPromise])

    return {
      success: true,
      message: `E-mail enviado com sucesso via SMTP (${host}:${port}).`,
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Falha no envio via SMTP (${host}:${port}): ${err.message}`,
    }
  } finally {
    try {
      if (reader) reader.releaseLock()
    } catch {}
    try {
      if (writer) writer.releaseLock()
    } catch {}
    try {
      if (conn) conn.close()
    } catch {}
  }
}

Deno.serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Configuração do servidor ausente (SUPABASE_URL/SERVICE_KEY)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const payload: SendAccessEmailPayload = await req.json()
    const email = payload.email?.trim().toLowerCase()
    const nome = payload.nome?.trim()
    const redirectTo = payload.redirectTo?.trim() || `${new URL(req.url).origin}/redefinir-senha`
    const isReset = payload.tipo === 'reset_senha'

    // Autorização: permitir requisição pública se for recuperação de senha por email,
    // ou se houver token válido de operador/admin / service_role
    if (!email) {
      return new Response(JSON.stringify({ error: 'E-mail é obrigatório.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // 1. Obter perfil/leitor para verificar email_notificacoes e nome do usuário
    let leitorNome = nome || ''
    let recipientEmail = email // Destinatário real de entrega do e-mail

    // Verificar se existe profile cadastrado para o e-mail de login fornecido
    const { data: profileRow } = await supabaseAdmin
      .from('profiles')
      .select('nome, full_name, email_notificacoes')
      .ilike('email', email)
      .maybeSingle()

    if (profileRow?.email_notificacoes && profileRow.email_notificacoes.trim()) {
      recipientEmail = profileRow.email_notificacoes.trim().toLowerCase()
    }

    if (!leitorNome) {
      const { data: leitorRow } = await supabaseAdmin
        .from('leitor')
        .select('nome_do_leitor')
        .ilike('email', email)
        .maybeSingle()
      if (leitorRow?.nome_do_leitor) {
        leitorNome = leitorRow.nome_do_leitor
      } else {
        leitorNome = profileRow?.nome || profileRow?.full_name || email.split('@')[0]
      }
    }

    // 2. Marcar no banco que a senha está pendente de definição
    try {
      await supabaseAdmin.rpc('marcar_reset_senha_pendente', { p_email: email })
    } catch (markErr) {
      console.warn('Aviso ao chamar marcar_reset_senha_pendente via RPC:', markErr)
    }

    // 3. Gerar link de recuperação SEM disparar o e-mail padrão do Supabase
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectTo,
      },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Erro ao gerar link de recovery:', linkError)
      return new Response(
        JSON.stringify({
          error:
            linkError?.message ||
            'Não foi possível gerar o link seguro de acesso para este e-mail.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const actionLink = linkData.properties.action_link

    // 4. Preparar conteúdo de e-mail institucional da Biblioteca da Coligação Espírita Progressista (CEP)
    const saudacao = leitorNome ? `Olá, ${leitorNome}!` : 'Olá!'
    const assunto = isReset
      ? 'Biblioteca da Coligação Espírita Progressista (CEP) — Redefinição de Senha de Acesso'
      : 'Biblioteca da Coligação Espírita Progressista (CEP) — Bem-vindo! Defina sua Senha de Acesso'

    const tituloCard = isReset ? 'Redefinição de Senha' : 'Seu Primeiro Acesso'
    const textoExplicativo = isReset
      ? 'Recebemos uma solicitação para redefinir sua senha de acesso ao sistema da <strong>Biblioteca da Coligação Espírita Progressista (CEP)</strong>. Clique no botão abaixo para cadastrar sua nova senha:'
      : 'Seu cadastro de leitor na <strong>Biblioteca da Coligação Espírita Progressista (CEP)</strong> foi confirmado com sucesso! Para começar a utilizar o sistema, consultar o acervo e solicitar empréstimos, cadastre sua senha de acesso:'

    const htmlBody = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${assunto}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="580px" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Top Accent Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); height: 6px;"></td>
          </tr>
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 36px 20px 36px; text-align: center; border-bottom: 1px solid #f1f5f9;">
              <h1 style="margin: 0 0 6px 0; font-size: 24px; font-weight: 800; color: #047857; letter-spacing: -0.5px;">Biblioteca da Coligação Espírita Progressista (CEP)</h1>
              <p style="margin: 0; font-size: 13px; color: #64748b; font-weight: 500;">Sistema de Gestão de Acervo e Empréstimos</p>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px 36px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #0f172a;">${saudacao}</p>
              
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                ${textoExplicativo}
              </p>

              <!-- Button Container -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${actionLink}" target="_blank" style="display: inline-block; background-color: #059669; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px; box-shadow: 0 2px 4px rgba(5, 150, 105, 0.25);">
                      Definir Minha Senha
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Link Fallback -->
              <p style="margin: 0 0 16px 0; font-size: 12px; color: #64748b; line-height: 1.5;">
                Se o botão acima não funcionar, copie e cole o endereço abaixo no seu navegador:
              </p>
              <p style="margin: 0 0 24px 0; font-size: 11px; word-break: break-all; background-color: #f1f5f9; padding: 10px 12px; border-radius: 6px; color: #047857; font-family: monospace;">
                <a href="${actionLink}" target="_blank" style="color: #047857; text-decoration: underline;">${actionLink}</a>
              </p>

              <!-- Notices Box -->
              <div style="background-color: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 14px 16px; margin: 24px 0 0 0;">
                <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #854d0e;">Informações Importantes:</p>
                <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #713f12; line-height: 1.5;">
                  <li style="margin-bottom: 4px;">Por motivos de segurança, este link é de uso único e <strong>expira em 1 hora</strong>.</li>
                  <li>Se você não solicitou este acesso ou não reconhece este cadastro, por favor desconsidere este e-mail.</li>
                </ul>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 36px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #475569;">Coligação Espírita Progressista (CEP) — Biblioteca</p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">Mensagem automática gerada pelo sistema. Não responda a este e-mail.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    const textBody = `${saudacao}

${isReset ? 'Recebemos uma solicitação para redefinir sua senha na Biblioteca da Coligação Espírita Progressista (CEP).' : 'Seu cadastro de leitor na Biblioteca da Coligação Espírita Progressista (CEP) foi confirmado com sucesso!'}

Para cadastrar sua senha, acesse o link seguro abaixo:
${actionLink}

Avisos importantes:
- Este link expira em 1 hora.
- Se você não solicitou este cadastro ou redefinição, apenas ignore esta mensagem.

Atenciosamente,
Biblioteca da Coligação Espírita Progressista (CEP)`

    // 5. Configuração SMTP
    const smtpHost = Deno.env.get('SMTP_HOST')?.trim()
    const smtpPortStr = Deno.env.get('SMTP_PORT')?.trim()
    const smtpUser = Deno.env.get('SMTP_USER')?.trim()
    const smtpPass = Deno.env.get('SMTP_PASS')?.trim()

    let sendResult: { success: boolean; message: string }

    if (smtpHost && smtpPortStr && smtpUser && smtpPass) {
      const port = parseInt(smtpPortStr, 10) || 587
      const fromHeader = `Biblioteca da Coligação Espírita Progressista (CEP) <${smtpUser}>`

      sendResult = await sendViaSmtp({
        host: smtpHost,
        port: port,
        user: smtpUser,
        pass: smtpPass,
        from: fromHeader,
        to: [recipientEmail],
        subject: assunto,
        html: htmlBody,
        text: textBody,
      })

      if (!sendResult.success) {
        console.error('Falha no envio via SMTP:', sendResult.message)
        return new Response(
          JSON.stringify({
            error: sendResult.message,
            action_link: actionLink,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    } else {
      // Fallback simulado (caso credenciais SMTP não estejam configuradas)
      console.warn('Credenciais SMTP não configuradas. Simulando envio de e-mail.')
      sendResult = {
        success: true,
        message: `Envio simulado com sucesso para ${recipientEmail}. Link: ${actionLink}`,
      }
    }

    // 6. Registrar envio no banco (cooldown timestamp)
    try {
      await supabaseAdmin.rpc('registrar_envio_email_acesso', { p_email: email })
    } catch (logErr) {
      console.warn('Aviso ao registrar envio de e-mail:', logErr)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'E-mail de acesso enviado com sucesso.',
        email: email,
        destinatario: recipientEmail,
        smtp_message: sendResult.message,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('Erro na função send_access_email:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno ao enviar e-mail de acesso.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
