import { supabase } from '@/lib/supabase/client'

export interface Curso {
  id: string
  nome: string
  ativo: boolean
  created_at?: string
  updated_at?: string
}

export interface LeitorCursoItem {
  id: string
  id_leitor: number
  id_curso: string
  created_at?: string
  curso?: Curso
}

export const CursosService = {
  /**
   * Retorna todos os cursos cadastrados ordenados por nome.
   */
  async getAll(): Promise<Curso[]> {
    const { data, error } = await supabase
      .from('cursos' as any)
      .select('*')
      .order('nome', { ascending: true })

    if (error) {
      console.error('Erro ao buscar cursos:', error)
      throw error
    }

    return (data || []) as unknown as Curso[]
  },

  /**
   * Cadastra um novo curso na CEP.
   */
  async create(nome: string): Promise<Curso> {
    const trimmed = nome.trim()
    if (!trimmed) {
      throw new Error('O nome do curso é obrigatório.')
    }

    const { data, error } = await supabase
      .from('cursos' as any)
      .insert({ nome: trimmed, ativo: true })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new Error(`O curso "${trimmed}" já está cadastrado.`)
      }
      throw error
    }

    return data as unknown as Curso
  },

  /**
   * Atualiza o nome de um curso existente.
   * O ON UPDATE CASCADE nas FKs reflete a mudança automaticamente nos leitores.
   */
  async update(id: string, oldNome: string, newNome: string): Promise<Curso> {
    const trimmed = newNome.trim()
    if (!trimmed) {
      throw new Error('O nome do curso não pode ficar vazio.')
    }

    const { data, error } = await supabase
      .from('cursos' as any)
      .update({ nome: trimmed, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new Error(`Já existe um curso com o nome "${trimmed}".`)
      }
      throw error
    }

    // Como garantia adicional para sincronização em caso de drivers sem cascata de string
    if (oldNome && oldNome !== trimmed) {
      try {
        await supabase
          .from('leitor' as any)
          .update({ curso: trimmed })
          .eq('curso', oldNome)
        await supabase
          .from('profiles' as any)
          .update({ curso: trimmed })
          .eq('curso', oldNome)
      } catch (cascadeErr) {
        console.warn('Aviso ao sincronizar curso em leitor/profiles:', cascadeErr)
      }
    }

    return data as unknown as Curso
  },

  /**
   * Exclui um curso com desvinculação segura.
   */
  async delete(id: string, nome: string): Promise<void> {
    // 1. Desvincular de leitor_curso (cascata automática pelo FK, mas limpamos expressamente)
    await supabase
      .from('leitor_curso' as any)
      .delete()
      .eq('id_curso', id)

    // 2. Desvincular do campo de fallback em leitor e profiles
    if (nome) {
      await supabase
        .from('leitor' as any)
        .update({ curso: null })
        .eq('curso', nome)
      await supabase
        .from('profiles' as any)
        .update({ curso: null })
        .eq('curso', nome)
    }

    // 3. Excluir o registro do curso
    const { error } = await supabase
      .from('cursos' as any)
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  /**
   * Retorna os cursos vinculados a um leitor específico.
   */
  async getCursosByLeitor(id_leitor: number): Promise<Curso[]> {
    // 1. Buscar vínculos na tabela relacional leitor_curso
    const { data, error } = await supabase
      .from('leitor_curso' as any)
      .select('id, id_curso, cursos:id_curso (id, nome, ativo)')
      .eq('id_leitor', id_leitor)

    if (error) {
      console.warn('Erro ao carregar cursos do leitor:', error)
    }

    const list: Curso[] = []
    const seenIds = new Set<string>()

    if (data && Array.isArray(data)) {
      for (const item of data as any[]) {
        if (item.cursos && item.cursos.nome) {
          const cId = item.cursos.id || item.id_curso
          if (!seenIds.has(cId)) {
            seenIds.add(cId)
            list.push({
              id: cId,
              nome: item.cursos.nome,
              ativo: item.cursos.ativo ?? true,
            })
          }
        }
      }
    }

    // 2. Fallback resiliente: se a tabela relacional não trouxe cursos, checar a coluna direta 'curso' no leitor
    if (list.length === 0) {
      try {
        const { data: leitorData } = await supabase
          .from('leitor')
          .select('curso')
          .eq('id_leitor', id_leitor)
          .maybeSingle()

        if (leitorData && (leitorData as any).curso) {
          const cursoNome = (leitorData as any).curso.trim()
          if (cursoNome) {
            const { data: cursoMatch } = await supabase
              .from('cursos' as any)
              .select('id, nome, ativo')
              .ilike('nome', cursoNome)
              .maybeSingle()

            if (cursoMatch) {
              list.push({
                id: (cursoMatch as any).id,
                nome: (cursoMatch as any).nome,
                ativo: (cursoMatch as any).ativo ?? true,
              })
              // Sincroniza em segundo plano na tabela relacional para consultas futuras
              Promise.resolve(
                supabase
                  .from('leitor_curso' as any)
                  .insert({ id_leitor, id_curso: (cursoMatch as any).id }),
              ).catch(() => {})
            }
          }
        }
      } catch (fallbackErr) {
        console.warn('Fallback curso leitor:', fallbackErr)
      }
    }

    return list
  },

  /**
   * Sincroniza a lista de cursos de um leitor (adiciona novos, remove desmarcados).
   */
  async setCursosForLeitor(id_leitor: number, cursoIds: string[]): Promise<void> {
    if (!id_leitor) return

    const uniqueIds = Array.from(new Set((cursoIds || []).filter(Boolean)))

    // 1. Tentativa principal: RPC com SECURITY DEFINER (sync_leitor_cursos)
    // Isso garante sincronização atômica em leitor_curso, leitor.curso e profiles.curso sem problemas de RLS
    try {
      const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)('sync_leitor_cursos', {
        p_id_leitor: id_leitor,
        p_curso_ids: uniqueIds,
      })

      if (!rpcErr && rpcData && rpcData.success !== false) {
        return
      }
      if (rpcErr) {
        console.warn(
          '[CursosService] RPC sync_leitor_cursos falhou, executando fallback direto:',
          rpcErr,
        )
      }
    } catch (rpcEx) {
      console.warn('[CursosService] Exceção na chamada da RPC sync_leitor_cursos:', rpcEx)
    }

    // 2. Fallback resiliente direto caso a RPC encontre qualquer problema
    // 2.1. Remover cursos anteriores
    const { error: delErr } = await supabase
      .from('leitor_curso' as any)
      .delete()
      .eq('id_leitor', id_leitor)

    if (delErr) {
      console.error('[CursosService] Erro ao limpar leitor_curso no fallback:', delErr)
    }

    // 2.2. Inserir novos vínculos únicos
    if (uniqueIds.length > 0) {
      const rows = uniqueIds.map((id_curso) => ({
        id_leitor,
        id_curso,
      }))
      const { error: insErr } = await supabase.from('leitor_curso' as any).insert(rows)
      if (insErr) {
        console.error('[CursosService] Erro ao inserir leitor_curso no fallback:', insErr)
        throw insErr
      }
    }

    // 2.3. Sincronizar leitor.curso com o primeiro curso ou null
    try {
      let primaryCursoNome: string | null = null
      if (uniqueIds.length > 0) {
        const { data: cursoRow } = await supabase
          .from('cursos' as any)
          .select('nome')
          .eq('id', uniqueIds[0])
          .maybeSingle()
        if (cursoRow && (cursoRow as any).nome) {
          primaryCursoNome = (cursoRow as any).nome
        }
      }

      await supabase.from('leitor').update({ curso: primaryCursoNome }).eq('id_leitor', id_leitor)
    } catch (syncColErr) {
      console.warn('[CursosService] Aviso ao atualizar leitor.curso no fallback:', syncColErr)
    }
  },
}
