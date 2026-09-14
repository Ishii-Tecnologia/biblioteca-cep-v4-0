import { supabase } from '@/lib/supabase/client'

export interface Categoria {
  id: number
  nome: string
  created_at: string
}

export const CategoriasService = {
  async getAll(): Promise<Categoria[]> {
    const { data, error } = await (supabase.from('categorias' as any) as any)
      .select('*')
      .order('nome', { ascending: true })

    if (error) {
      console.error('Erro ao buscar categorias:', error)
      throw error
    }
    return (data as Categoria[]) || []
  },

  async create(nome: string): Promise<Categoria> {
    const trimmed = nome.trim()
    if (!trimmed) throw new Error('O nome da categoria não pode ser vazio.')

    const { data, error } = await (supabase.from('categorias' as any) as any)
      .insert({ nome: trimmed })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new Error('Já existe uma categoria cadastrada com este nome.')
      }
      throw error
    }
    return data as Categoria
  },

  async update(id: number, oldNome: string, newNome: string): Promise<Categoria> {
    const trimmedNew = newNome.trim()
    const trimmedOld = oldNome.trim()
    if (!trimmedNew) throw new Error('O nome da categoria não pode ser vazio.')

    // 1. Atualiza na tabela categorias
    const { data, error } = await (supabase.from('categorias' as any) as any)
      .update({ nome: trimmedNew })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new Error('Já existe uma categoria cadastrada com este nome.')
      }
      throw error
    }

    // 2. Cascata: atualiza todos os títulos com a categoria antiga para o novo nome
    if (trimmedOld && trimmedOld !== trimmedNew) {
      const { error: cascadeError } = await supabase
        .from('titulo')
        .update({ categoria: trimmedNew })
        .eq('categoria', trimmedOld)

      if (cascadeError) {
        console.error('Erro ao atualizar títulos em cascata:', cascadeError)
      }
    }

    return data as Categoria
  },

  async delete(id: number, nome: string): Promise<void> {
    const trimmedNome = nome.trim()

    // 1. Desvincula a categoria em todos os títulos associados (seta para null)
    if (trimmedNome) {
      const { error: unbindError } = await supabase
        .from('titulo')
        .update({ categoria: null })
        .eq('categoria', trimmedNome)

      if (unbindError) {
        console.error('Erro ao desvincular categoria dos títulos:', unbindError)
      }
    }

    // 2. Exclui a categoria da tabela categorias
    const { error } = await (supabase.from('categorias' as any) as any).delete().eq('id', id)

    if (error) throw error
  },
}
