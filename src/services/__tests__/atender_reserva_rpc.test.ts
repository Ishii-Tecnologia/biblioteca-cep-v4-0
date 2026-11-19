import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Teste do fluxo de atendimento de reserva (ReservasService.fulfill).
 *
 * ANTES: este teste chamava o Supabase de produção com o client real, alterando
 * a reserva 17 e o exemplar DP-JA001-1 e tentando reverter no `finally`. Se a
 * reversão falhasse, o acervo real ficava inconsistente — e qualquer execução
 * de `vitest` mexia em dados de produção.
 *
 * AGORA: o client é mockado. O teste exercita a lógica do serviço (chamada da
 * RPC, tratamento da resposta, registro no histórico) sem tocar em banco algum.
 */

const rpcMock = vi.fn()
const logMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: (...args: any[]) => rpcMock(...args),
    from: vi.fn(),
  },
}))

vi.mock('@/services/historico', () => ({
  HistoricoService: { log: (...args: any[]) => logMock(...args) },
}))

vi.mock('@/services/parametros', () => ({
  getTempoReservaGarantidaHoras: async () => 24,
}))

import { ReservasService } from '@/services/reservas'

describe('ReservasService.fulfill', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    logMock.mockReset()
    logMock.mockResolvedValue(undefined)
  })

  it('atende a reserva pela RPC transacional e registra a transição no histórico', async () => {
    const respostaRpc = {
      success: true,
      id_reserva: 17,
      id_exemplar: 'DP-JA001-1',
      status_exemplar: 'BLOQUEADO',
      status_emprestimo: 'PENDENTE_RETIRADA',
      id_leitor: 42,
      livro_titulo: 'O Pequeno Príncipe',
      leitor_nome: 'Leitor de Teste',
      mensagem: 'Reserva atendida com sucesso!',
    }

    rpcMock.mockResolvedValue({ data: respostaRpc, error: null })

    const resultado = await ReservasService.fulfill(17, 'Operador de Teste')

    // A RPC é chamada com os parâmetros corretos e nada mais
    expect(rpcMock).toHaveBeenCalledWith('atender_reserva', {
      p_id_reserva: 17,
      p_operador_nome: 'Operador de Teste',
    })

    // A resposta da RPC é devolvida intacta para a camada de UI
    expect(resultado).toEqual(respostaRpc)
    expect(resultado.success).toBe(true)
    expect(resultado.status_exemplar).toBe('BLOQUEADO')
    expect(resultado.status_emprestimo).toBe('PENDENTE_RETIRADA')

    // O histórico recebe o exemplar e o leitor corretos
    expect(logMock).toHaveBeenCalledTimes(1)
    const [entidadeId, , leitorId] = logMock.mock.calls[0]
    expect(entidadeId).toBe('DP-JA001-1')
    expect(leitorId).toBe(42)
  })

  it('aceita resposta da RPC serializada como string JSON', async () => {
    rpcMock.mockResolvedValue({
      data: JSON.stringify({ success: true, id_reserva: 17, id_exemplar: 'DP-JA001-1' }),
      error: null,
    })

    const resultado = await ReservasService.fulfill(17)

    expect(resultado.success).toBe(true)
    expect(resultado.id_exemplar).toBe('DP-JA001-1')
  })

  it('propaga o erro da RPC quando não é "função inexistente"', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'O leitor está BLOQUEADO e não pode receber empréstimos.' },
    })

    await expect(ReservasService.fulfill(17)).rejects.toThrow(
      'O leitor está BLOQUEADO e não pode receber empréstimos.',
    )
    expect(logMock).not.toHaveBeenCalled()
  })
})
