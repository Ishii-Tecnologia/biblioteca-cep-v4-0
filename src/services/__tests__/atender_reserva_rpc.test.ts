import { describe, it, expect } from 'vitest'
import { supabase } from '@/lib/supabase/client'

describe('Validação no Banco ao Vivo: RPC atender_reserva', () => {
  it('deve chamar atender_reserva e reverter as alterações sem o erro "record is not assigned yet"', async () => {
    // Buscar o estado original da reserva 17 antes do teste
    const { data: reservaAntes, error: reservaAntesErr } = await supabase
      .from('reserva')
      .select(
        'id_reserva, id_titulo, id_leitor, status_reserva, status, exemplar_reservado_id, data_atendimento, data_limite_retirada, posicao_fila, ordem_fila',
      )
      .eq('id_reserva', 17)
      .single()

    expect(reservaAntesErr).toBeNull()
    expect(reservaAntes).toBeDefined()
    expect(reservaAntes?.id_reserva).toBe(17)

    // Buscar o estado original do exemplar do livro
    const { data: exemplarAntes, error: exemplarAntesErr } = await supabase
      .from('exemplar')
      .select('id_exemplar, status')
      .eq('id_exemplar', 'DP-JA001-1')
      .single()

    expect(exemplarAntesErr).toBeNull()

    let rpcResult: any = null
    let rpcError: any = null

    try {
      // Executa o RPC atender_reserva
      const { data, error } = await (supabase.rpc as any)('atender_reserva', {
        p_id_reserva: 17,
        p_operador_nome: 'Teste Automatizado Vitest',
      })
      rpcResult = data
      rpcError = error

      // Deve ter executado com sucesso e retornado os dados esperados
      expect(rpcError).toBeNull()
      expect(rpcResult).toBeDefined()

      const res = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult
      expect(res.success).toBe(true)
      expect(res.id_reserva).toBe(17)
      expect(res.id_exemplar).toBe('DP-JA001-1')
      expect(res.status_exemplar).toBe('BLOQUEADO')
      expect(res.status_emprestimo).toBe('PENDENTE_RETIRADA')
      expect(res.mensagem).toContain('Reserva atendida com sucesso!')
    } finally {
      // ROLLBACK / RESTAURAÇÃO: Garantir que os dados do banco retornem exatamente ao estado original
      if (rpcResult && rpcResult.id_emprestimo) {
        // Remover empréstimo criado no teste
        await supabase.from('emprestimo').delete().eq('id_emprestimo', rpcResult.id_emprestimo)
      }

      // Remover logs de auditoria criados durante o teste
      await supabase
        .from('auditoria_transicoes')
        .delete()
        .eq('operador_nome', 'Teste Automatizado Vitest')

      // Restaurar estado do exemplar
      if (exemplarAntes) {
        await supabase
          .from('exemplar')
          .update({ status: exemplarAntes.status })
          .eq('id_exemplar', 'DP-JA001-1')
      }

      // Restaurar estado da reserva 17
      if (reservaAntes) {
        await supabase
          .from('reserva')
          .update({
            status_reserva: reservaAntes.status_reserva,
            status: reservaAntes.status,
            exemplar_reservado_id: reservaAntes.exemplar_reservado_id,
            data_atendimento: reservaAntes.data_atendimento,
            data_limite_retirada: reservaAntes.data_limite_retirada,
            posicao_fila: reservaAntes.posicao_fila,
            ordem_fila: reservaAntes.ordem_fila,
          })
          .eq('id_reserva', 17)
      }
    }
  })
})
