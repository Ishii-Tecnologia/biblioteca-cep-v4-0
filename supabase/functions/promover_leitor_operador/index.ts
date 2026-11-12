import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  authenticateCaller,
  checkRateLimit,
  extractClientIp,
  logTransicaoAuditoria,
} from '../_shared/auth.ts'

interface PromotePayload {
  id_leitor: number
  nome_do_leitor?: string
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

    // 1. Blindagem OWASP A01: exige JWT válido e papel EXCLUSIVO de admin
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
    const rateKey = `promover_leitor_operador:${caller.userId}:${clientIp}`
    const rateCheck = checkRateLimit(rateKey, 5, 60_000)

    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: `Muitas tentativas de promoção de leitor. Limite de 5 chamadas por minuto excedido. Aguarde ${rateCheck.resetInSeconds} segundos antes de tentar novamente.`,
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

    const payload: PromotePayload = await req.json()
    const idLeitor = Number(payload?.id_leitor)

    if (!idLeitor || Number.isNaN(idLeitor)) {
      return new Response(JSON.stringify({ error: 'id_leitor é obrigatório.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 3. Localizar o registro de leitor existente
    const { data: leitor, error: leitorError } = await supabaseAdmin
      .from('leitor')
      .select('id_leitor, nome_do_leitor, email, id_auth, bloqueado')
      .eq('id_leitor', idLeitor)
      .maybeSingle()

    if (leitorError || !leitor) {
      return new Response(JSON.stringify({ error: 'Leitor não encontrado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. O leitor precisa possuir conta de acesso (usuário Supabase) —
    //    a promoção atualiza o usuário EXISTENTE, nunca cria novo.
    let authUserId: string | null = (leitor as any).id_auth ?? null

    if (!authUserId) {
      const { data: profileByEmail } = await supabaseAdmin
        .from('profiles')
        .select('id, papel, role')
        .ilike('email', (leitor as any).email?.trim().toLowerCase())
        .maybeSingle()

      if (profileByEmail) {
        authUserId = profileByEmail.id
      }
    }

    if (!authUserId) {
      return new Response(
        JSON.stringify({
          error:
            'Este leitor não possui conta de acesso (login). É necessário que o leitor tenha conta ativa antes de ser promovido a operador.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 5. Verificar se o usuário já possui papel interno — impede re-promoção
    const { data: perfilAtual } = await supabaseAdmin
      .from('profiles')
      .select('papel, role')
      .eq('id', authUserId)
      .maybeSingle()

    const papelAtual = ((perfilAtual as any)?.papel || (perfilAtual as any)?.role || '')
      .toString()
      .toLowerCase()

    if (
      papelAtual === 'admin' ||
      papelAtual === 'operador' ||
      papelAtual === 'operador_diretoria'
    ) {
      return new Response(
        JSON.stringify({
          error: 'Este usuário já possui um papel interno e não pode ser promovido novamente.',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const nomeFinal = (
      payload?.nome_do_leitor?.trim() ||
      (leitor as any).nome_do_leitor ||
      ''
    ).trim()

    // 6. Atualizar o papel do usuário EXISTENTE (nunca criar novo)
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      user_metadata: {
        // mantém demais metadados existentes
        ...((leitor as any as any) && {}),
        nome: nomeFinal,
        full_name: nomeFinal,
        papel: 'operador',
        role: 'operador',
        app_role: 'operador',
      },
    })

    if (updateAuthError) {
      console.warn('Aviso ao atualizar user_metadata do Auth:', updateAuthError)
    }

    // 7. Garantir/atualizar registro em public.profiles com o novo papel
    const { error: profileUpsertError } = await supabaseAdmin.from('profiles').upsert(
      {
        id: authUserId,
        email: (leitor as any).email?.trim().toLowerCase(),
        nome: nomeFinal,
        full_name: nomeFinal,
        papel: 'operador',
        role: 'operador',
        bloqueado: false,
      },
      { onConflict: 'id' },
    )

    if (profileUpsertError) {
      console.warn('Aviso ao sincronizar profiles na edge function:', profileUpsertError)
      return new Response(
        JSON.stringify({
          error:
            'Não foi possível atualizar o papel do usuário no banco de dados. Tente novamente.',
        }),
        {
          status: 500,
          ...({ headers: { ...corsHeaders, 'Content-Type': 'application/json' } } as any),
        },
      )
    }

    // 8. Marcar o registro de leitor como promovido (mantém histórico;
    //    sem conta de leitor ativa). Colunas opcionais são aplicadas tolerando falhas.
    try {
      await supabaseAdmin
        .from('leitor')
        .update({
          bloqueado: true,
          status_cadastro: 'promovido_operador',
          status: 'PROMOVIDO',
        })
        .eq('id_leitor', idLeitor)
    } catch (leitorUpdateErr) {
      console.warn('Aviso ao atualizar registro do leitor:', leitorUpdateErr)
    }

    // 9. Auditoria da transição de papel (transição sensível)
    await logTransicaoAuditoria({
      supabaseAdmin,
      entidade: 'leitor',
      registroId: String(idLeitor),
      estadoAnterior: 'leitor',
      estadoNovo: 'operador',
      operadorId: caller.userId,
      operadorNome: caller.nome || caller.email,
      motivo: 'Promoção de leitor a operador (ação exclusiva do administrador)',
      payload: {
        promovido_por_id: caller.userId,
        promovido_por_papel: caller.papel,
        leitor_id: idLeitor,
        leitor_email: (leitor as any).email,
        auth_user_id: authUserId,
        papel_anterior: papelAtual || 'leitor',
        novo_papel: 'operador',
      },
    })

    try {
      await supabaseAdmin.from('historico').insert({
        tipo: 'Promoção de Leitor a Operador',
        descricao: `Leitor "${nomeFinal}" (${(leitor as any).email}) foi promovido ao papel interno "operador" pelo administrador "${caller.nome || caller.email}".`,
        entidade_tipo: 'usuario',
        entidade_id: String(idLeitor),
        usuario_id: caller.userId,
        observacao: 'Operação administrativa autorizada por admin.',
      })
    } catch (histErr) {
      console.warn('Aviso ao registrar histórico de promoção:', histErr)
    }

    return new Response(
      JSON.stringify({
        success: true,
        novo_papel: 'operador',
        user_id: authUserId,
        leitor_id: idLeitor,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno ao processar a promoção do leitor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
