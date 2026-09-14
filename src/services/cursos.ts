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
    const { data, error } = await supabase
      .from('leitor_curso' as any)
      .select('id, id_curso, cursos:id_curso (id, nome, ativo)')
      .eq('id_leitor', id_leitor)

    if (error) {
      console.warn('Erro ao carregar cursos do leitor:', error)
      return []
    }

    const list: Curso[] = []
    if (data && Array.isArray(data)) {
      for (const item of data as any[]) {
        if (item.cursos && item.cursos.nome) {
          list.push({
            id: item.cursos.id,
            nome: item.cursos.nome,
            ativo: item.cursos.ativo ?? true,
          })
        }
      }
    }
    return list
  },

  /**
   * Sincroniza a lista de cursos de um leitor (adiciona novos, remove desmarcados).
   */
  async setCursosForLeitor(id_leitor: number, cursoIds: string[]): Promise<void> {
    // 1. Remover cursos anteriores
    const { error: delErr } = await supabase
      .from('leitor_curso' as any)
      .delete()
      .eq('id_leitor', id_leitor)

    if (delErr) throw delErr

    // 2. Inserir novos vínculos únicos
    const uniqueIds = Array.from(new Set(cursoIds.filter(Boolean)))
    if (uniqueIds.length > 0) {
      const rows = uniqueIds.map((id_curso) => ({
        id_leitor,
        id_curso,
      }))
      const { error: insErr } = await supabase.from('leitor_curso' as any).insert(rows)
      if (insErr) throw insErr
    }
  },
}
