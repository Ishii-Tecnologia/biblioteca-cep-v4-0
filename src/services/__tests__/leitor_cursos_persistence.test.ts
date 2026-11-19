import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Teste da persistência de cursos de leitor.
 *
 * ANTES: este teste criava um leitor real no banco de produção
 * (`teste_curso_<timestamp>@exemplo.com`) e apagava no `finally`. Qualquer
 * execução de `vitest` inseria e removia registros no acervo real.
 *
 * AGORA: o client Supabase é mockado. O teste verifica a lógica do serviço:
 * que a criação do leitor dispara a sincronização de cursos, e que a
 * sincronização prefere a RPC transacional (`sync_leitor_cursos`).
 */

const rpcMock = vi.fn()
const fromMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: (...args: any[]) => rpcMock(...args),
    from: (...args: any[]) => fromMock(...args),
  },
}))

import { CursosService } from '@/services/cursos'

/** Cria um mock de query encadeável que resolve para `resultado`. */
function queryMock(resultado: { data?: any; error?: any }) {
  const q: any = {
    select: () => q,
    insert: () => q,
    update: () => q,
    delete: () => q,
    eq: () => q,
    in: () => q,
    ilike: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: async () => resultado,
    single: async () => resultado,
    then: (resolve: any) => resolve(resultado),
  }
  return q
}

describe('CursosService.setCursosForLeitor', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    fromMock.mockReset()
  })

  it('usa a RPC sync_leitor_cursos quando disponível e não cai no fallback direto', async () => {
    rpcMock.mockResolvedValue({ data: { success: true, cursos_count: 2 }, error: null })

    await CursosService.setCursosForLeitor(42, ['curso-a', 'curso-b', 'curso-a'])

    // IDs duplicados são deduplicados antes de chegar ao banco
    expect(rpcMock).toHaveBeenCalledWith('sync_leitor_cursos', {
      p_id_leitor: 42,
      p_curso_ids: ['curso-a', 'curso-b'],
    })

    // Com a RPC bem-sucedida nenhuma escrita direta em tabela acontece
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('cai no fallback direto quando a RPC falha', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'function not found' } })

    treatFromFallback()

    await CursosService.setCursosForLeitor(42, ['curso-a'])

    // O fallback limpa leitor_curso e insere o vínculo
    expect(fromMock).toHaveBeenCalledWith('leitor_curso')
    expect(fromMock).toHaveBeenCalledWith('leitor')
  })

  it('não chama o banco quando não há id_leitor', async () => {
    await CursosService.setCursosForLeitor(0 as any, ['curso-a'])

    expect(rpcMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })
})

/** Prepara fromMock para o caminho de fallback (delete/insert/update). */
function treatFromFallback() {
  fromMock.mockImplementation((tabela: string) => {
    if (tabela === 'cursos') {
      return queryMock({ data: { nome: 'Curso A' }, error: null })
    }
    return queryMock({ data: null, error: null })
  })
}
