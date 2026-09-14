export interface BookMetadata {
  isbn: string
  titulo_de_livro: string
  autor: string
  autor_espiritual?: string
  autor_mediunico?: string
  editora?: string
  ano_publicacao?: number
  categoria?: string
  sinopse?: string
  capa_url?: string
}

/**
 * Normaliza e limpa código ISBN / EAN (remove traços, espaços e caracteres inválidos)
 */
export function sanitizeIsbn(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/[^0-9X]/gi, '')
    .toUpperCase()
    .trim()
}

/**
 * Valida o dígito verificador do ISBN-10
 */
export function isValidIsbn10(isbn10: string): boolean {
  const clean = sanitizeIsbn(isbn10)
  if (clean.length !== 10) return false

  let sum = 0
  for (let i = 0; i < 9; i++) {
    const digit = parseInt(clean[i], 10)
    if (isNaN(digit)) return false
    sum += digit * (10 - i)
  }

  const lastChar = clean[9]
  const checkDigit = lastChar === 'X' ? 10 : parseInt(lastChar, 10)
  if (isNaN(checkDigit)) return false

  sum += checkDigit
  return sum % 11 === 0
}

/**
 * Valida o dígito verificador do ISBN-13
 */
export function isValidIsbn13(isbn13: string): boolean {
  const clean = sanitizeIsbn(isbn13)
  if (clean.length !== 13 || !/^\d{13}$/.test(clean)) return false

  let sum = 0
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(clean[i], 10)
    sum += i % 2 === 0 ? digit : digit * 3
  }

  const checkDigit = (10 - (sum % 10)) % 10
  return parseInt(clean[12], 10) === checkDigit
}

/**
 * Converte ISBN-10 para ISBN-13
 */
export function convertIsbn10To13(isbn10: string): string {
  const clean = sanitizeIsbn(isbn10)
  if (clean.length !== 10) return clean

  const base = '978' + clean.substring(0, 9)
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(base[i], 10)
    sum += i % 2 === 0 ? digit : digit * 3
  }
  const checkDigit = (10 - (sum % 10)) % 10
  return base + checkDigit
}

/**
 * Normaliza e valida um ISBN (10 ou 13).
 * Retorna o ISBN-13 padronizado se válido, ou lança erro/retorna null.
 */
export function normalizeAndValidateIsbn(raw: string): {
  valid: boolean
  isbn13: string
  error?: string
} {
  const clean = sanitizeIsbn(raw)
  if (!clean) {
    return { valid: false, isbn13: '', error: 'ISBN não informado ou vazio.' }
  }

  if (clean.length === 10) {
    if (!isValidIsbn10(clean)) {
      return {
        valid: false,
        isbn13: '',
        error: `Dígito verificador do ISBN-10 "${clean}" é inválido.`,
      }
    }
    return { valid: true, isbn13: convertIsbn10To13(clean) }
  }

  if (clean.length === 13) {
    if (!isValidIsbn13(clean)) {
      return {
        valid: false,
        isbn13: '',
        error: `Dígito verificador do ISBN-13 "${clean}" é inválido.`,
      }
    }
    return { valid: true, isbn13: clean }
  }

  return {
    valid: false,
    isbn13: '',
    error: `Formato de ISBN inválido (${clean.length} dígitos). O ISBN deve possuir 10 ou 13 dígitos.`,
  }
}

/**
 * Formata exibição do autor com espírito e médium (F-04)
 * Padrão: "André Luiz, por Chico Xavier" ou autor simples se não houver médium
 */
export function formatAuthorDisplay(
  autorOrEspiritual?: string | null,
  autorMediunico?: string | null,
  autorFallback?: string | null,
): string {
  const espiritual = (autorOrEspiritual || '').trim()
  const mediunico = (autorMediunico || '').trim()

  if (espiritual && mediunico) {
    // Se o autor espiritual já contiver ", por", evita duplicar
    if (espiritual.toLowerCase().includes(', por ')) {
      return espiritual
    }
    return `${espiritual}, por ${mediunico}`
  }

  if (espiritual) return espiritual
  if (mediunico) return mediunico
  return (autorFallback || '').trim()
}

/**
 * Busca dados do livro pelo ISBN no Google Books API e, como fallback, na Open Library.
 */
export async function fetchBookByIsbn(isbnRaw: string): Promise<BookMetadata> {
  const validation = normalizeAndValidateIsbn(isbnRaw)
  if (!validation.valid) {
    throw new Error(validation.error || 'ISBN inválido.')
  }
  const cleanIsbn = validation.isbn13

  // Função auxiliar interna para buscar capa via Google Books
  const fetchCoverFromGoogleBooks = async (isbn: string): Promise<string> => {
    try {
      let cover = ''
      const resFiltered = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)
      if (resFiltered.ok) {
        const data = await resFiltered.json()
        if (data.items && data.items.length > 0) {
          const volume = data.items[0].volumeInfo || {}
          cover =
            volume.imageLinks?.extraLarge ||
            volume.imageLinks?.large ||
            volume.imageLinks?.medium ||
            volume.imageLinks?.thumbnail ||
            volume.imageLinks?.smallThumbnail ||
            ''
        }
      }

      if (!cover) {
        const resSimple = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${isbn}`)
        if (resSimple.ok) {
          const data = await resSimple.json()
          if (data.items && data.items.length > 0) {
            const volume = data.items[0].volumeInfo || {}
            cover =
              volume.imageLinks?.extraLarge ||
              volume.imageLinks?.large ||
              volume.imageLinks?.medium ||
              volume.imageLinks?.thumbnail ||
              volume.imageLinks?.smallThumbnail ||
              ''
          }
        }
      }

      if (cover) {
        if (cover.startsWith('http:')) {
          cover = cover.replace('http:', 'https:')
        }
        // Google Books thumbnail URLs sometimes include &edge=curl which can look cropped
        return cover
      }
    } catch (err) {
      console.warn('Erro ao buscar capa no Google Books:', err)
    }
    return ''
  }

  // Função auxiliar interna para buscar capa via Open Library
  const fetchCoverFromOpenLibrary = async (isbn: string): Promise<string> => {
    try {
      const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`)
      if (res.ok) {
        const data = await res.json()
        if (data.covers && data.covers.length > 0) {
          return `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`
        }
      }
    } catch (err) {
      console.warn('Erro ao buscar capa na Open Library:', err)
    }
    return ''
  }

  // Função auxiliar interna para buscar capa por Título e Autor (Fallback Google Books + Open Library)
  const fetchCoverByTitleAndAuthor = async (title: string, author?: string): Promise<string> => {
    const cleanTitle = (title || '').trim()
    const cleanAuthor = (author || '').trim()
    if (!cleanTitle) return ''

    // 1. Google Books por intitle / inauthor
    try {
      let query = `intitle:${encodeURIComponent(cleanTitle)}`
      if (cleanAuthor) {
        // Usa o primeiro autor caso venha separado por vírgula
        const primaryAuthor = cleanAuthor.split(',')[0].trim()
        if (primaryAuthor) {
          query += `+inauthor:${encodeURIComponent(primaryAuthor)}`
        }
      }

      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=3`)
      if (res.ok) {
        const data = await res.json()
        if (data.items && data.items.length > 0) {
          for (const item of data.items) {
            const volume = item.volumeInfo || {}
            let cover =
              volume.imageLinks?.extraLarge ||
              volume.imageLinks?.large ||
              volume.imageLinks?.medium ||
              volume.imageLinks?.thumbnail ||
              volume.imageLinks?.smallThumbnail ||
              ''
            if (cover) {
              if (cover.startsWith('http:')) {
                cover = cover.replace('http:', 'https:')
              }
              return cover
            }
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao buscar capa por título/autor no Google Books:', err)
    }

    // 2. Open Library Search API
    try {
      let olUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(cleanTitle)}`
      if (cleanAuthor) {
        const primaryAuthor = cleanAuthor.split(',')[0].trim()
        if (primaryAuthor) {
          olUrl += `&author=${encodeURIComponent(primaryAuthor)}`
        }
      }
      olUrl += `&fields=cover_i,title,author_name&limit=1`

      const resOl = await fetch(olUrl)
      if (resOl.ok) {
        const dataOl = await resOl.json()
        if (dataOl.docs && dataOl.docs.length > 0) {
          const doc = dataOl.docs[0]
          if (doc.cover_i) {
            return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao buscar capa por título/autor na Open Library:', err)
    }

    return ''
  }

  // 1. Tenta BrasilAPI como fonte prioritária (especialmente eficaz para livros nacionais)
  try {
    const res = await fetch(`https://brasilapi.com.br/api/isbn/v1/${cleanIsbn}`)
    if (res.ok) {
      const data = await res.json()
      if (data && (data.title || data.isbn)) {
        let authors = ''
        if (Array.isArray(data.authors)) {
          authors = data.authors.filter(Boolean).join(', ')
        } else if (typeof data.authors === 'string') {
          authors = data.authors
        }

        let year: number | undefined
        if (data.year) {
          const parsed = typeof data.year === 'number' ? data.year : parseInt(String(data.year), 10)
          if (!isNaN(parsed)) {
            year = parsed
          }
        }

        let cover = data.cover_url || ''
        if (cover && cover.startsWith('http:')) {
          cover = cover.replace('http:', 'https:')
        }

        // Se BrasilAPI não trouxe capa, tenta buscar capa no Google Books e Open Library por ISBN
        if (!cover) {
          cover = await fetchCoverFromGoogleBooks(cleanIsbn)
        }
        if (!cover) {
          cover = await fetchCoverFromOpenLibrary(cleanIsbn)
        }
        // Fallback de capa por Título e Autor
        if (!cover && data.title) {
          cover = await fetchCoverByTitleAndAuthor(data.title, authors)
        }

        return {
          isbn: cleanIsbn,
          titulo_de_livro: data.title || '',
          autor: authors || '',
          editora: data.publisher || '',
          ano_publicacao: year,
          categoria: '',
          sinopse: data.synopsis || '',
          capa_url: cover || '',
        }
      }
    }
  } catch (err) {
    console.warn('Erro ao consultar BrasilAPI:', err)
  }

  // 2. Fallback: Google Books API (com busca filtrada isbn: e fallback por termo simples q=)
  try {
    let volume: any = null
    const resFiltered = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`,
    )
    if (resFiltered.ok) {
      const data = await resFiltered.json()
      if (data.items && data.items.length > 0) {
        volume = data.items[0].volumeInfo || {}
      }
    }

    // Se não encontrou com busca filtrada, tenta busca simples
    if (!volume) {
      const resSimple = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${cleanIsbn}`)
      if (resSimple.ok) {
        const data = await resSimple.json()
        if (data.items && data.items.length > 0) {
          volume = data.items[0].volumeInfo || {}
        }
      }
    }

    if (volume && (volume.title || volume.authors)) {
      const authors = volume.authors && volume.authors.length > 0 ? volume.authors.join(', ') : ''
      const publishedYear = volume.publishedDate
        ? parseInt(volume.publishedDate.substring(0, 4), 10)
        : undefined

      let cover =
        volume.imageLinks?.extraLarge ||
        volume.imageLinks?.large ||
        volume.imageLinks?.medium ||
        volume.imageLinks?.thumbnail ||
        volume.imageLinks?.smallThumbnail ||
        ''
      if (cover && cover.startsWith('http:')) {
        cover = cover.replace('http:', 'https:')
      }

      // Se o Google Books não tiver capa nesse volume, tenta Open Library por ISBN
      if (!cover) {
        cover = await fetchCoverFromOpenLibrary(cleanIsbn)
      }
      // Fallback de capa por Título e Autor
      if (!cover && volume.title) {
        cover = await fetchCoverByTitleAndAuthor(volume.title, authors)
      }

      const categories =
        volume.categories && volume.categories.length > 0 ? volume.categories[0] : ''

      return {
        isbn: cleanIsbn,
        titulo_de_livro: volume.title || '',
        autor: authors || '',
        editora: volume.publisher || '',
        ano_publicacao: publishedYear && !isNaN(publishedYear) ? publishedYear : undefined,
        categoria: categories || '',
        sinopse: volume.description || '',
        capa_url: cover || '',
      }
    }
  } catch (err) {
    console.warn('Erro ao consultar Google Books:', err)
  }

  // 3. Fallback: Open Library API
  try {
    const res = await fetch(`https://openlibrary.org/isbn/${cleanIsbn}.json`)
    if (res.ok) {
      const data = await res.json()
      let authorName = ''
      if (data.authors && data.authors.length > 0) {
        try {
          const authorKey = data.authors[0].key
          if (authorKey) {
            const authorRes = await fetch(`https://openlibrary.org${authorKey}.json`)
            if (authorRes.ok) {
              const authorData = await authorRes.json()
              authorName = authorData.name || ''
            }
          }
        } catch {
          /* intentionally ignored */
        }
      }

      let year: number | undefined
      if (data.publish_date) {
        const match = data.publish_date.match(/\b\d{4}\b/)
        if (match) {
          year = parseInt(match[0], 10)
        }
      }

      let publisher = ''
      if (data.publishers && data.publishers.length > 0) {
        publisher =
          typeof data.publishers[0] === 'string'
            ? data.publishers[0]
            : data.publishers[0].name || ''
      }

      let coverUrl = ''
      if (data.covers && data.covers.length > 0) {
        coverUrl = `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`
      }

      // Se Open Library não tem capa nos metadados, tenta Google Books como último recurso para capa por ISBN
      if (!coverUrl) {
        coverUrl = await fetchCoverFromGoogleBooks(cleanIsbn)
      }
      // Fallback de capa por Título e Autor
      if (!coverUrl && data.title) {
        coverUrl = await fetchCoverByTitleAndAuthor(data.title, authorName)
      }

      let description = ''
      if (typeof data.description === 'string') {
        description = data.description
      } else if (data.description && typeof data.description.value === 'string') {
        description = data.description.value
      }

      return {
        isbn: cleanIsbn,
        titulo_de_livro: data.title || '',
        autor: authorName || '',
        editora: publisher || '',
        ano_publicacao: year,
        categoria: '',
        sinopse: description,
        capa_url: coverUrl,
      }
    }
  } catch (err) {
    console.warn('Erro ao consultar Open Library:', err)
  }
  throw new Error(
    `Não foram encontradas informações automáticas para o ISBN "${cleanIsbn}". Você pode preencher os dados manualmente.`,
  )
}
