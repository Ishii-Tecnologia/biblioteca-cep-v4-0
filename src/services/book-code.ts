/**
 * Utilitários para geração do Código do Livro (id_titulo) e de Exemplares (id_exemplar)
 *
 * Regras:
 * - Espírito + Médium: Iniciais do Médium (2 letras) + '-' + Iniciais do Espírito (2 letras) + sequencial 3 dígitos (ex: CX-EM001, CX-AL001, DF-MP001)
 * - Autor Convencional: Iniciais do Autor (2 letras ou mais significativas) + '-' + sequencial 3 dígitos (ex: AK-001)
 * - Iniciais: Primeira letra de cada palavra significativa do nome, ignorando conectivos ("de", "da", "do", "dos", "das", "e", "del", "di", "d'"). Para nomes de uma única palavra, usar as duas primeiras letras.
 * - Sequencial por prefixo: Cada prefixo tem sua contagem independente (001, 002, 003...) baseado nos livros já existentes no banco.
 * - Exemplares: {id_titulo}-{seq} (ex: CX-EM001-1, AK-001-1)
 */

import { supabase } from '@/lib/supabase/client'

const CONNECTIVES = new Set([
  'DE',
  'DA',
  'DO',
  'DAS',
  'DOS',
  'E',
  'DEL',
  'DI',
  'DU',
  'DES',
  'VON',
  'VAN',
  'D',
])

/**
 * Remove acentos e caracteres não alfabéticos
 */
export function removeAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
}

/**
 * Extrai as iniciais de um nome de acordo com as regras:
 * - Ignora conectivos ("de", "da", "do", "dos", "das", "e", etc.)
 * - Se tiver 1 palavra: 2 primeiras letras (ex: "Emmanuel" -> "EM", "Victor" -> "VI", "X" -> "XX")
 * - Se tiver 2 ou mais palavras significativas: primeira letra de cada palavra significativa
 *   (ex: "Chico Xavier" -> "CX", "André Luiz" -> "AL", "Allan Kardec" -> "AK", "Manoel Philomeno de Miranda" -> "MPM" -> primeiras 2 ou todas?)
 *   Vamos avaliar: se tiver 2 palavras -> 2 letras. Se tiver 3 palavras significativas ("Manoel Philomeno Miranda") -> "MP" no exemplo da spec ("DF-MP001")!
 *   Spec diz explicitamente:
 *   - "duas letras maiúsculas das iniciais do nome do Médium + traço + duas letras maiúsculas das iniciais do nome do Espírito + sequencial de 3 dígitos"
 *   - "Exemplo: Divaldo Franco, Espírito Manoel Philomeno de Miranda -> DF-MP001"
 */
export function extractInitials(name: string, maxChars = 2): string {
  if (!name || !name.trim()) return 'XX'

  const normalized = removeAccents(name).trim()
  if (!normalized) return 'XX'

  const rawWords = normalized.split(/\s+/).filter(Boolean)
  const significantWords = rawWords.filter((w) => !CONNECTIVES.has(w.toUpperCase()))

  const words = significantWords.length > 0 ? significantWords : rawWords

  if (words.length === 1) {
    const single = words[0].toUpperCase()
    if (single.length >= 2) {
      return single.substring(0, 2)
    }
    return (single + 'X').substring(0, 2)
  }

  // 2 ou mais palavras: pegar a primeira letra de cada uma até maxChars
  const letters = words.map((w) => w[0].toUpperCase()).join('')
  if (letters.length >= maxChars) {
    return letters.substring(0, maxChars)
  }
  return (letters + 'X'.repeat(maxChars)).substring(0, maxChars)
}

/**
 * Mantém o controle de contadores de sequenciais em memória (útil para importações em lote)
 */
export class BookCodeSequenceTracker {
  private prefixCounts: Map<string, number> = new Map()

  /**
   * Inicializa o tracker para um prefixo consultando o maior sequencial existente no banco
   */
  async initPrefix(prefix: string): Promise<number> {
    const cleanPrefix = (prefix || 'OB-').trim().toUpperCase()
    if (this.prefixCounts.has(cleanPrefix)) {
      return this.prefixCounts.get(cleanPrefix)!
    }

    let maxSeq = 0
    try {
      const { data, error } = await supabase
        .from('titulo')
        .select('id_titulo')
        .ilike('id_titulo', `${cleanPrefix}%`)

      if (!error && data && data.length > 0) {
        for (const row of data) {
          const id = (row.id_titulo || '').toUpperCase()
          if (id.startsWith(cleanPrefix)) {
            const rest = id.substring(cleanPrefix.length)
            const match = rest.match(/^(\d+)/)
            if (match) {
              const num = parseInt(match[1], 10)
              if (!isNaN(num) && num > maxSeq) {
                maxSeq = num
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao inicializar prefixo no tracker:', err)
    }

    this.prefixCounts.set(cleanPrefix, maxSeq)
    return maxSeq
  }

  /**
   * Obtém o próximo código sequencial para um prefixo e incrementa o contador local
   */
  async nextCode(prefix: string): Promise<string> {
    const cleanPrefix = (prefix || 'OB-').trim().toUpperCase()
    if (!this.prefixCounts.has(cleanPrefix)) {
      await this.initPrefix(cleanPrefix)
    }

    const current = this.prefixCounts.get(cleanPrefix) || 0
    const next = current + 1
    this.prefixCounts.set(cleanPrefix, next)

    const seqPadded = String(next).padStart(3, '0')
    return `${cleanPrefix}${seqPadded}`
  }
}
/**
 * Calcula o prefixo do código do livro com base na estrutura de autoria:
 * - Espírito + Médium: {IniciaisMedium}-{IniciaisEspirito} (ex: CX-EM, CX-AL, DF-MP)
 * - Autor Convencional: {IniciaisAutor}- (ex: AK-)
 *
 * Se colecao === 'diretoria', acrescenta o prefixo "DIR-" à regra normal:
 * - Allan Kardec na diretoria -> "DIR-AK-" (resultando em "DIR-AK-001")
 * - Chico Xavier + Emmanuel na diretoria -> "DIR-CX-EM" (resultando em "DIR-CX-EM001")
 */
export function calculateBookCodePrefix(
  isSpiritMedium: boolean,
  mediumName?: string | null,
  spiritName?: string | null,
  conventionalAuthorName?: string | null,
  colecao?: string | null,
): string {
  let basePrefix: string

  if (isSpiritMedium) {
    const medInitials = extractInitials(mediumName || '', 2)
    const spInitials = extractInitials(spiritName || '', 2)
    basePrefix = `${medInitials}-${spInitials}`
  } else {
    const authInitials = extractInitials(conventionalAuthorName || '', 2)
    basePrefix = `${authInitials}-`
  }

  if (colecao === 'diretoria') {
    return `DIR-${basePrefix}`
  }

  return basePrefix
}

/**
 * Busca no banco de dados o próximo sequencial para um dado prefixo
 * - Para prefixos padrão (ex: "CX-EM", "AK-"): sequencial de 3 dígitos (ex: CX-EM001, AK-001)
 * - Para diretoria (ex: "DIR-AK-", "DIR-CX-EM"): sequencial de 3 dígitos (ex: DIR-AK-001, DIR-CX-EM001)
 */
export async function getNextBookCode(prefix: string): Promise<string> {
  if (!prefix || !prefix.trim()) {
    return 'OB-001'
  }

  const cleanPrefix = prefix.trim().toUpperCase()
  const minDigits = 3

  try {
    // Buscar todos os livros cujo id_titulo comece com o prefixo
    const { data, error } = await supabase
      .from('titulo')
      .select('id_titulo')
      .ilike('id_titulo', `${cleanPrefix}%`)

    if (error) {
      console.warn('Erro ao consultar id_titulo para prefixo:', error)
      return `${cleanPrefix}${'1'.padStart(minDigits, '0')}`
    }

    let maxSeq = 0

    if (data && data.length > 0) {
      for (const row of data) {
        const id = (row.id_titulo || '').toUpperCase()
        if (id.startsWith(cleanPrefix)) {
          // Extrai os dígitos que seguem o prefixo
          const rest = id.substring(cleanPrefix.length)
          // Pega os primeiros números antes de qualquer traço (caso seja exemplar ou sufixo)
          const match = rest.match(/^(\d+)/)
          if (match) {
            const num = parseInt(match[1], 10)
            if (!isNaN(num) && num > maxSeq) {
              maxSeq = num
            }
          }
        }
      }
    }

    const nextSeq = maxSeq + 1
    const seqPadded = String(nextSeq).padStart(minDigits, '0')
    return `${cleanPrefix}${seqPadded}`
  } catch (err) {
    console.error('Falha ao calcular próximo código do livro:', err)
    return `${cleanPrefix}${'1'.padStart(minDigits, '0')}`
  }
}
