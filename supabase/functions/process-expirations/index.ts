import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    let body: any = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const operadorNome = body.operador_nome || 'Cron Job / Expiração Automática'

    // Chama a RPC transacional com row lock
    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc(
      'processar_expiracoes_automaticas',
      {
        p_operador_nome: operadorNome,
      },
    )

    if (rpcErr) throw rpcErr

    // Se houve avanço de fila, notificar os contemplados
    // Notificações: e-mail + SMS conforme Seção 3.3 e 7
    const detalhes = rpcData?.detalhes || []
    const notificacoesRealizadas: any[] = []

    // Verificar se NOTIFICAR_EMAIL e NOTIFICAR_SMS estão habilitados na tabela configuracao
    const { data: configs } = await supabaseAdmin
      .from('configuracao')
      .select('chave, valor')
      .in('chave', ['NOTIFICAR_EMAIL', 'NOTIFICAR_SMS'])

    const configMap = new Map<string, string>()
    ;(configs || []).forEach((c: { chave: string; valor: string }) => {
      configMap.set(c.chave, c.valor)
    })

    const notificarEmail = configMap.get('NOTIFICAR_EMAIL') !== 'false'
    const notificarSms = configMap.get('NOTIFICAR_SMS') !== 'false'

    for (const item of detalhes) {
      if (item.proxima_reserva_contemplada && item.novo_leitor_id) {
        // Obter leitor
        const { data: leitor } = await supabaseAdmin
          .from('leitor')
          .select('id_leitor, nome_do_leitor, email, telefone')
          .eq('id_leitor', item.novo_leitor_id)
          .single()

        if (leitor) {
          // Notificação de E-mail
          if (notificarEmail && leitor.email) {
            try {
              // Dispara envio usando a edge function auditoria_mensal_expurgo com a ação 'enviar_notificacao_reserva'
              await supabaseAdmin.functions.invoke('auditoria_mensal_expurgo', {
                body: {
                  action: 'enviar_notificacao_reserva',
                  to: [leitor.email],
                  subject: 'Biblioteca CEP — Seu livro está pronto para retirada!',
                  body: `Olá, ${leitor.nome_do_leitor}!\n\nSeu livro reservado já está pronto na biblioteca. Você foi contemplado na fila de espera e tem o prazo de 4 dias úteis para realizar a retirada física.\n\nData limite: ${new Date(item.nova_data_limite).toLocaleDateString('pt-BR')}.\n\nAtenciosamente,\nEquipe da Biblioteca CEP`,
                },
              })
            } catch (emailErr) {
              console.warn('Erro ao disparar e-mail de contemplação:', emailErr)
            }
          }

          // Notificação de SMS (Registro de auditoria transparente conforme spec: sem provedor configurado)
          if (notificarSms && leitor.telefone) {
            await supabaseAdmin.from('auditoria_transicoes').insert({
              entidade: 'notificacao_sms',
              registro_id: `reserva_${item.proxima_reserva_contemplada}`,
              estado_anterior: 'PENDENTE',
              estado_novo: 'SIMULADO_SEM_PROVEDOR',
              operador_id: null,
              operador_nome: 'SMS Service Stub',
              motivo: `Tentativa de envio de SMS para ${leitor.telefone} (${leitor.nome_do_leitor}): "Livro contemplado para retirada!". Provedor de SMS não configurado no projeto.`,
              payload: {
                telefone: leitor.telefone,
                leitor_id: leitor.id_leitor,
                reserva_id: item.proxima_reserva_contemplada,
              },
            })
          }

          notificacoesRealizadas.push({
            leitor_id: leitor.id_leitor,
            email: leitor.email,
            notificado_email: notificarEmail,
            notificado_sms_auditado: notificarSms,
          })
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        resultado_expiracao: rpcData,
        notificacoes: notificacoesRealizadas,
        mensagem: `Processamento concluído. ${rpcData?.expirados || 0} empréstimo(s) expirado(s) e ${rpcData?.avancados || 0} leitor(es) contemplado(s) na fila.`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('Erro em process-expirations:', err)
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || 'Erro ao processar expirações.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
