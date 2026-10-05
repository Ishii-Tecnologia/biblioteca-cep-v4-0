import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  authenticateCaller,
  checkRateLimit,
  extractClientIp,
  logTransicaoAuditoria,
} from '../_shared/auth.ts'

interface CreateUserPayload {
  email: string
  password: string
  nome: string
  papel?: 'admin' | 'operador' | 'operador_diretoria' | 'leitor'
  avatar_url?: string | null
  email_notificacoes?: string | null
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
    // Valida se o usuário chamador tem sessão ativa e papel de staff (admin, operador ou operador_diretoria)
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
    const rateKey = `admin_create_user:${caller.userId}:${clientIp}`
    const rateCheck = checkRateLimit(rateKey, 5, 60_000)

    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: `Muitas tentativas de criação de usuário. Limite de 5 chamadas por minuto excedido. Aguarde ${rateCheck.resetInSeconds} segundos antes de tentar novamente.`,
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

    const payload: CreateUserPayload = await req.json()
    const {
      email,
      password,
      nome,
      papel = 'operador',
      avatar_url = null,
      email_notificacoes = null,
    } = payload
    const cleanEmailNotificacoes = email_notificacoes?.trim().toLowerCase() || null

    if (!email || !password || !nome) {
      return new Response(JSON.stringify({ error: 'Email, senha e nome são obrigatórios.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Política de Senha Mínima: 8 caracteres
    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'A senha deve conter no mínimo 8 caracteres.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Regra de autorização estrita:
    // Criação de usuários do sistema interno (admin, operador, operador_diretoria)
    // ou qualquer atribuição de papel 'admin' é EXCLUSIVA do papel admin (403 para operadores).
    // Operadores comuns podem cadastrar apenas 'leitor'.
    const isCreatingStaffRole =
      papel === 'admin' || papel === 'operador' || papel === 'operador_diretoria'
    if (isCreatingStaffRole && !caller.isAdmin) {
      return new Response(
        JSON.stringify({
          error:
            'Acesso negado: a criação de usuários com papel interno (admin, operador ou operador de diretoria) é restrita exclusivamente ao papel Administrador.',
          code: 'FORBIDDEN_ADMIN_ROLE_REQUIRED',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Cliente com service role para criar o usuário com email_confirm: true (sem disparar e-mail)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Se for papel 'leitor', verificar se existe uma conta órfã em auth.users ou profiles
    // sem registro na tabela public.leitor para limpá-la e evitar duplicate key error
    if (papel === 'leitor') {
      try {
        const { data: existingLeitor } = await supabaseAdmin
          .from('leitor')
          .select('id_leitor')
          .ilike('email', normalizedEmail)
          .maybeSingle()

        if (!existingLeitor) {
          const { data: listUserData } = await supabaseAdmin.auth.admin.listUsers()
          const orphanUser = listUserData?.users?.find(
            (u) => u.email?.toLowerCase() === normalizedEmail,
          )
          if (orphanUser) {
            console.log(`Limpando usuário órfão auth ${orphanUser.id} (${normalizedEmail})`)
            await supabaseAdmin.from('profiles').delete().eq('id', orphanUser.id)
            await supabaseAdmin.auth.admin.deleteUser(orphanUser.id)
          }
        }
      } catch (cleanOrphanErr) {
        console.warn('Aviso ao verificar órfãos na edge function:', cleanOrphanErr)
      }
    }

    // 1. Criar o usuário diretamente no Auth com email_confirm: true
    let { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        nome: nome.trim(),
        full_name: nome.trim(),
        papel,
        role: papel,
        app_role: papel,
        avatar_url: avatar_url || undefined,
        email_verified: true,
        email_notificacoes: cleanEmailNotificacoes,
      },
    })

    if (createError) {
      if (
        papel === 'leitor' &&
        (createError.message.toLowerCase().includes('already registered') ||
          createError.message.toLowerCase().includes('already exists'))
      ) {
        const { data: existingLeitor } = await supabaseAdmin
          .from('leitor')
          .select('id_leitor')
          .ilike('email', normalizedEmail)
          .maybeSingle()

        if (!existingLeitor) {
          const { data: listUserData } = await supabaseAdmin.auth.admin.listUsers()
          const orphanUser = listUserData?.users?.find(
            (u) => u.email?.toLowerCase() === normalizedEmail,
          )
          if (orphanUser) {
            await supabaseAdmin.from('profiles').delete().eq('id', orphanUser.id)
            await supabaseAdmin.auth.admin.deleteUser(orphanUser.id)

            const retryCreate = await supabaseAdmin.auth.admin.createUser({
              email: normalizedEmail,
              password,
              email_confirm: true,
              user_metadata: {
                nome: nome.trim(),
                full_name: nome.trim(),
                papel,
                role: papel,
                app_role: papel,
                avatar_url: avatar_url || undefined,
                email_verified: true,
                email_notificacoes: cleanEmailNotificacoes,
              },
            })
            createData = retryCreate.data
            createError = retryCreate.error
          }
        }
      }

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const createdUser = createData?.user
    if (!createdUser) {
      return new Response(JSON.stringify({ error: 'Falha ao obter dados do usuário criado.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Garantir registro em public.profiles
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
      {
        id: createdUser.id,
        nome: nome.trim(),
        full_name: nome.trim(),
        email: normalizedEmail,
        papel,
        role: papel,
        avatar_url: avatar_url || null,
        email_notificacoes: cleanEmailNotificacoes,
        bloqueado: false,
      },
      { onConflict: 'id' },
    )

    if (profileError) {
      console.warn(
        'Aviso ao sincronizar profiles na edge function admin_create_user:',
        profileError,
      )
    }

    // 3. Registrar na tabela de auditoria_transicoes e historico com identificação de quem chamou
    await logTransicaoAuditoria({
      supabaseAdmin,
      entidade: 'usuario',
      registroId: createdUser.id,
      estadoAnterior: null,
      estadoNovo: papel,
      operadorId: caller.userId,
      operadorNome: caller.nome || caller.email,
      motivo: `Criação de novo usuário com papel "${papel}" via Edge Function segura`,
      payload: {
        criado_por_id: caller.userId,
        criado_por_papel: caller.papel,
        usuario_criado_id: createdUser.id,
        usuario_criado_email: normalizedEmail,
        papel_atribuido: papel,
      },
    })

    try {
      await supabaseAdmin.from('historico').insert({
        tipo: 'Criação de Usuário',
        descricao: `Usuário "${nome.trim()}" (${normalizedEmail}) criado com papel "${papel}" pelo operador "${caller.nome || caller.email}" (${caller.papel}).`,
        entidade_tipo: 'usuario',
        entidade_id: createdUser.id,
        usuario_id: caller.userId,
        observacao: `Operação administrativa autorizada por ${caller.papel}.`,
      })
    } catch (histErr) {
      console.warn('Aviso ao registrar histórico de criação de usuário:', histErr)
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: createdUser,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno ao processar cadastro de usuário.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
