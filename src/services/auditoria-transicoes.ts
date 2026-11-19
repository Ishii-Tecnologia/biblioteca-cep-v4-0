import { supabase } from '@/lib/supabase/client'

export interface AuditoriaTransicao {
  id: number
  entidade: string
  registro_id: string
  estado_anterior?: string | null
  estado_novo: string
  operador_id?: string | null
  operador_nome?: string | null
  motivo?: string | null
  payload?: any
  created_at: string
}

export const AuditoriaTransicoesService = {
  async getAll(
    entidade?: string,
    registroId?: string,
    limit: number = 100,
  ): Promise<AuditoriaTransicao[]> {
    let query = supabase
      .from('auditoria_transicoes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (entidade && entidade !== 'all') {
      query = query.eq('entidade', entidade)
    }

    if (registroId) {
      query = query.eq('registro_id', registroId)
    }

    const { data, error } = await query
    if (error) throw error
    return (data as AuditoriaTransicao[]) || []
  },

  /**
   * Registra uma transição de estado na trilha de auditoria.
   *
   * A escrita direta na tabela foi revogada (a policy de INSERT com
   * `WITH CHECK (true)` permitia que qualquer usuário autenticado forjasse
   * registros). O único caminho é a RPC `app_registrar_auditoria`, que:
   *   - exige staff (admin/operador) no servidor;
   *   - deriva o operador de auth.uid() e public.profiles, ignorando qualquer
   *     identidade enviada pelo cliente.
   *
   * O parâmetro `operadorNome` é mantido só por compatibilidade de assinatura e
   * não é enviado ao banco: quem assina o registro é o usuário logado.
   */
  async registrar(
    entidade: string,
    registroId: string,
    estadoAnterior: string | null,
    estadoNovo: string,
    _operadorNome: string = 'Sistema',
    motivo?: string,
    payload?: any,
  ): Promise<void> {
    const { error } = await (supabase.rpc as any)('app_registrar_auditoria', {
      p_entidade: entidade,
      p_registro_id: String(registroId),
      p_estado_anterior: estadoAnterior,
      p_estado_novo: estadoNovo,
      p_motivo: motivo || null,
      p_payload: payload || null,
    })

    if (error) console.warn('Erro ao registrar transição de estado:', error)
  },
}
