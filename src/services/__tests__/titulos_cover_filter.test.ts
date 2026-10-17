import { describe, it, expect, vi } from 'vitest'
import { TitulosService } from '../titulos'
import { supabase } from '@/lib/supabase/client'

describe('TitulosService.getAll coverFilter', () => {
  it('filtra livros sem foto de capa (sem_capa)', async () => {
    const mockData = [
      {
        id_titulo: 'LV-001',
        titulo_de_livro: 'Livro Com Capa',
        autor: 'Autor Teste',
        capa_url: 'https://example.com/capa.jpg',
        ativo: true,
        colecao: 'geral',
        exemplar: [{ id_exemplar: 'LV-001-1', seq: 1, status: 'DISPONIVEL' }],
      },
      {
        id_titulo: 'LV-002',
        titulo_de_livro: 'Livro Sem Capa Nula',
        autor: 'Autor Teste 2',
        capa_url: null,
        ativo: true,
        colecao: 'geral',
        exemplar: [{ id_exemplar: 'LV-002-1', seq: 1, status: 'DISPONIVEL' }],
      },
      {
        id_titulo: 'LV-003',
        titulo_de_livro: 'Livro Sem Capa Vazia',
        autor: 'Autor Teste 3',
        capa_url: '   ',
        ativo: true,
        colecao: 'diretoria',
        exemplar: [{ id_exemplar: 'LV-003-1', seq: 1, status: 'DISPONIVEL' }],
      },
    ]

    const queryMock = {
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      then: (resolve: any) => resolve({ data: mockData, error: null }),
    }

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnValue(queryMock),
    } as any)

    // 1. Sem filtro de capa ('all')
    const allResults = await TitulosService.getAll('', 'all', true, 'all', 'all', 'all', 'all')
    expect(allResults.length).toBe(3)

    // 2. Filtro 'sem_capa'
    const semCapaResults = await TitulosService.getAll(
      '',
      'all',
      true,
      'all',
      'all',
      'all',
      'sem_capa',
    )
    expect(semCapaResults.length).toBe(2)
    expect(semCapaResults.map((b) => b.id_titulo)).toEqual(['LV-002', 'LV-003'])

    // 3. Filtro 'com_capa'
    const comCapaResults = await TitulosService.getAll(
      '',
      'all',
      true,
      'all',
      'all',
      'all',
      'com_capa',
    )
    expect(comCapaResults.length).toBe(1)
    expect(comCapaResults[0].id_titulo).toBe('LV-001')
  })
})
