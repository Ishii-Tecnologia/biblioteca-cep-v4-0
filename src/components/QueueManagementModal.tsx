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
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  ListOrdered,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  User,
  Clock,
  CheckCircle2,
  Bell,
  Mail,
  Loader2,
  Calendar,
  Sparkles,
} from 'lucide-react'
import { ReservasService, FilaItemAdmin } from '@/services/reservas'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'

interface QueueManagementModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  idTitulo: string
  tituloNome: string
  onQueueUpdated?: () => void
}

export function QueueManagementModal({
  open,
  onOpenChange,
  idTitulo,
  tituloNome,
  onQueueUpdated,
}: QueueManagementModalProps) {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [items, setItems] = useState<FilaItemAdmin[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null)

  const loadQueue = async () => {
    if (!idTitulo) return
    setLoading(true)
    try {
      const data = await ReservasService.getQueueByBook(idTitulo)
      setItems(data)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar fila',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && idTitulo) {
      loadQueue()
    }
  }, [open, idTitulo])

  // Pular Fila (Mover para o topo #1)
  const handlePromoteToTop = async (item: FilaItemAdmin) => {
    setActionLoadingId(item.id_reserva)
    try {
      const operator = profile?.full_name || 'Administrador'
      await ReservasService.promoteToTopOfQueue(item.id_reserva, operator)
      toast({
        title: 'Prioridade alterada (Pular Fila)',
        description: `O leitor ${item.leitor_nome} foi colocado na 1ª posição da fila com sucesso!`,
      })
      await loadQueue()
      if (onQueueUpdated) onQueueUpdated()
    } catch (err: any) {
      toast({
        title: 'Erro ao pular fila',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  // Mover posição na fila para cima ou para baixo
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= items.length) return

    const newItems = [...items]
    const temp = newItems[index]
    newItems[index] = newItems[targetIndex]
    newItems[targetIndex] = temp

    setItems(newItems)
    const operator = profile?.full_name || 'Administrador'

    try {
      const orderedIds = newItems.map((i) => i.id_reserva)
      await ReservasService.reorderQueue(idTitulo, orderedIds, operator)
      toast({
        title: 'Fila reordenada',
        description: 'Ordem de atendimento atualizada com sucesso.',
      })
      await loadQueue()
      if (onQueueUpdated) onQueueUpdated()
    } catch (err: any) {
      toast({
        title: 'Erro ao reordenar fila',
        description: err.message,
        variant: 'destructive',
      })
      await loadQueue()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <ListOrdered className="w-5 h-5 text-emerald-600" />
            Gestão da Fila de Espera
          </DialogTitle>
          <DialogDescription>
            Visualização completa e reordenação de prioridade de leitores para a obra{' '}
            <strong className="text-slate-900 font-semibold">"{tituloNome}"</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 pr-1 space-y-3">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <span>Carregando fila de espera do livro...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 border border-dashed rounded-xl bg-slate-50">
              Não há leitores aguardando na fila para esta obra.
            </div>
          ) : (
            items.map((item, index) => {
              const isFirst = index === 0
              const isLast = index === items.length - 1
              const isReady = item.status_reserva === 'Pronta para Retirada'

              return (
                <Card
                  key={item.id_reserva}
                  className={`p-3.5 border transition-all ${
                    isReady
                      ? 'border-emerald-300 bg-emerald-50/40'
                      : isFirst
                        ? 'border-amber-300 bg-amber-50/30'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          isReady
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : isFirst
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        #{index + 1}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {item.leitor_nome}
                          </span>
                          {isReady ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-semibold gap-1">
                              <Sparkles className="w-3 h-3 text-emerald-600" />
                              Pronta para Retirada (Reserva Garantida)
                            </Badge>
                          ) : isFirst ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-semibold gap-1">
                              <Clock className="w-3 h-3 text-amber-600" />
                              1º da Fila (Próximo a Receber)
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-slate-500">
                              Posição {index + 1} de {items.length}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          <span>{item.leitor_email}</span>
                          {item.leitor_telefone && <span>• {item.leitor_telefone}</span>}
                          <span>• Solicitado em: {formatDate(item.data_reserva)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Ações de Reordenação e Pular Fila */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      {!isFirst && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionLoadingId === item.id_reserva}
                          onClick={() => handlePromoteToTop(item)}
                          className="h-7 px-2.5 text-xs bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100 font-semibold gap-1"
                          title="Mover este leitor direto para a 1ª posição da fila"
                        >
                          <ChevronsUp className="w-3.5 h-3.5 text-amber-700" />
                          Pular Fila
                        </Button>
                      )}

                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={isFirst}
                          onClick={() => handleMove(index, 'up')}
                          className="h-7 w-7 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                          title="Subir posição"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={isLast}
                          onClick={() => handleMove(index, 'down')}
                          className="h-7 w-7 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                          title="Descer posição"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })
          )}
        </div>

        <DialogFooter className="border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
