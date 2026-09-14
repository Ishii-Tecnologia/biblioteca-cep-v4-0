import * as React from 'react'
import { Calendar as CalendarIcon, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { cn, formatDateBR, parseDateBRToISO, formatBRDateInput } from '@/lib/utils'

export interface DatePickerBRProps {
  /**
   * Valor da data no formato ISO YYYY-MM-DD (ex: "2025-02-24") ou vazio
   */
  value: string
  /**
   * Callback quando a data muda, emitindo formato ISO YYYY-MM-DD ou string vazia
   */
  onChange: (isoDate: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  id?: string
  name?: string
  label?: string
}

export function DatePickerBR({
  value,
  onChange,
  placeholder = 'dd/mm/aaaa',
  className,
  disabled = false,
  id,
  name,
}: DatePickerBRProps) {
  const [open, setOpen] = React.useState(false)
  const [textInput, setTextInput] = React.useState<string>(() => (value ? formatDateBR(value) : ''))

  // Sincroniza o texto digitado quando o prop value mudar externamente
  React.useEffect(() => {
    if (value) {
      setTextInput(formatDateBR(value))
    } else {
      setTextInput('')
    }
  }, [value])

  // Objeto Date selecionado para o calendário DayPicker
  const selectedDate = React.useMemo(() => {
    if (!value) return undefined
    const parts = value.split('-')
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10) - 1
      const d = parseInt(parts[2], 10)
      const dateObj = new Date(y, m, d)
      if (!isNaN(dateObj.getTime())) return dateObj
    }
    return undefined
  }, [value])

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value
    const formatted = formatBRDateInput(rawVal)
    setTextInput(formatted)

    if (formatted.length === 10) {
      const iso = parseDateBRToISO(formatted)
      if (iso) {
        onChange(iso)
      }
    } else if (formatted.length === 0) {
      onChange('')
    }
  }

  const handleBlur = () => {
    if (textInput.length === 10) {
      const iso = parseDateBRToISO(textInput)
      if (iso) {
        onChange(iso)
      } else {
        // Data inválida digitada, reverte para o estado atual
        setTextInput(value ? formatDateBR(value) : '')
      }
    } else if (textInput.length > 0 && textInput.length < 10) {
      // Entrada incompleta, reverte
      setTextInput(value ? formatDateBR(value) : '')
    }
  }

  const handleSelectDay = (day: Date | undefined) => {
    if (day) {
      const y = day.getFullYear()
      const m = String(day.getMonth() + 1).padStart(2, '0')
      const d = String(day.getDate()).padStart(2, '0')
      const iso = `${y}-${m}-${d}`
      const br = `${d}/${m}/${y}`
      setTextInput(br)
      onChange(iso)
      setOpen(false)
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setTextInput('')
    onChange('')
  }

  return (
    <div className={cn('relative flex items-center', className)}>
      <div className="relative flex-1 flex items-center">
        <input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          placeholder={placeholder}
          value={textInput}
          onChange={handleTextChange}
          onBlur={handleBlur}
          maxLength={10}
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors',
            'file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            'pr-14 font-mono',
          )}
        />
        <div className="absolute right-1 flex items-center gap-0.5">
          {textInput && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
              title="Limpar data"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                className="h-7 w-7 text-muted-foreground hover:text-foreground p-0"
                title="Abrir calendário (dd/mm/aaaa)"
              >
                <CalendarIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleSelectDay}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  )
}
