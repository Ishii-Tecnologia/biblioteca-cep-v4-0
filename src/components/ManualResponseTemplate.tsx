import { useState } from 'react'
import { Copy, Check, MessageSquareQuote } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ManualResponseTemplateProps {
  text: string
}

/** Bloco citável com o modelo de resposta a pedidos do titular, com botão de cópia. */
export function ManualResponseTemplate({ text }: ManualResponseTemplateProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <MessageSquareQuote className="w-4 h-4 text-emerald-700" />
          Modelo de resposta ao titular
        </h4>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="text-xs h-8 gap-1.5 bg-white"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          <span>{copied ? 'Texto copiado' : 'Copiar modelo'}</span>
        </Button>
      </div>
      <p className="text-[11px] text-slate-500">
        Substitua os campos entre colchetes antes de enviar. Não inclua dados de outros leitores.
      </p>
      <blockquote className="border-l-4 border-emerald-500 bg-white rounded-r-lg p-4 text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap font-mono">
        {text}
      </blockquote>
    </div>
  )
}
