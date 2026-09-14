import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    if (!supabaseUrl) {
      return new Response(
        JSON.stringify({ error: 'Configuração do servidor ausente (SUPABASE_URL)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { user_id, new_password }: { user_id?: string; new_password?: string } = await req.json()

    if (!user_id || !new_password) {
      return new Response(JSON.stringify({ error: 'user_id e new_password são obrigatórios.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (new_password.length < 6) {
      return new Response(JSON.stringify({ error: 'A senha deve ter no mínimo 6 caracteres.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Criar cliente Supabase com service_role para operações de administrador
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Atualizar senha via admin API
    const { data: userData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      { password: new_password },
    )

    if (updateError) {
      // Se a admin API falhar, tentar fallback via RPC
      const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('admin_reset_password', {
        target_user_id: user_id,
        new_password: new_password,
      })

      if (rpcError) {
        return new Response(
          JSON.stringify({
            error:
              updateError.message || rpcError.message || 'Erro ao redefinir a senha do usuário.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Senha alterada com sucesso via RPC.',
          data: rpcData,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Senha alterada com sucesso.',
        user: userData.user,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno ao processar requisição.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
