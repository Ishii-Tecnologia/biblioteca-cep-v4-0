import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface CreateUserPayload {
  email: string
  password: string
  nome: string
  papel?: 'admin' | 'operador' | 'operador_diretoria' | 'leitor'
  avatar_url?: string | null
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
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

    const payload: CreateUserPayload = await req.json()
    const { email, password, nome, papel = 'operador', avatar_url = null } = payload

    if (!email || !password || !nome) {
      return new Response(JSON.stringify({ error: 'Email, senha e nome são obrigatórios.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'A senha deve conter no mínimo 6 caracteres.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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

    // 1. Criar o usuário diretamente no Auth com email_confirm: true
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
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
      },
    })

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const createdUser = createData.user
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
