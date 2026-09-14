import { supabase } from '@/lib/supabase/client'
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/supabase/types'
import { HistoricoService } from './historico'
import { normalizeAndValidateIsbn, formatAuthorDisplay } from './isbn'

export type Titulo = Tables<'titulo'> & {
  autor_espiritual?: string | null
  autor_mediunico?: string | null
  author_id?: string | null
}

export type TituloInsert = TablesInsert<'titulo'> & {
  autor_espiritual?: string | null
  autor_mediunico?: string | null
  author_id?: string | null
}

export type TituloUpdate = TablesUpdate<'titulo'> & {
  autor_espiritual?: string | null
  autor_mediunico?: string | null
  author_id?: string | null
}

export interface TituloWithStats extends Titulo {
  total_exemplares: number
  exemplares_disponiveis: number
  exemplares_emprestados: number
  exemplares_manutencao: number
  autor_formatado: string
}

export interface TotaisAcervo {
  totalTitulos: number
  totalExemplares: number
  totalDisponiveis: number
  totalEmprestados: number
  totalManutencao: number
  totalPerdidos: number
}

export interface TotaisSeparadosPorColecao {
  geral: TotaisAcervo
  diretoria: TotaisAcervo
  totalGeral: TotaisAcervo
}

export const TitulosService = {
  async getAll(
    searchQuery?: string,
    category?: string,
    onlyActive = true,
    statusFilter?: string,
    colecao?: 'geral' | 'diretoria' | 'all',
  ) {
    let query = supabase
      .from('titulo')
      .select('*, exemplar(id_exemplar, seq, status, localizacao)')
      .order('titulo_de_livro', { ascending: true })

    if (onlyActive) {
      query = query.eq('ativo', true)
    }

    if (colecao && colecao !== 'all') {
      query = query.eq('colecao', colecao)
    }

    if (category && category !== 'all') {
      query = query.eq('categoria', category)
    }

    if (searchQuery && searchQuery.trim()) {
      const q = `%${searchQuery.trim()}%`
      query = query.or(
        `titulo_de_livro.ilike.${q},autor.ilike.${q},autor_espiritual.ilike.${q},autor_mediunico.ilike.${q},editora.ilike.${q},isbn.ilike.${q},id_titulo.ilike.${q}`,
      )
    }

    const { data, error } = await query
    if (error) throw error

    let formatted: TituloWithStats[] = (data || []).map((item: any) => {
      const exemplares = item.exemplar || []
      const total = exemplares.length
      const disponiveis = exemplares.filter((e: any) => e.status === 'Disponivel').length
      const emprestados = exemplares.filter((e: any) => e.status === 'Emprestado').length
      const manutencao = exemplares.filter(
        (e: any) =>
          e.status === 'Manutencao' ||
          e.status === 'EM_MANUTENCAO' ||
          e.status === 'Em Manutencao' ||
          e.status === 'Perdido',
      ).length

      const autorFormatado = formatAuthorDisplay(
        item.autor_espiritual,
        item.autor_mediunico,
        item.autor,
      )

      return {
        id_titulo: item.id_titulo,
        titulo_de_livro: item.titulo_de_livro,
        autor: item.autor,
        autor_espiritual: item.autor_espiritual || null,
        autor_mediunico: item.autor_mediunico || null,
        author_id: item.author_id || null,
        editora: item.editora,
        ano_publicacao: item.ano_publicacao,
        isbn: item.isbn,
        categoria: item.categoria,
        sinopse: item.sinopse || null,
        vol: item.vol || 0,
        capa_url: item.capa_url,
        ativo: item.ativo,
        colecao: item.colecao || 'geral',
        created_at: item.created_at,
        total_exemplares: total,
        exemplares_disponiveis: disponiveis,
        exemplares_emprestados: emprestados,
        exemplares_manutencao: manutencao,
        autor_formatado: autorFormatado,
      }
    })

    if (statusFilter && statusFilter !== 'all') {
      if (
        statusFilter === 'manutencao' ||
        statusFilter === 'Manutencao' ||
        statusFilter === 'EM_MANUTENCAO'
      ) {
        formatted = formatted.filter((t) => t.exemplares_manutencao > 0)
      } else if (statusFilter === 'disponivel' || statusFilter === 'Disponivel') {
        formatted = formatted.filter((t) => t.exemplares_disponiveis > 0)
      } else if (statusFilter === 'emprestado' || statusFilter === 'Emprestado') {
        formatted = formatted.filter((t) => t.exemplares_emprestados > 0)
      }
    }

    return formatted
  },

  async getById(id_titulo: string) {
    const { data, error } = await supabase
      .from('titulo')
      .select('*, exemplar(*)')
      .eq('id_titulo', id_titulo)
      .single()

    if (error) throw error
    return data
  },

  async getTotais(colecao?: 'geral' | 'diretoria'): Promise<TotaisAcervo> {
    let titQuery = supabase
      .from('titulo')
      .select('*', { count: 'exact', head: true })
      .eq('ativo', true)

    if (colecao) {
      titQuery = titQuery.eq('colecao', colecao)
    }

    let exQuery = supabase
      .from('exemplar')
      .select('status, id_titulo, titulo!inner(colecao, ativo)')
    if (colecao) {
      exQuery = exQuery.eq('titulo.colecao', colecao)
    }

    const [{ count: totalTitulos, error: titErr }, { data: exemplares, error: exErr }] =
      await Promise.all([titQuery, exQuery])

    if (titErr) throw titErr
    if (exErr) throw exErr

    const allEx = exemplares || []
    const totalExemplares = allEx.length
    const totalDisponiveis = allEx.filter((e: any) => e.status === 'Disponivel').length
    const totalEmprestados = allEx.filter((e: any) => e.status === 'Emprestado').length
    const totalManutencao = allEx.filter(
      (e: any) =>
        e.status === 'Manutencao' || e.status === 'EM_MANUTENCAO' || e.status === 'Em Manutencao',
    ).length
    const totalPerdidos = allEx.filter((e: any) => e.status === 'Perdido').length

    return {
      totalTitulos: totalTitulos || 0,
      totalExemplares,
      totalDisponiveis,
      totalEmprestados,
      totalManutencao,
      totalPerdidos,
    }
  },

  async getTotaisDetalhadosPorColecao(): Promise<TotaisSeparadosPorColecao> {
    const [geral, diretoria] = await Promise.all([
      this.getTotais('geral'),
      this.getTotais('diretoria'),
    ])

    return {
      geral,
      diretoria,
      totalGeral: {
        totalTitulos: geral.totalTitulos + diretoria.totalTitulos,
        totalExemplares: geral.totalExemplares + diretoria.totalExemplares,
        totalDisponiveis: geral.totalDisponiveis + diretoria.totalDisponiveis,
        totalEmprestados: geral.totalEmprestados + diretoria.totalEmprestados,
        totalManutencao: geral.totalManutencao + diretoria.totalManutencao,
        totalPerdidos: geral.totalPerdidos + diretoria.totalPerdidos,
      },
    }
  },

  async generateId(autor: string, titulo: string): Promise<string> {
    try {
      const { data, error } = await supabase.rpc('gerar_id_titulo', {
        p_autor: autor,
        p_titulo: titulo || '',
      })
      if (error || !data) {
        const clean = autor.replace(/[^a-zA-Z]/g, '').toUpperCase()
        const code = clean.length >= 2 ? clean.substring(0, 2) : (clean + 'XX').substring(0, 2)
        const randomNum = Math.floor(100 + Math.random() * 900)
        return `${code}-${randomNum}`
      }
      return data
    } catch {
      const clean = autor.replace(/[^a-zA-Z]/g, '').toUpperCase()
      const code = clean.length >= 2 ? clean.substring(0, 2) : (clean + 'XX').substring(0, 2)
      const randomNum = Math.floor(100 + Math.random() * 900)
      return `${code}-${randomNum}`
    }
  },

  /**
   * Verifica se o ISBN já está cadastrado em outro livro (unicidade)
   */
  async checkIsbnExists(isbn: string, excludeIdTitulo?: string): Promise<boolean> {
    const val = normalizeAndValidateIsbn(isbn)
    const clean = val.valid ? val.isbn13 : isbn.trim()

    let q = supabase.from('titulo').select('id_titulo').eq('isbn', clean)
    if (excludeIdTitulo) {
      q = q.neq('id_titulo', excludeIdTitulo)
    }
    const { data, error } = await q.maybeSingle()
    if (error) return false
    return !!data
  },

  /**
   * Busca um livro pelo ISBN para validação detalhada de duplicidade
   */
  async findByIsbn(
    isbn: string,
    excludeIdTitulo?: string,
  ): Promise<{ id_titulo: string; titulo_de_livro: string; autor: string; isbn: string } | null> {
    const val = normalizeAndValidateIsbn(isbn)
    const clean = val.valid ? val.isbn13 : isbn.trim()
    if (!clean) return null

    let q = supabase
      .from('titulo')
      .select('id_titulo, titulo_de_livro, autor, isbn')
      .eq('isbn', clean)

    if (excludeIdTitulo) {
      q = q.neq('id_titulo', excludeIdTitulo)
    }

    const { data, error } = await q.maybeSingle()
    if (error || !data) return null
    return data
  },

  async create(
    titulo: TituloInsert,
    numExemplares = 1,
    localizacaoPadrao = 'Estante Geral',
    operador?: { nome?: string; id?: string },
    isDiretoria = false,
  ) {
    const isColecaoDiretoria = isDiretoria || titulo.colecao === 'diretoria'
    let normalizedIsbn: string | null = null

    // ISBN obrigatório apenas para acervo geral. Para diretoria, apostilas e documentos têm código próprio interno
    if (!isColecaoDiretoria) {
      if (!titulo.isbn || !titulo.isbn.trim()) {
        throw new Error('O código ISBN é obrigatório para novos cadastros no acervo.')
      }

      const isbnValidation = normalizeAndValidateIsbn(titulo.isbn)
      if (!isbnValidation.valid) {
        throw new Error(
          isbnValidation.error || 'ISBN inválido. Informe um ISBN-10 ou ISBN-13 válido.',
        )
      }
      normalizedIsbn = isbnValidation.isbn13

      // Checar unicidade
      const alreadyExists = await this.checkIsbnExists(normalizedIsbn)
      if (alreadyExists) {
        throw new Error(`O ISBN ${normalizedIsbn} já está cadastrado em outra obra no catálogo.`)
      }
    } else {
      // No contexto da diretoria, ISBN pode ficar vazio ou com qualquer código livre.
      // Nenhuma crítica/validação de formato ou duplicidade bloqueia o cadastro na diretoria.
      if (titulo.isbn && titulo.isbn.trim()) {
        const isbnValidation = normalizeAndValidateIsbn(titulo.isbn)
        normalizedIsbn = isbnValidation.valid ? isbnValidation.isbn13 : titulo.isbn.trim()
      } else {
        normalizedIsbn = null
      }
    }

    let id_titulo = titulo.id_titulo
    if (!id_titulo || !id_titulo.trim()) {
      const isSpiritMedium = !!(titulo.autor_espiritual || titulo.autor_mediunico)
      const { calculateBookCodePrefix, getNextBookCode } = await import('./book-code')
      const prefix = calculateBookCodePrefix(
        isSpiritMedium,
        titulo.autor_mediunico,
        titulo.autor_espiritual,
        titulo.autor,
        isColecaoDiretoria ? 'diretoria' : 'geral',
      )
      id_titulo = await getNextBookCode(prefix)
    }

    // Compor campo autor unificado
    const autorUnificado = formatAuthorDisplay(
      titulo.autor_espiritual,
      titulo.autor_mediunico,
      titulo.autor,
    )

    const newTitulo: any = {
      ...titulo,
      id_titulo: id_titulo.toUpperCase().trim(),
      autor: autorUnificado,
      autor_espiritual: titulo.autor_espiritual?.trim() || null,
      autor_mediunico: titulo.autor_mediunico?.trim() || null,
      author_id: titulo.author_id || null,
      isbn: normalizedIsbn,
      vol: titulo.vol || 0,
      ativo: titulo.ativo ?? true,
      colecao: isColecaoDiretoria ? 'diretoria' : titulo.colecao || 'geral',
    }

    const { data, error } = await supabase.from('titulo').insert(newTitulo).select().single()
    if (error) throw error

    // Create copies if requested
    if (numExemplares > 0) {
      const exemplaresToInsert = []
      for (let seq = 1; seq <= numExemplares; seq++) {
        exemplaresToInsert.push({
          id_exemplar: `${data.id_titulo}-${seq}`,
          id_titulo: data.id_titulo,
          seq: seq,
          status: 'Disponivel',
          localizacao: localizacaoPadrao,
        })
      }
      await supabase.from('exemplar').insert(exemplaresToInsert)
    }

    // Auditoria: registro de inclusão do título no acervo
    try {
      const nomeOp = operador?.nome || 'Operador'
      const idOp = operador?.id || null
      const descTitulo = `Inclusão do título "${data.titulo_de_livro}" (${data.id_titulo}) no acervo com ${numExemplares} exemplar(es)`
      await HistoricoService.log(
        data.id_titulo,
        'Inclusão de Livro',
        null,
        descTitulo,
        nomeOp,
        'titulo',
        idOp,
        `ISBN: ${data.isbn || '-'}; Categoria: ${data.categoria || 'Geral'}; Localização: ${localizacaoPadrao}`,
      )

      // Registrar também a criação dos exemplares iniciais
      if (numExemplares > 0) {
        for (let seq = 1; seq <= numExemplares; seq++) {
          const exemplarCode = `${data.id_titulo}-${seq}`
          await HistoricoService.log(
            exemplarCode,
            'Inclusão de Exemplar',
            null,
            `Inclusão do exemplar ${exemplarCode} do livro "${data.titulo_de_livro}" (${data.id_titulo})`,
            nomeOp,
            'exemplar',
            idOp,
            `Localização inicial: ${localizacaoPadrao}`,
          )
        }
      }
    } catch (auditErr) {
      console.error('Erro ao registrar auditoria na inclusão de título:', auditErr)
    }

    return data
  },

  async update(
    id_titulo: string,
    updates: TituloUpdate,
    operador?: { nome?: string; id?: string },
  ) {
    // Buscar estado anterior para auditoria descritiva de alterações
    let oldTitulo: any = null
    try {
      const { data: current } = await supabase
        .from('titulo')
        .select('*')
        .eq('id_titulo', id_titulo)
        .maybeSingle()
      oldTitulo = current
    } catch {
      // continua mesmo se não carregar
    }
    const isDiretoria =
      updates.colecao === 'diretoria' ||
      oldTitulo?.colecao === 'diretoria' ||
      id_titulo.startsWith('DIR-')

    let normalizedIsbn = updates.isbn
    if (updates.isbn && updates.isbn.trim()) {
      if (!isDiretoria) {
        const isbnValidation = normalizeAndValidateIsbn(updates.isbn)
        if (!isbnValidation.valid) {
          throw new Error(isbnValidation.error || 'ISBN inválido.')
        }
        normalizedIsbn = isbnValidation.isbn13

        const alreadyExists = await this.checkIsbnExists(normalizedIsbn, id_titulo)
        if (alreadyExists) {
          throw new Error(`O ISBN ${normalizedIsbn} já pertence a outro livro.`)
        }
      } else {
        const isbnValidation = normalizeAndValidateIsbn(updates.isbn)
        normalizedIsbn = isbnValidation.valid ? isbnValidation.isbn13 : updates.isbn.trim()
      }
    } else if (isDiretoria && updates.isbn !== undefined) {
      normalizedIsbn = null
    }

    const finalAutor = formatAuthorDisplay(
      updates.autor_espiritual,
      updates.autor_mediunico,
      updates.autor,
    )

    const updatePayload: any = {
      ...updates,
      autor: finalAutor,
      autor_espiritual:
        updates.autor_espiritual !== undefined
          ? updates.autor_espiritual?.trim() || null
          : undefined,
      autor_mediunico:
        updates.autor_mediunico !== undefined ? updates.autor_mediunico?.trim() || null : undefined,
      isbn: normalizedIsbn,
    }

    const { data, error } = await supabase
      .from('titulo')
      .update(updatePayload)
      .eq('id_titulo', id_titulo)
      .select()
      .single()

    if (error) throw error

    // Auditoria: registrar alteração do título
    try {
      const nomeOp = operador?.nome || 'Operador'
      const idOp = operador?.id || null
      const alterations: string[] = []

      if (oldTitulo) {
        if (updates.titulo_de_livro && updates.titulo_de_livro !== oldTitulo.titulo_de_livro) {
          alterations.push(`Título: "${oldTitulo.titulo_de_livro}" ➔ "${updates.titulo_de_livro}"`)
        }
        if (updates.autor && updates.autor !== oldTitulo.autor) {
          alterations.push(`Autor: "${oldTitulo.autor || '-'}" ➔ "${updates.autor}"`)
        }
        if (updates.categoria && updates.categoria !== oldTitulo.categoria) {
          alterations.push(`Categoria: "${oldTitulo.categoria || '-'}" ➔ "${updates.categoria}"`)
        }
        if (updates.editora && updates.editora !== oldTitulo.editora) {
          alterations.push(`Editora: "${oldTitulo.editora || '-'}" ➔ "${updates.editora}"`)
        }
        if (updates.isbn && updates.isbn !== oldTitulo.isbn) {
          alterations.push(`ISBN: "${oldTitulo.isbn || '-'}" ➔ "${updates.isbn}"`)
        }
        if (updates.ano_publicacao && updates.ano_publicacao !== oldTitulo.ano_publicacao) {
          alterations.push(`Ano: ${oldTitulo.ano_publicacao || '-'} ➔ ${updates.ano_publicacao}`)
        }
        if (updates.ativo !== undefined && updates.ativo !== oldTitulo.ativo) {
          alterations.push(
            `Status: ${oldTitulo.ativo ? 'Ativo' : 'Inativo'} ➔ ${updates.ativo ? 'Ativo' : 'Inativo'}`,
          )
        }
      }

      const descAlt =
        alterations.length > 0
          ? `Alteração do título "${data.titulo_de_livro}" (${data.id_titulo}): ${alterations.join('; ')}`
          : `Alteração no cadastro do título "${data.titulo_de_livro}" (${data.id_titulo})`

      await HistoricoService.log(
        data.id_titulo,
        'Alteração de Livro',
        null,
        descAlt,
        nomeOp,
        'titulo',
        idOp,
        alterations.length > 0 ? alterations.join(' | ') : null,
      )
    } catch (auditErr) {
      console.error('Erro ao registrar auditoria na alteração de título:', auditErr)
    }

    return data
  },

  async delete(id_titulo: string, operador?: { nome?: string; id?: string }) {
    // 0. Buscar dados completos do título antes de excluir para o log descritivo
    const { data: tituloData } = await supabase
      .from('titulo')
      .select('*')
      .eq('id_titulo', id_titulo)
      .maybeSingle()

    // 1. Buscar todos os exemplares vinculados ao título
    const { data: exemplares, error: exemplaresErr } = await supabase
      .from('exemplar')
      .select('id_exemplar, seq, status, localizacao')
      .eq('id_titulo', id_titulo)

    if (exemplaresErr) {
      throw new Error(`Erro ao verificar exemplares do título: ${exemplaresErr.message}`)
    }

    const copyList = exemplares || []
    const exemplarIds = copyList.map((e) => e.id_exemplar)

    // 2. Regra de negócio: só permitir excluir quando todos os exemplares do livro estiverem disponíveis
    // Bloquear com mensagem clara se houver exemplar emprestado, em manutenção ou reservado
    const nonAvailableCopies = copyList.filter(
      (c) => (c.status || '').toLowerCase() !== 'disponivel',
    )
    if (nonAvailableCopies.length > 0) {
      const summary = nonAvailableCopies
        .map((c) => `${c.id_exemplar} (${c.status})`)
        .slice(0, 3)
        .join(', ')
      const extra =
        nonAvailableCopies.length > 3 ? ` e mais ${nonAvailableCopies.length - 3}...` : ''
      throw new Error(
        `Não é possível excluir este livro porque há ${nonAvailableCopies.length} exemplar(es) não disponível(is) [${summary}${extra}]. Todos os exemplares devem estar com status "Disponível".`,
      )
    }

    // 3. Verificar se há empréstimos ativos em andamento em qualquer um dos exemplares
    if (exemplarIds.length > 0) {
      const { data: activeLoans, error: activeLoansErr } = await supabase
        .from('emprestimo')
        .select('id_emprestimo, id_exemplar')
        .in('id_exemplar', exemplarIds)
        .is('data_devolucao_real', null)

      if (activeLoansErr) {
        throw new Error(`Erro ao checar empréstimos: ${activeLoansErr.message}`)
      }

      if (activeLoans && activeLoans.length > 0) {
        throw new Error(
          `Não é possível excluir a obra pois há ${activeLoans.length} empréstimo(s) em andamento nos exemplares vinculados.`,
        )
      }
    }

    // 4. Verificar se há reservas ativas vinculadas ao título
    const { data: activeReservas, error: resErr } = await supabase
      .from('reserva')
      .select('id_reserva, status_reserva')
      .eq('id_titulo', id_titulo)
      .in('status_reserva', ['Ativa', 'Aguardando Retirada', 'Pendente'])

    if (resErr) {
      throw new Error(`Erro ao checar reservas: ${resErr.message}`)
    }

    if (activeReservas && activeReservas.length > 0) {
      throw new Error(
        `Não é possível excluir a obra pois há ${activeReservas.length} reserva(s) ativa(s) ou aguardando retirada para este título. Cancele as reservas antes de excluir.`,
      )
    }

    // 5. Tratar referências que impedem a deleção dos exemplares e do título por FK:
    // a) Desvincular reservas antigas/finalizadas que apontam para exemplar_reservado_id
    if (exemplarIds.length > 0) {
      const { error: clearResExemplarErr } = await supabase
        .from('reserva')
        .update({ exemplar_reservado_id: null })
        .in('exemplar_reservado_id', exemplarIds)

      if (clearResExemplarErr) {
        throw new Error(
          `Erro ao desvincular exemplares de reservas: ${clearResExemplarErr.message}`,
        )
      }

      // b) Excluir empréstimos já finalizados (devolvidos) vinculados a esses exemplares para permitir a exclusão do exemplar (FK emprestimo_id_exemplar_fkey)
      const { error: delLoansErr } = await supabase
        .from('emprestimo')
        .delete()
        .in('id_exemplar', exemplarIds)

      if (delLoansErr) {
        throw new Error(
          `Erro ao remover registros de empréstimos finalizados: ${delLoansErr.message}`,
        )
      }

      // c) Excluir PRIMEIRO todos os exemplares vinculados ao título
      const { error: delExemplarErr } = await supabase
        .from('exemplar')
        .delete()
        .eq('id_titulo', id_titulo)

      if (delExemplarErr) {
        throw new Error(`Erro ao excluir exemplares vinculados: ${delExemplarErr.message}`)
      }
    }

    // d) Remover reservas finalizadas/canceladas restantes do título (FK reserva_id_titulo_fkey)
    const { error: delReservasErr } = await supabase
      .from('reserva')
      .delete()
      .eq('id_titulo', id_titulo)

    if (delReservasErr) {
      throw new Error(
        `Erro ao remover registros de reservas deste título: ${delReservasErr.message}`,
      )
    }

    // 6. Excluir DEPOIS o título da tabela "titulo"
    const { error: delTituloErr } = await supabase
      .from('titulo')
      .delete()
      .eq('id_titulo', id_titulo)

    if (delTituloErr) {
      throw new Error(`Erro ao excluir título do acervo: ${delTituloErr.message}`)
    }

    // 7. Auditoria: registrar exclusão do título e seus exemplares
    try {
      const nomeOp = operador?.nome || 'Operador'
      const idOp = operador?.id || null
      const tituloNome = tituloData?.titulo_de_livro || id_titulo
      const totalExemplaresRemovidos = copyList.length
      const descExclusao =
        totalExemplaresRemovidos > 0
          ? `Exclusão do título "${tituloNome}" (${id_titulo}) e ${totalExemplaresRemovidos} exemplar(es) vinculado(s)`
          : `Exclusão do título "${tituloNome}" (${id_titulo})`

      const listaCodigos = copyList.map((e) => e.id_exemplar).join(', ')

      await HistoricoService.log(
        id_titulo,
        'Exclusão de Livro',
        null,
        descExclusao,
        nomeOp,
        'titulo',
        idOp,
        totalExemplaresRemovidos > 0 ? `Exemplares removidos: ${listaCodigos}` : null,
      )

      // Registrar também a exclusão individual de cada exemplar removido
      for (const ex of copyList) {
        await HistoricoService.log(
          ex.id_exemplar,
          'Exclusão de Exemplar',
          null,
          `Exclusão do exemplar ${ex.id_exemplar} devido à exclusão do livro "${tituloNome}" (${id_titulo})`,
          nomeOp,
          'exemplar',
          idOp,
          `Localização anterior: ${ex.localizacao || 'Estante Geral'}`,
        )
      }
    } catch (auditErr) {
      console.error('Erro ao registrar auditoria na exclusão de título:', auditErr)
    }
  },

  /**
   * Retorna todos os títulos do acervo com contagem de exemplares e localização representativa,
   * estruturados no formato de exportação de colunas do template oficial CSV.
   */
  async getAllForCsvExport(colecao?: 'geral' | 'diretoria' | 'all') {
    let query = supabase
      .from('titulo')
      .select('*, exemplar(id_exemplar, seq, status, localizacao)')
      .order('titulo_de_livro', { ascending: true })

    if (colecao && colecao !== 'all') {
      query = query.eq('colecao', colecao)
    }

    const { data, error } = await query

    if (error) throw error

    return (data || []).map((t: any) => {
      const exemplares = t.exemplar || []
      const exemplaresCount = exemplares.length > 0 ? exemplares.length : 1
      // Determina localização a partir dos exemplares (o primeiro que tiver preenchido ou 'Estante Geral')
      const firstLoc =
        exemplares.find((e: any) => e.localizacao && e.localizacao.trim())?.localizacao?.trim() ||
        'Estante Geral'

      // Se autor_espiritual ou autor_mediunico estiver preenchido, manter o autor limpo se for apenas autor convencional
      // No schema: titulo.autor guarda a string completa formatada se mediúnico, ou o nome do autor convencional.
      // Se tiver autor_espiritual / mediunico, o template usa autor para o encarnado convencional (ou vazio).
      const hasSpiritualOrMedium = !!(t.autor_espiritual || t.autor_mediunico)
      const autorConvencional = hasSpiritualOrMedium ? '' : t.autor || ''

      return {
        isbn: (t.isbn ?? '').trim(),
        titulo: (t.titulo_de_livro ?? '').trim(),
        autor_espiritual: (t.autor_espiritual ?? '').trim(),
        autor_mediunico: (t.autor_mediunico ?? '').trim(),
        autor: autorConvencional.trim(),
        editora: (t.editora ?? '').trim(),
        ano_publicacao: t.ano_publicacao ? String(t.ano_publicacao).trim() : '',
        categoria: (t.categoria ?? 'Geral').trim(),
        sinopse: (t.sinopse ?? '').trim(),
        exemplares: exemplaresCount,
        localizacao: firstLoc,
      }
    })
  },

  async getCategories(): Promise<string[]> {
    const { data: catData } = await (supabase.from('categorias' as any) as any)
      .select('nome')
      .order('nome', { ascending: true })
    if (catData && catData.length > 0) {
      return catData.map((c: any) => c.nome)
    }

    const { data } = await supabase.from('titulo').select('categoria')
    if (!data) return []
    const categories = new Set<string>()
    data.forEach((item) => {
      if (item.categoria && item.categoria.trim()) categories.add(item.categoria.trim())
    })
    return Array.from(categories).sort()
  },
}
