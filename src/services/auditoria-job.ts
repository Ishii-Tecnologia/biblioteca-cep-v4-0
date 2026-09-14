import { supabase } from '@/lib/supabase/client'

export interface AuditoriaJobConfig {
  ativo: boolean
  destinatarios: string
  assunto: string
  corpo: string
  remetente: string
  diasRetroativos: number
  diaEnvio: number
  horaEnvio: string
  diasRetencao: number
}

export interface JobExecucaoRecord {
  id: string
  ano_mes: string
  tipo_job: string
  status: 'pendente' | 'sucesso' | 'erro'
  data_execucao: string
  destinatarios: string | null
  registros_incluidos: number
  registros_expurgados: number
  duracao_ms: number
  mensagem: string | null
  detalhes: any
  created_at: string
}

export interface JobRunResponse {
  success: boolean
  message: string
  skipped?: boolean
  error?: string
  provider?: 'resend' | 'smtp' | 'simulado'
  ano_mes?: string
  total_registros_relatorio?: number
  registros_expurgados?: number
  duracao_ms?: number
  provedor_email?: 'resend' | 'smtp' | 'simulado'
  destinatarios_enviados?: string[]
  destinatarios_invalidos?: string[]
}

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

export const AuditoriaJobService = {
  isValidEmail(email: string): boolean {
    return EMAIL_REGEX.test(email.trim())
  },

  validateEmailList(rawList: string): { valid: string[]; invalid: string[] } {
    const parts = rawList
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    const valid: string[] = []
    const invalid: string[] = []

    for (const part of parts) {
      if (this.isValidEmail(part)) {
        valid.push(part)
      } else {
        invalid.push(part)
      }
    }

    return { valid, invalid }
  },

  async loadConfig(): Promise<AuditoriaJobConfig> {
    const { data, error } = await supabase
      .from('parametros')
      .select('chave, valor')
      .in('chave', [
        'auditoria_envio_ativo',
        'auditoria_destinatarios',
        'auditoria_assunto',
        'auditoria_corpo',
        'auditoria_remetente',
        'auditoria_dias_retroativos',
        'auditoria_dia_envio',
        'auditoria_hora_envio',
        'auditoria_dias_retencao',
      ])

    if (error) {
      console.error('Erro ao carregar parâmetros de auditoria:', error)
    }

    const map = new Map<string, string>()
    ;(data || []).forEach((row) => map.set(row.chave, row.valor))

    return {
      ativo: map.get('auditoria_envio_ativo') === 'true',
      destinatarios: map.get('auditoria_destinatarios') || '',
      assunto: map.get('auditoria_assunto') || 'Relatório de Auditoria — {data_referencia}',
      corpo:
        map.get('auditoria_corpo') ||
        'Olá,\n\nSegue em anexo o Relatório de Auditoria do sistema Biblioteca CEP referente ao período de {data_inicio} até {data_fim}.\n\nTotal de registros auditados: {total_registros}.\nData de geração: {data_referencia}.\n\nAcesse o sistema para mais detalhes: {link_sistema}',
      remetente: map.get('auditoria_remetente') || 'sys.biblioteca.cep@email.org',
      diasRetroativos: Math.max(
        1,
        Math.min(365, parseInt(map.get('auditoria_dias_retroativos') || '30', 10)),
      ),
      diaEnvio: Math.max(1, Math.min(31, parseInt(map.get('auditoria_dia_envio') || '1', 10))),
      horaEnvio: map.get('auditoria_hora_envio') || '08:00',
      diasRetencao: Math.max(1, parseInt(map.get('auditoria_dias_retencao') || '90', 10)),
    }
  },

  async saveConfig(config: AuditoriaJobConfig): Promise<{ success: boolean; error?: string }> {
    const updates = [
      { chave: 'auditoria_envio_ativo', valor: String(config.ativo) },
      { chave: 'auditoria_destinatarios', valor: config.destinatarios.trim() },
      { chave: 'auditoria_assunto', valor: config.assunto.trim() },
      { chave: 'auditoria_corpo', valor: config.corpo.trim() },
      { chave: 'auditoria_remetente', valor: config.remetente.trim() },
      { chave: 'auditoria_dias_retroativos', valor: String(config.diasRetroativos) },
      { chave: 'auditoria_dia_envio', valor: String(config.diaEnvio) },
      { chave: 'auditoria_hora_envio', valor: config.horaEnvio.trim() },
      { chave: 'auditoria_dias_retencao', valor: String(config.diasRetencao) },
    ]

    for (const item of updates) {
      const { error } = await supabase.from('parametros').upsert(item, { onConflict: 'chave' })

      if (error) {
        return { success: false, error: error.message }
      }
    }

    return { success: true }
  },

  async getLatestExecution(): Promise<JobExecucaoRecord | null> {
    const { data, error } = await (supabase as any)
      .from('job_execucoes')
      .select('*')
      .eq('tipo_job', 'auditoria_mensal_expurgo')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn('Não foi possível obter última execução:', error)
      return null
    }

    return (data as JobExecucaoRecord) || null
  },

  async sendTestEmail(): Promise<JobRunResponse> {
    return this.sendManualReport()
  },

  async sendManualReport(): Promise<JobRunResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('auditoria_mensal_expurgo', {
        body: { action: 'enviar_manual', manual: true, force: true },
      })

      if (error) {
        // Tentar extrair corpo JSON retornado pela Edge Function se disponível
        let detailedMsg = error.message
        if ((error as any).context && typeof (error as any).context.json === 'function') {
          try {
            const errJson = await (error as any).context.json()
            if (errJson?.error || errJson?.message) {
              detailedMsg = errJson.error || errJson.message
            }
          } catch {
            // falha ao analisar context json, manter mensagem original
          }
        }

        return {
          success: false,
          error: detailedMsg || 'Falha ao acionar o envio manual do relatório de auditoria.',
          message: detailedMsg || 'Falha no envio do relatório.',
        }
      }

      if (data && typeof data === 'object') {
        const res = data as JobRunResponse
        // Garantir que se a resposta vier com success: false, a UI capture a mensagem correta
        if (res.success === false && !res.error && res.message) {
          res.error = res.message
        }
        return res
      }

      return {
        success: true,
        message: 'Envio manual do relatório de auditoria concluído com sucesso.',
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erro inesperado ao solicitar envio manual.',
        message: 'Erro na requisição.',
      }
    }
  },

  async runJobNow(force: boolean = true): Promise<JobRunResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('auditoria_mensal_expurgo', {
        body: { action: 'executar_job', force },
      })

      if (error) {
        let detailedMsg = error.message
        if ((error as any).context && typeof (error as any).context.json === 'function') {
          try {
            const errJson = await (error as any).context.json()
            if (errJson?.error || errJson?.message) {
              detailedMsg = errJson.error || errJson.message
            }
          } catch {
            // falha ao analisar context json
          }
        }

        return {
          success: false,
          error: detailedMsg || 'Falha ao executar o job de auditoria.',
          message: detailedMsg || 'Falha na execução.',
        }
      }

      if (data && typeof data === 'object') {
        const res = data as JobRunResponse
        if (res.success === false && !res.error && res.message) {
          res.error = res.message
        }
        return res
      }

      return {
        success: true,
        message: 'Job de auditoria executado com sucesso.',
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erro inesperado na execução do job.',
        message: 'Erro na requisição.',
      }
    }
  },

  async executePurgeDirect(
    diasRetencao: number,
  ): Promise<{ success: boolean; total_removidos?: number; duracao_ms?: number; error?: string }> {
    try {
      const { data, error } = await (supabase as any).rpc('expurgar_historico_em_lotes', {
        p_dias_retencao: diasRetencao,
        p_batch_size: 500,
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return {
        success: true,
        total_removidos: (data as any)?.total_removidos ?? 0,
        duracao_ms: (data as any)?.duracao_ms ?? 0,
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao executar RPC de expurgo.' }
    }
  },
}
