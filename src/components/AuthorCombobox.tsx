import React, { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AuthorsService, Author, AuthorType } from '@/services/authors'
import { Loader2, Plus, Check, User, Sparkles } from 'lucide-react'

interface AuthorComboboxProps {
  value: string
  onChange: (name: string, authorObj?: Author) => void
  authorType?: AuthorType
  placeholder?: string
  label?: string
  isSpirit?: boolean
}

export const AuthorCombobox: React.FC<AuthorComboboxProps> = ({
  value,
  onChange,
  authorType = 'ENCARNADO',
  placeholder = 'Digite o nome do autor...',
  isSpirit = false,
}) => {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value || '')
  const [suggestions, setSuggestions] = useState<Author[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setInputValue(value || '')
  }, [value])

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Buscar autores incrementalmente ao digitar (F-06: 2+ caracteres disparam sugestões)
  useEffect(() => {
    if (!open) return

    let isMounted = true
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const query = inputValue.trim()
        let results: Author[] = []
        if (query.length >= 1) {
          results = await AuthorsService.search(query, authorType, 12)
        } else {
          results = await AuthorsService.getPopular(authorType, 10)
        }
        if (isMounted) {
          setSuggestions(results)
        }
      } catch (err) {
        console.warn('Erro ao buscar sugestões de autores:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }, 200)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [inputValue, open, authorType])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    setInputValue(text)
    onChange(text)
    setOpen(true)
  }

  const handleSelectAuthor = (author: Author) => {
    setInputValue(author.name)
    onChange(author.name, author)
    setOpen(false)
  }

  const handleCreateInline = async () => {
    const name = inputValue.trim()
    if (!name) return

    setCreating(true)
    try {
      const created = await AuthorsService.findOrCreate(name, authorType)
      setInputValue(created.name)
      onChange(created.name, created)
      setOpen(false)
    } catch (err: any) {
      alert(`Erro ao cadastrar autor: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }

  const hasExactMatch = suggestions.some(
    (s) => s.name.toLowerCase() === inputValue.trim().toLowerCase(),
  )

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative flex items-center">
        <Input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pr-8 text-sm"
        />
        {loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-popover text-popover-foreground rounded-lg border border-border shadow-lg max-h-60 overflow-y-auto p-1 text-xs">
          {suggestions.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {isSpirit ? 'Espíritos Cadastrados' : 'Autores Sugeridos'}
              </div>
              {suggestions.map((author) => {
                const isSelected = author.name.toLowerCase() === inputValue.trim().toLowerCase()
                return (
                  <button
                    key={author.id}
                    type="button"
                    onClick={() => handleSelectAuthor(author)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {author.type === 'ESPIRITO' ? (
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      ) : (
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate">{author.name}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}

          {inputValue.trim().length >= 2 && !hasExactMatch && (
            <div className="p-1 border-t border-border mt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCreateInline}
                disabled={creating}
                className="w-full justify-start text-xs text-primary hover:text-primary hover:bg-primary/10 h-8 gap-1.5 font-normal"
              >
                {creating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>
                  Cadastrar <strong>"{inputValue.trim()}"</strong> como{' '}
                  {isSpirit ? 'Espírito' : authorType === 'MEDIUM' ? 'Médium' : 'Autor'}
                </span>
              </Button>
            </div>
          )}

          {suggestions.length === 0 && !loading && inputValue.trim().length < 2 && (
            <div className="px-3 py-2 text-muted-foreground text-center text-xs">
              Digite 2 ou mais caracteres para buscar autores...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
