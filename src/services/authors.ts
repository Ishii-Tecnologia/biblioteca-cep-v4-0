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

/**
 * Normaliza o nome do autor para comparação segura:
 * remove acentos e diacríticos, passa para minúsculas, limpa espaços múltiplos.
 */
export function normalizeAuthorName(name: string): string {
  if (!name) return ''
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Retorna o rótulo legível em português para o tipo de autoria.
 */
export function getAuthorTypeLabel(type: AuthorType | string): string {
  switch (type) {
    case 'ESPIRITO':
      return 'Espírito'
    case 'MEDIUM':
      return 'Médium'
    case 'ENCARNADO':
      return 'Autor Convencional'
    default:
      return 'Autor'
  }
}

export const AuthorsService = {
  normalizeName: normalizeAuthorName,
  getTypeLabel: getAuthorTypeLabel,

  /**
   * Verifica se já existe algum autor cadastrado com o mesmo nome (ignorando maiúsculas e acentos),
   * independente do tipo (Espírito, Médium ou Autor Convencional).
   * Se excludeId for fornecido, ignora o próprio registro (útil na edição).
   */
  async findDuplicate(
    name: string,
    excludeId?: string,
  ): Promise<{ duplicate: boolean; existingAuthor?: Author; message?: string }> {
    const trimmed = name.trim()
    if (!trimmed) {
      return { duplicate: false }
    }

    const normInput = normalizeAuthorName(trimmed)

    // Buscar todos os autores para checagem com remoção de acentos em memória
    // (número pequeno de autores na base)
    const { data, error } = await (supabase.from('authors' as any) as any).select('*')
    if (error || !data) {
      return { duplicate: false }
    }

    const match = (data as Author[]).find((a) => {
      if (excludeId && a.id === excludeId) return false
      return normalizeAuthorName(a.name) === normInput
    })

    if (match) {
      const typeLabel = getAuthorTypeLabel(match.type)
      return {
        duplicate: true,
        existingAuthor: match,
        message: `"${match.name}" já está cadastrado como ${typeLabel}.`,
      }
    }

    return { duplicate: false }
  },
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

    // Tentar localizar existente por normalização de nome independente do tipo
    const check = await this.findDuplicate(trimmed)
    if (check.duplicate && check.existingAuthor) {
      return check.existingAuthor
    }

    // Se não existir duplicado, criar novo
    return await this.create(trimmed, type)
  },

  /**
   * Cria um novo autor/médium/espírito validando a regra de unicidade de nome:
   * não será permitido que o nome se repita independente se for médium, espírito ou autor convencional.
   */
  async create(name: string, type: AuthorType): Promise<Author> {
    const trimmed = name.trim()
    if (!trimmed) {
      throw new Error('O nome do autor/espírito/médium é obrigatório.')
    }

    // Validação de unicidade no frontend/serviço (independente de tipo, sem diferenciar acentos ou maiúsculas)
    const check = await this.findDuplicate(trimmed)
    if (check.duplicate && check.existingAuthor) {
      const typeLabel = getAuthorTypeLabel(check.existingAuthor.type)
      throw new Error(`"${check.existingAuthor.name}" já está cadastrado como ${typeLabel}.`)
    }

    // Tentar chamar a RPC segura do backend create_author_safe
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('create_author_safe', {
      p_name: trimmed,
      p_type: type,
    })

    if (!rpcError && rpcData) {
      const res = rpcData as any
      if (res.success === false) {
        throw new Error(res.error || 'Erro ao cadastrar autor.')
      }
      if (res.author) {
        return res.author as Author
      }
    }

    // Fallback caso RPC não responda
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
   * Atualiza o nome de um autor/médium/espírito e reflete a alteração em cascata em todos os livros cadastrados
   */
  async update(
    id: string,
    name: string,
    type?: AuthorType,
  ): Promise<{ author: Author; updatedBooksCount: number }> {
    const trimmed = name.trim()
    if (!trimmed) {
      throw new Error('O nome não pode ficar vazio.')
    }

    // Validação de unicidade no frontend/serviço:
    // Não pode conflitar com outro registro (exceto o próprio sendo editado)
    const check = await this.findDuplicate(trimmed, id)
    if (check.duplicate && check.existingAuthor) {
      const typeLabel = getAuthorTypeLabel(check.existingAuthor.type)
      throw new Error(`"${check.existingAuthor.name}" já está cadastrado como ${typeLabel}.`)
    }

    // Tentar executar via RPC segura update_author_cascade
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
      'update_author_cascade',
      {
        p_author_id: id,
        p_new_name: trimmed,
        p_new_type: type || null,
      },
    )

    if (!rpcError && rpcData) {
      const res = rpcData as any
      if (res.success === false) {
        throw new Error(res.error || 'Erro ao atualizar autor em cascata.')
      }

      // Buscar autor atualizado
      const { data: updatedAuthor, error: fetchErr } = await (
        supabase.from('authors' as any) as any
      )
        .select('*')
        .eq('id', id)
        .single()

      if (fetchErr) throw fetchErr

      return {
        author: updatedAuthor as Author,
        updatedBooksCount: res.updated_books_count ?? 0,
      }
    }

    // Fallback caso RPC não esteja disponível por algum motivo
    const { data, error } = await (supabase.from('authors' as any) as any)
      .update({ name: trimmed })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return {
      author: data as Author,
      updatedBooksCount: 0,
    }
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
   * Exclui um autor da lista gerenciada e desvincula os livros correspondentes (deixando o campo autor vazio/null).
   * Retorna a quantidade de livros afetados.
   */
  async delete(id: string): Promise<{ affectedBooksCount: number; deletedAuthorName: string }> {
    // Executa via RPC segura delete_author_cascade
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
      'delete_author_cascade',
      {
        p_author_id: id,
      },
    )

    if (!rpcError && rpcData) {
      const res = rpcData as any
      if (res.success === false) {
        throw new Error(res.error || 'Erro ao excluir autor.')
      }

      return {
        affectedBooksCount: res.affected_books_count ?? 0,
        deletedAuthorName: res.deleted_author_name ?? '',
      }
    }

    // Fallback caso RPC falhe
    const { error } = await (supabase.from('authors' as any) as any).delete().eq('id', id)
    if (error) throw error

    return {
      affectedBooksCount: 0,
      deletedAuthorName: '',
    }
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
