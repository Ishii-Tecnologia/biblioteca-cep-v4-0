import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sparkles, Mail, Bell, Clock, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { ReservasService, ReservaDetailed } from '@/services/reservas'
import { ExemplaresService, Exemplar } from '@/services/exemplares'
import { getTempoReservaGarantidaHoras } from '@/services/parametros'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'

interface ReadyForPickupModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reserva: ReservaDetailed | null
  onSuccess: () => void
}

export function ReadyForPickupModal({
  open,
  onOpenChange,
  reserva,
  onSuccess,
}: ReadyForPickupModalProps) {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [exemplares, setExemplares] = useState<Exemplar[]>([])
  const [selectedExemplar, setSelectedExemplar] = useState<string>('')
  const [guaranteeHours, setGuaranteeHours] = useState<number>(24)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && reserva) {
      getTempoReservaGarantidaHoras()
        .then((h) => setGuaranteeHours(h || 24))
        .catch(() => setGuaranteeHours(24))

      setLoading(true)
      ExemplaresService.getByTitulo(reserva.id_titulo)
        .then((copies) => {
          // Filtrar exemplares disponíveis ou já retidos
          const available = copies.filter(
            (c) => c.status === 'Disponivel' || c.status === 'Reservado',
          )
          setExemplares(available)
          if (available.length > 0) {
            setSelectedExemplar(available[0].id_exemplar)
          }
        })
        .catch((err) => {
          console.warn('Erro ao carregar exemplares:', err)
        })
        .finally(() => setLoading(false))
    }
  }, [open, reserva])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reserva) return

    setSubmitting(true)
    try {
      const operator = profile?.full_name || 'Operador / Biblioteca'
      const result = await ReservasService.markReadyForPickup(
        reserva.id_reserva,
        selectedExemplar || undefined,
        guaranteeHours,
        operator,
      )

      // Disparar notificação visual / simulação de envio de push e e-mail
      toast({
        title: 'Notificação de Livro Pronto Enviada!',
        description: `E-mail e notificação push disparados para ${result.readerName} (${result.readerEmail}). O livro ficará garantido por ${result.hours} horas para retirada.`,
      })

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao liberar livro para retirada',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const limitPreview = new Date()
  limitPreview.setHours(limitPreview.getHours() + (guaranteeHours || 24))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            Liberar Livro & Disparar Notificação
          </DialogTitle>
          <DialogDescription>
            Notifique o leitor de que o exemplar reservado já está disponível para retirada na
            biblioteca com prazo de reserva garantida.
          </DialogDescription>
        </DialogHeader>

        {reserva && (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Livro Reservado:</span>
                <span className="font-bold text-slate-900 text-right">
                  {reserva.titulo?.titulo_de_livro}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Leitor Contemplado:</span>
                <span className="font-bold text-slate-900 text-right">
                  {reserva.leitor?.nome_do_leitor} ({reserva.leitor?.email})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Posição da Reserva:</span>
                <span className="font-semibold text-emerald-700 text-right">
                  1º lugar (Pronto para Retirada)
                </span>
              </div>
            </div>

            {/* Seleção do Exemplar */}
            <div className="space-y-1.5">
              <Label htmlFor="exemplarSelect" className="text-xs font-semibold text-slate-700">
                Exemplar Físico a Vincular
              </Label>
              {loading ? (
                <div className="text-xs text-slate-400 py-2 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Carregando exemplares disponíveis...
                </div>
              ) : exemplares.length === 0 ? (
                <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Nenhum exemplar com status 'Disponivel' encontrado. A reserva será liberada e o
                    leitor avisado.
                  </span>
                </div>
              ) : (
                <Select value={selectedExemplar} onValueChange={setSelectedExemplar}>
                  <SelectTrigger id="exemplarSelect" className="text-xs">
                    <SelectValue placeholder="Selecione o exemplar retido" />
                  </SelectTrigger>
                  <SelectContent>
                    {exemplares.map((ex) => (
                      <SelectItem key={ex.id_exemplar} value={ex.id_exemplar} className="text-xs">
                        {ex.id_exemplar} (Seq #{ex.seq} - {ex.localizacao || 'Sem localização'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Tempo de Reserva Garantida */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="hoursInput" className="text-xs font-semibold text-slate-700">
                  Tempo de Reserva Garantida (Horas)
                </Label>
                <span className="text-[11px] text-emerald-700 font-medium">
                  Até{' '}
                  {limitPreview.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{' '}
                  de {limitPreview.toLocaleDateString('pt-BR')}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  id="hoursInput"
                  type="number"
                  min="1"
                  max="168"
                  value={guaranteeHours}
                  onChange={(e) => setGuaranteeHours(parseInt(e.target.value) || 24)}
                  className="text-xs font-mono font-medium"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setGuaranteeHours(24)}
                  className="text-xs shrink-0 text-slate-600"
                >
                  24 Horas
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setGuaranteeHours(48)}
                  className="text-xs shrink-0 text-slate-600"
                >
                  48 Horas
                </Button>
              </div>
            </div>

            {/* Card informativo de Disparo de Notificação */}
            <div className="bg-emerald-50/80 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-950 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                <Mail className="w-4 h-4 text-emerald-700" />
                <span>Canais de Comunicação Ativados:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-emerald-800">
                <li>
                  <strong>Notificação Push / Web:</strong> Alerta imediato no navegador/mobile do
                  leitor.
                </li>
                <li>
                  <strong>Notificação por E-mail:</strong> Disparo para {reserva.leitor?.email}.
                </li>
                <li>
                  <strong>Badge no Menu:</strong> Ponto de notificação em "Minhas Reservas".
                </li>
              </ul>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-medium shadow-sm"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Confirmar e Notificar Leitor
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
