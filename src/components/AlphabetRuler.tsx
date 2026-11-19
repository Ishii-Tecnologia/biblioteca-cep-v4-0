import { useMemo } from 'react'

/**
 * Régua de filtro alfabético do Acervo
 *
 * Gera as iniciais (A–Z e 0–9) disponíveis a partir da lista de títulos já
 * carregada pela página, ignorando acentos e diferenciando maiúsculas de
 * minúsculas ("Álbum" conta como "A"). Títulos que começam com caracteres
 * fora desse conjunto (ex: aspas ou símbolos) são agregados sob o item "#".
 */

export interface AlphabetRulerProps {
  availableInitials: Set<string>
  selected: string | null
  onSelect: (value: string | null) => void
  className?: string
}

export const ALPHABET_RULER_ITEMS: string[] = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ...'0123456789'.split(''),
  '#',
]

/** Normaliza um texto para extrair a inicial de comparação (sem acento, maiúscula). */
export function getInitialKey(title: string): string | null {
  const normalized = (title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
  if (!normalized) return null
  const first = normalized[0]
  if (/[A-Z]/.test(first)) return first
  if (/[0-9]/.test(first)) return first
  return '#'
}

export function buildAvailableInitials(titles: string[]): Set<string> {
  const set = new Set<string>()
  for (const t of titles) {
    const key = getInitialKey(t)
    if (key) set.add(key)
  }
  return set
}

export function useAvailableInitials(titles: string[]): Set<string> {
  return useMemo(() => buildAvailableInitials(titles), [titles])
}

export default function AlphabetRuler({
  availableInitials,
  selected,
  onSelect,
  className = '',
}: AlphabetRulerProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-1 ${className}`}
      role="group"
      aria-label="Filtro alfabético por inicial do título"
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={selected === null}
        className={`h-6 min-w-[1.6rem] px-1.5 rounded text-[10px] font-semibold uppercase border transition-colors ${
          selected === null
            ? 'bg-[#136b77] text-white border-[#136b77]'
            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
        }`}
      >
        Todos
      </button>

      {ALPHABET_RULER_ITEMS.map((item) => {
        const hasBooks = availableInitials.has(item)
        const isSelected = selected === item
        if (!hasBooks && !isSelected) {
          return (
            <span
              key={item}
              aria-hidden="true"
              className="h-6 min-w-[1.6rem] px-1.5 inline-flex items-center justify-center rounded text-[10px] font-semibold uppercase border border-transparent text-slate-300 select-none"
            >
              {item}
            </span>
          )
        }
        return (
          <button
            key={item}
            type="button"
            onClick={() => onSelect(isSelected ? null : item)}
            aria-pressed={isSelected}
            title={
              isSelected ? 'Limpar filtro alfabético' : `Filtrar títulos que começam com ${item}`
            }
            className={`h-6 min-w-[1.6rem] px-1.5 rounded text-[10px] font-semibold uppercase border transition-colors ${
              isSelected
                ? 'bg-[#136b77] text-white border-[#136b77] shadow-2xs'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800'
            }`}
          >
            {item}
          </button>
        )
      })}
    </div>
  )
}
