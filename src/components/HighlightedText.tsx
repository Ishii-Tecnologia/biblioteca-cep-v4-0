import React, { useMemo } from 'react'

interface HighlightedTextProps {
  text: string | null | undefined
  search: string | null | undefined
  className?: string
  highlightClassName?: string
}

/**
 * Remove diacríticos/acentos de uma string para comparação de busca flexível.
 */
function normalizeDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Escapa caracteres especiais de regex para uso seguro.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Componente que destaca as ocorrências do termo buscado no texto fornecido,
 * suportando busca com e sem acentos de forma segura (sem dangerouslySetInnerHTML).
 */
export function HighlightedText({
  text,
  search,
  className,
  highlightClassName = 'bg-amber-200/90 text-amber-950 font-semibold px-0.5 rounded-xs',
}: HighlightedTextProps) {
  const parts = useMemo(() => {
    if (!text) return null
    const query = search?.trim()
    if (!query) return null

    // 1. Tentar correspondência direta insensitive normal
    try {
      const escaped = escapeRegExp(query)
      const directRegex = new RegExp(`(${escaped})`, 'gi')
      if (directRegex.test(text)) {
        return text.split(directRegex)
      }
    } catch {
      // continua para fallback
    }

    // 2. Correspondência tolerante a acentos (ex: "historia" dá match em "história")
    const normText = normalizeDiacritics(text)
    const normQuery = normalizeDiacritics(query)
    if (!normText.includes(normQuery)) {
      return null
    }

    // Mapear fatias baseadas nos índices de correspondência normalizada
    const segments: Array<{ text: string; isMatch: boolean }> = []
    let cursor = 0
    let matchIndex = normText.indexOf(normQuery, cursor)

    while (matchIndex !== -1) {
      if (matchIndex > cursor) {
        segments.push({
          text: text.slice(cursor, matchIndex),
          isMatch: false,
        })
      }
      const matchEnd = matchIndex + normQuery.length
      segments.push({
        text: text.slice(matchIndex, matchEnd),
        isMatch: true,
      })
      cursor = matchEnd
      matchIndex = normText.indexOf(normQuery, cursor)
    }

    if (cursor < text.length) {
      segments.push({
        text: text.slice(cursor),
        isMatch: false,
      })
    }

    return segments
  }, [text, search])

  if (!text) return null

  // Se não houver correspondência ou busca estiver vazia, renderiza o texto comum
  if (!parts) {
    return <span className={className}>{text}</span>
  }

  // Se for o caso de regex direto (array de strings)
  if (parts.length > 0 && typeof parts[0] === 'string') {
    const stringParts = parts as string[]
    const queryLower = normalizeDiacritics(search?.trim() || '')
    return (
      <span className={className}>
        {stringParts.map((part, index) => {
          const isMatch = normalizeDiacritics(part) === queryLower
          if (isMatch) {
            return (
              <mark key={index} className={highlightClassName}>
                {part}
              </mark>
            )
          }
          return <React.Fragment key={index}>{part}</React.Fragment>
        })}
      </span>
    )
  }

  // Caso tolerante a acentos (array de segmentos)
  const segmentParts = parts as Array<{ text: string; isMatch: boolean }>
  return (
    <span className={className}>
      {segmentParts.map((seg, index) => {
        if (seg.isMatch) {
          return (
            <mark key={index} className={highlightClassName}>
              {seg.text}
            </mark>
          )
        }
        return <React.Fragment key={index}>{seg.text}</React.Fragment>
      })}
    </span>
  )
}
