import { supabase } from '@/lib/supabase/client'

export type AuthorType = 'ESPIRITO' | 'ENCARNADO' | 'MEDIUM' | 'OUTRO'

export interface Author {
  id: string
  name: string
  type: AuthorType
  created_at: string
}

export interface LinkedBook {
  id_titulo: string
  titulo_de_livro: string
  autor?: string
  autor_espiritual?: string | null
  autor_mediunico?: string | null
}

export const AuthorsService = {
  /**
   * Busca autores com autocompletar incremental (mínimo 2 caracteres sugerido)
   * Case-insensitive, ordenado por relevância e nome, limitado a ~15 resultados
   */
  async search(query: string, type?: AuthorType, limit = 15): Promise<Author[]> {
    let req = (supabase.from('authors' as any) as any)
      .select('*')
      .order('name', { ascending: true })
      .limit(limit)

    if (query && query.trim().length >= 1) {
      req = req.ilike('name', `%${query.trim()}%`)
    }

    if (type) {
      req = req.eq('type', type)
    }

    const { data, error } = await req
    if (error) {
      console.warn('Erro ao buscar autores:', error)
      return []
    }
    return (data || []) as Author[]
  },

  /**
   * Retorna todos os autores, opcionalmente filtrados por tipo
   */
  async getAll(type?: AuthorType): Promise<Author[]> {
    let req = (supabase.from('authors' as any) as any)
      .select('*')
      .order('name', { ascending: true })

    if (type) {
      req = req.eq('type', type)
    }

    const { data, error } = await req
    if (error) {
      console.warn('Erro ao listar todos os autores:', error)
      return []
    }
    return (data || []) as Author[]
  },

  /**
   * Retorna os autores mais frequentes / populares
   */
  async getPopular(type?: AuthorType, limit = 20): Promise<Author[]> {
    let req = (supabase.from('authors' as any) as any)
      .select('*')
      .order('name', { ascending: true })
      .limit(limit)

    if (type) {
      req = req.eq('type', type)
    }

    const { data, error } = await req
    if (error) {
      console.warn('Erro ao obter autores populares:', error)
      return []
    }
    return (data || []) as Author[]
  },

  /**
   * Cria ou busca autor inline para não quebrar fluxo
   */
  async findOrCreate(name: string, type: AuthorType = 'ENCARNADO'): Promise<Author> {
    const trimmed = name.trim()
    if (!trimmed) {
      throw new Error('Nome do autor não pode ser vazio.')
    }

    // Tentar localizar existente case-insensitive
    const { data: existing } = await (supabase.from('authors' as any) as any)
      .select('*')
      .ilike('name', trimmed)
      .eq('type', type)
      .maybeSingle()

    if (existing) {
      return existing as Author
    }

    // Inserir novo autor
    const { data, error } = await (supabase.from('authors' as any) as any)
      .insert({
        name: trimmed,
        type: type,
      })
      .select()
      .single()

    if (error) {
      // Caso conflito simultâneo, buscar novamente
      const { data: fallback } = await (supabase.from('authors' as any) as any)
        .select('*')
        .ilike('name', trimmed)
        .eq('type', type)
        .single()
      if (fallback) return fallback as Author
      throw error
    }

    return data as Author
  },

  /**
   * Cria um novo autor/médium/espírito
   */
  async create(name: string, type: AuthorType): Promise<Author> {
    const trimmed = name.trim()
    if (!trimmed) {
      throw new Error('O nome do autor/espírito/médium é obrigatório.')
    }

    // Verificar se já existe com o mesmo nome e tipo (case insensitive)
    const { data: existing } = await (supabase.from('authors' as any) as any)
      .select('*')
      .ilike('name', trimmed)
      .eq('type', type)
      .maybeSingle()

    if (existing) {
      throw new Error(`Já existe um registro com o nome "${trimmed}" para este tipo.`)
    }

    const { data, error } = await (supabase.from('authors' as any) as any)
      .insert({
        name: trimmed,
        type: type,
      })
      .select()
      .single()

    if (error) throw error
    return data as Author
  },

  /**
   * Atualiza o nome de um autor/médium/espírito
   */
  async update(id: string, name: string): Promise<Author> {
    const trimmed = name.trim()
    if (!trimmed) {
      throw new Error('O nome não pode ficar vazio.')
    }

    const { data, error } = await (supabase.from('authors' as any) as any)
      .update({ name: trimmed })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Author
  },

  /**
   * Verifica se o autor/médium/espírito está sendo usado por livros no catálogo
   * Retorna a lista de livros que utilizam esse nome
   */
  async getLinkedBooks(authorName: string, type: AuthorType): Promise<LinkedBook[]> {
    const trimmed = authorName.trim().toLowerCase()
    if (!trimmed) return []

    // Buscar títulos que possuem esse nome nos campos correspondentes
    const { data, error } = await supabase
      .from('titulo')
      .select('id_titulo, titulo_de_livro, autor, autor_espiritual, autor_mediunico')

    if (error || !data) return []

    const linked: LinkedBook[] = []

    for (const book of data) {
      let isMatch = false
      const bAutor = (book.autor || '').toLowerCase()
      const bEspirito = (book.autor_espiritual || '').toLowerCase()
      const bMedium = (book.autor_mediunico || '').toLowerCase()

      if (type === 'ESPIRITO') {
        if (bEspirito === trimmed || bEspirito.includes(trimmed)) {
          isMatch = true
        }
      } else if (type === 'MEDIUM') {
        if (bMedium === trimmed || bMedium.includes(trimmed)) {
          isMatch = true
        }
      } else if (type === 'ENCARNADO') {
        if (bAutor === trimmed || bAutor.includes(trimmed) || bMedium === trimmed) {
          isMatch = true
        }
      } else {
        if (bAutor.includes(trimmed) || bEspirito.includes(trimmed) || bMedium.includes(trimmed)) {
          isMatch = true
        }
      }

      if (isMatch) {
        linked.push({
          id_titulo: book.id_titulo,
          titulo_de_livro: book.titulo_de_livro,
          autor: book.autor,
          autor_espiritual: book.autor_espiritual,
          autor_mediunico: book.autor_mediunico,
        })
      }
    }

    return linked
  },

  /**
   * Exclui um autor da lista de autores gerenciada.
   * Não apaga o nome do cadastro dos livros existentes.
   */
  async delete(id: string): Promise<void> {
    const { error } = await (supabase.from('authors' as any) as any).delete().eq('id', id)

    if (error) throw error
  },

  /**
   * Valida se um nome existe exatamente na lista de autores para o tipo especificado.
   * Usado na edição de livros para garantir que o autor/médium/espírito pertença à lista.
   */
  async existsInList(name: string, type: AuthorType | AuthorType[]): Promise<boolean> {
    const trimmed = name.trim()
    if (!trimmed) return false

    let req = (supabase.from('authors' as any) as any).select('id').ilike('name', trimmed)

    if (Array.isArray(type)) {
      req = req.in('type', type)
    } else {
      req = req.eq('type', type)
    }

    const { data, error } = await req.maybeSingle()
    if (error || !data) return false
    return true
  },
}
