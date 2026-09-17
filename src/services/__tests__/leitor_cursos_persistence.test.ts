import { describe, it, expect } from 'vitest'
import { LeitoresService } from '../leitores'
import { CursosService } from '../cursos'
import { supabase } from '@/lib/supabase/client'

describe('Validação no Banco ao Vivo: Persistência de Cursos de Leitor', () => {
  it('deve sincronizar cursos em leitor_curso e leitor.curso via RPC sync_leitor_cursos e CursosService', async () => {
    // 1. Obter cursos existentes
    const cursos = await CursosService.getAll()
    expect(cursos.length).toBeGreaterThan(0)

    const curso1 = cursos[0]
    const curso2 = cursos.length > 1 ? cursos[1] : cursos[0]
    const cursoIdsToSet = Array.from(new Set([curso1.id, curso2.id]))

    // 2. Criar um leitor temporário para teste
    const testEmail = `teste_curso_${Date.now()}@exemplo.com`
    const created = await LeitoresService.create({
      nome_do_leitor: 'Leitor Teste Persistencia Curso',
      email: testEmail,
      status_cadastro: 'ativo',
      cursos_ids: cursoIdsToSet,
    } as any)

    expect(created).toBeDefined()
    expect(created.id_leitor).toBeDefined()
    const idLeitor = created.id_leitor

    try {
      // 3. Verificar se o leitor foi salvo com curso na tabela leitor
      const { data: leitorRow, error: leitorErr } = await supabase
        .from('leitor')
        .select('id_leitor, curso')
        .eq('id_leitor', idLeitor)
        .single()

      expect(leitorErr).toBeNull()
      expect(leitorRow?.curso).toBeTruthy()

      // 4. Verificar se a tabela de relacionamento leitor_curso contém os vínculos
      const { data: vinculos, error: vinculosErr } = await supabase
        .from('leitor_curso')
        .select('id_curso')
        .eq('id_leitor', idLeitor)

      expect(vinculosErr).toBeNull()
      const boundIds = (vinculos || []).map((v: any) => v.id_curso)
      expect(boundIds).toContain(curso1.id)

      // 5. Testar o fluxo de EDIÇÃO: atualizar cursos para outro conjunto
      const novoCursoId = cursos[cursos.length - 1].id
      await LeitoresService.update(idLeitor, {
        nome_do_leitor: 'Leitor Teste Persistencia Curso Atualizado',
        cursos_ids: [novoCursoId],
      } as any)

      // 6. Verificar que a tabela de vínculo leitor_curso foi atualizada
      const cursosRecarregados = await CursosService.getCursosByLeitor(idLeitor)
      expect(cursosRecarregados.length).toBe(1)
      expect(cursosRecarregados[0].id).toBe(novoCursoId)

      // 7. Testar leitura via getAll do LeitoresService
      const allReaders = await LeitoresService.getAll('Leitor Teste Persistencia Curso Atualizado')
      const targetReader = allReaders.find((r) => r.id_leitor === idLeitor)
      expect(targetReader).toBeDefined()
      expect(targetReader?.cursos_ids).toContain(novoCursoId)
      expect(targetReader?.cursos_nomes?.length).toBeGreaterThan(0)
    } finally {
      // Limpeza segura do leitor de teste
      try {
        await supabase.from('leitor_curso').delete().eq('id_leitor', idLeitor)
        await supabase.from('leitor').delete().eq('id_leitor', idLeitor)
      } catch (cleanupErr) {
        console.warn('Erro ao limpar leitor de teste:', cleanupErr)
      }
    }
  })
})
