import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useHeaderCounters } from '@/hooks/use-header-counters'
import { ReservasService, ReservaDetailed } from '@/services/reservas'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BookmarkCheck,
  Check,
  XCircle,
  Clock,
  Loader2,
  Book,
  User,
  PlusCircle,
  Calendar,
  ListOrdered,
  Sparkles,
  Bell,
  Mail,
  Hourglass,
} from 'lucide-react'
import { ReserveModal } from '@/components/ReserveModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import { QueueManagementModal } from '@/components/QueueManagementModal'
import { ReadyForPickupModal } from '@/components/ReadyForPickupModal'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'

export default function Reservas() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialStatus = searchParams.get('status') || 'Ativa'
  const filterMinhas = searchParams.get('minhas') === 'true'

  const { isOperadorOrAdmin, user, profile } = useAuth()
  const { toast } = useToast()
  const { refreshCounters } = useHeaderCounters()

  const [reservas, setReservas] = useState<ReservaDetailed[]>([])
  const [loading, setLoading] = useState(true)
  const [statusTab, setStatusTab] = useState<string>(initialStatus)
  const [onlyMyReservas, setOnlyMyReservas] = useState<boolean>(filterMinhas || !isOperadorOrAdmin)
  const [reserveModalOpen, setReserveModalOpen] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null)

  // Confirm modals state
  const [fulfillConfirmOpen, setFulfillConfirmOpen] = useState(false)
  const [reservaToFulfill, setReservaToFulfill] = useState<ReservaDetailed | null>(null)

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [reservaToCancel, setReservaToCancel] = useState<ReservaDetailed | null>(null)

  // Queue and Ready Modals
  const [queueModalOpen, setQueueModalOpen] = useState(false)
  const [queueBookInfo, setQueueBookInfo] = useState<{ id: string; title: string }>({
    id: '',
    title: '',
  })

  const [readyModalOpen, setReadyModalOpen] = useState(false)
  const [reservaToReady, setReservaToReady] = useState<ReservaDetailed | null>(null)

  const loadReservas = async () => {
    setLoading(true)
    try {
      // 1. Checar e expirar automaticamente reservas cujo prazo de retirada em dias úteis expirou
      try {
        await ReservasService.checkAndExpirePickupDeadlines(profile?.full_name || 'Sistema')
      } catch (expireErr) {
        console.warn('Erro na checagem de expiração de reservas:', expireErr)
      }

      let data: ReservaDetailed[] = []
      if (!isOperadorOrAdmin || onlyMyReservas) {
        if (profile?.id_leitor) {
          data = await ReservasService.getByLeitor(profile.id_leitor, statusTab)
        } else {
          // Fallback: carregar todas e filtrar por email/id_auth
          const all = await ReservasService.getAll(statusTab)
          data = all.filter(
            (r) =>
              r.leitor?.email?.toLowerCase() === user?.email?.toLowerCase() ||
              (profile?.id_leitor && r.id_leitor === profile.id_leitor),
          )
        }
      } else {
        data = await ReservasService.getAll(statusTab)
      }
      setReservas(data)
      refreshCounters()
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar reservas',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const s = searchParams.get('status')
    if (s && s !== statusTab) {
      setStatusTab(s)
    }
    const m = searchParams.get('minhas') === 'true'
    if (m !== onlyMyReservas) {
      setOnlyMyReservas(m || !isOperadorOrAdmin)
    }
  }, [searchParams])

  useEffect(() => {
    loadReservas()
  }, [statusTab, onlyMyReservas, profile?.id_leitor, isOperadorOrAdmin])

  const handleFulfill = (res: ReservaDetailed) => {
    setReservaToFulfill(res)
    setFulfillConfirmOpen(true)
  }

  const handleOpenQueueManagement = (res: ReservaDetailed) => {
    setQueueBookInfo({
      id: res.id_titulo,
      title: res.titulo?.titulo_de_livro || res.id_titulo,
    })
    setQueueModalOpen(true)
  }

  const handleOpenReadyForPickup = (res: ReservaDetailed) => {
    setReservaToReady(res)
    setReadyModalOpen(true)
  }

  const executeFulfill = async () => {
    if (!reservaToFulfill) return
    setActionLoadingId(reservaToFulfill.id_reserva)
    try {
      await ReservasService.fulfill(reservaToFulfill.id_reserva)
      toast({
        title: 'Reserva atendida',
        description: 'Empréstimo gerado e registrado no histórico com sucesso.',
      })
      setFulfillConfirmOpen(false)
      setReservaToFulfill(null)
      await loadReservas()
      refreshCounters()
    } catch (err: any) {
      toast({
        title: 'Erro ao atender reserva',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleCancel = (res: ReservaDetailed) => {
    setReservaToCancel(res)
    setCancelConfirmOpen(true)
  }

  const executeCancel = async () => {
    if (!reservaToCancel) return
    setActionLoadingId(reservaToCancel.id_reserva)
    try {
      await ReservasService.cancel(reservaToCancel.id_reserva)
      toast({
        title: 'Reserva cancelada',
        description: 'A solicitação foi encerrada.',
      })
      setCancelConfirmOpen(false)
      setReservaToCancel(null)
      await loadReservas()
      refreshCounters()
    } catch (err: any) {
      toast({
        title: 'Erro ao cancelar reserva',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BookmarkCheck className="w-6 h-6 text-emerald-600" />
            Reservas & Fila de Espera
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Gerenciamento de solicitações de reserva para obras com todos os exemplares emprestados.
          </p>
        </div>

        <Button
          onClick={() => setReserveModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-2 shadow-sm"
        >
          <PlusCircle className="w-4 h-4" />
          Nova Reserva
        </Button>
      </div>

      {/* Tabs and Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <Tabs
          value={statusTab}
          onValueChange={(val) => {
            setStatusTab(val)
            const nextParams = new URLSearchParams(searchParams)
            nextParams.set('status', val)
            setSearchParams(nextParams)
          }}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid grid-cols-4 w-full sm:w-96 bg-slate-100 p-1">
            <TabsTrigger value="Ativa" className="text-xs font-semibold">
              Ativas na Fila
            </TabsTrigger>
            <TabsTrigger value="Atendida" className="text-xs font-semibold">
              Atendidas
            </TabsTrigger>
            <TabsTrigger value="Cancelada" className="text-xs font-semibold">
              Canceladas
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs font-semibold">
              Todas
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {isOperadorOrAdmin && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              size="sm"
              variant={onlyMyReservas ? 'default' : 'outline'}
              onClick={() => {
                const next = !onlyMyReservas
                setOnlyMyReservas(next)
                const nextParams = new URLSearchParams(searchParams)
                if (next) nextParams.set('minhas', 'true')
                else nextParams.delete('minhas')
                setSearchParams(nextParams)
              }}
              className={`h-8 text-xs ${
                onlyMyReservas
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'text-slate-600 border-slate-200'
              }`}
            >
              <User className="w-3.5 h-3.5 mr-1" />
              {onlyMyReservas ? 'Exibindo: Minhas Reservas' : 'Filtrar Minhas Reservas'}
            </Button>
          </div>
        )}
      </div>

      {!isOperadorOrAdmin && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Você está acompanhando a fila de espera das suas reservas ativas. Quando um exemplar
              for devolvido, a equipe da biblioteca atualizará seu pedido.
            </span>
          </div>
        </div>
      )}

      {/* List of reservations */}
      {loading ? (
        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="text-xs text-slate-500 font-medium">Buscando lista de reservas...</p>
        </div>
      ) : reservas.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 p-12 text-center bg-slate-50/50">
          <div className="max-w-md mx-auto space-y-3">
            <BookmarkCheck className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-semibold text-slate-800">Nenhuma reserva encontrada</h3>
            <p className="text-xs text-slate-500">
              Não constam solicitações para a categoria selecionada.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {reservas.map((res) => {
            const isLoadingThis = actionLoadingId === res.id_reserva
            return (
              <Card
                key={res.id_reserva}
                className="border-slate-200 bg-white hover:border-emerald-300 transition-all shadow-sm"
              >
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded border">
                        Reserva #{res.id_reserva}
                      </span>
                      {res.status_reserva === 'Pronta para Retirada' && (
                        <span className="inline-flex items-center rounded-full border border-emerald-400 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900 gap-1 select-none pointer-events-none animate-pulse">
                          <Sparkles className="w-3 h-3 text-emerald-600" />
                          Pronto para Retirada (Reserva Garantida)
                        </span>
                      )}
                      {res.status_reserva === 'Ativa' && (
                        <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 gap-1 select-none pointer-events-none">
                          <Clock className="w-3 h-3 text-amber-600" />
                          {res.posicao_fila ? (
                            <span>
                              {res.posicao_fila}º lugar na fila
                              {res.total_fila && res.total_fila > 1
                                ? ` (de ${res.total_fila} leitores)`
                                : ''}
                            </span>
                          ) : (
                            'Aguardando Disponibilidade'
                          )}
                        </span>
                      )}
                      {res.status_reserva === 'Atendida' && (
                        <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 gap-1 select-none pointer-events-none">
                          <Check className="w-3 h-3 text-emerald-600" />
                          Atendida em {formatDate(res.data_atendimento)}
                        </span>
                      )}
                      {res.status_reserva === 'Cancelada' && (
                        <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 select-none pointer-events-none">
                          Cancelada
                        </span>
                      )}
                    </div>

                    {/* Bloco de Reserva Garantida (Pronta para Retirada) */}
                    {res.status_reserva === 'Pronta para Retirada' && (
                      <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3 text-xs text-emerald-950 flex items-start gap-2.5 mt-1 shadow-xs">
                        <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <p className="font-bold text-emerald-900 flex items-center gap-1.5">
                              Exemplar reservado aguardando sua retirada!
                            </p>
                            {res.data_limite_retirada && (
                              <span className="text-[11px] font-semibold bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded border border-emerald-400">
                                Reserva Garantida até: {formatDate(res.data_limite_retirada)}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-emerald-800 leading-relaxed">
                            O livro já está separado na recepção da biblioteca. Compareça dentro do
                            prazo de reserva garantida (
                            {res.horas_restantes_garantida
                              ? `aprox. ${res.horas_restantes_garantida}h restantes`
                              : '24 horas'}
                            ) para concluir a retirada física.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Bloco de Acompanhamento da Fila e Previsão de Devolução */}
                    {res.status_reserva === 'Ativa' && (
                      <div className="bg-amber-50/80 border border-amber-200/90 rounded-lg p-2.5 text-xs text-amber-900 flex items-start gap-2.5 mt-1">
                        <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <p className="font-semibold text-amber-950">
                              {res.posicao_fila === 1
                                ? 'Você é o próximo na fila de espera!'
                                : `Posição na fila: ${res.posicao_fila}º lugar`}
                            </p>
                            {res.data_estimada_disponibilidade && (
                              <span className="text-[11px] bg-amber-100 text-amber-900 font-medium px-2 py-0.5 rounded border border-amber-300/70 flex items-center gap-1">
                                <Hourglass className="w-3 h-3 text-amber-700" />
                                Previsão de disponibilidade:{' '}
                                {formatDate(res.data_estimada_disponibilidade)}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-amber-800 leading-relaxed">
                            Estimativa calculada a partir do prazo de devolução dos exemplares
                            atualmente emprestados. Você será notificado por e-mail/push assim que o
                            livro for liberado.
                          </p>
                        </div>
                      </div>
                    )}

                    {res.status_reserva === 'Atendida' && (
                      <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-lg p-2.5 text-xs text-emerald-900 flex items-start gap-2.5 mt-1">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <p className="font-semibold text-emerald-950">
                            Histórico do Atendimento:{' '}
                            <span className="font-normal text-emerald-800">
                              Reserva atendida em {formatDate(res.data_atendimento)}
                            </span>
                          </p>
                          <p className="text-[11px] text-emerald-800 leading-relaxed">
                            {res.historico_evento?.descricao ||
                              `A reserva #${res.id_reserva} foi atendida com sucesso e convertida em empréstimo para retirada na biblioteca.`}
                          </p>
                        </div>
                      </div>
                    )}

                    {res.status_reserva === 'Cancelada' && res.historico_evento && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 flex items-start gap-2.5 mt-1">
                        <XCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <p className="font-semibold text-slate-900">Histórico da Solicitação:</p>
                          <p className="text-[11px] text-slate-600 leading-relaxed">
                            {res.historico_evento.descricao}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="flex items-start gap-2">
                        <Book className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-slate-900 leading-snug">
                            {res.titulo?.titulo_de_livro}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {res.titulo?.autor} • Código: {res.id_titulo}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <User className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-slate-900 leading-snug">
                            {res.leitor?.nome_do_leitor}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {res.leitor?.email}{' '}
                            {res.leitor?.telefone ? `• ${res.leitor?.telefone}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dates & Actions */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      Solicitado em:{' '}
                      <span className="font-semibold text-slate-700">
                        {formatDate(res.data_reserva)}
                      </span>
                    </div>

                    {(res.status_reserva === 'Ativa' ||
                      res.status_reserva === 'Pronta para Retirada') &&
                      isOperadorOrAdmin && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenQueueManagement(res)}
                            className="h-8 text-xs border-slate-200 text-slate-700 hover:bg-slate-100 gap-1 font-medium"
                            title="Ver e gerenciar a ordem de todos os leitores nesta fila"
                          >
                            <ListOrdered className="w-3.5 h-3.5 text-indigo-600" />
                            Ver Fila Completa
                          </Button>

                          {res.status_reserva === 'Ativa' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenReadyForPickup(res)}
                              className="h-8 text-xs bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 gap-1 font-medium"
                              title="Liberar livro com tempo garantido e notificar leitor"
                            >
                              <Bell className="w-3.5 h-3.5 text-emerald-700" />
                              Liberar p/ Retirada
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isLoadingThis}
                            onClick={() => handleCancel(res)}
                            className="h-8 text-xs border-slate-200 text-slate-600 hover:bg-slate-100 gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Cancelar
                          </Button>

                          <Button
                            size="sm"
                            disabled={isLoadingThis}
                            onClick={() => handleFulfill(res)}
                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1 shadow-sm"
                          >
                            {isLoadingThis ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Concluir Empréstimo
                          </Button>
                        </div>
                      )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modals */}
      <ReserveModal
        open={reserveModalOpen}
        onOpenChange={setReserveModalOpen}
        onSuccess={loadReservas}
      />

      <ConfirmModal
        open={fulfillConfirmOpen}
        onOpenChange={setFulfillConfirmOpen}
        title="Atender Reserva"
        description={`Deseja marcar a reserva #${reservaToFulfill?.id_reserva} do livro "${reservaToFulfill?.titulo?.titulo_de_livro}" para o leitor ${reservaToFulfill?.leitor?.nome_do_leitor} como atendida?`}
        confirmLabel="Confirmar Atendimento"
        variant="primary"
        loading={actionLoadingId === reservaToFulfill?.id_reserva}
        onConfirm={executeFulfill}
      />

      {/* Modal de Gestão Completa de Fila e Reordenação (Admin) */}
      <QueueManagementModal
        open={queueModalOpen}
        onOpenChange={setQueueModalOpen}
        idTitulo={queueBookInfo.id}
        tituloNome={queueBookInfo.title}
        onQueueUpdated={loadReservas}
      />

      {/* Modal de Liberar para Retirada (Reserva Garantida + Notificação) */}
      <ReadyForPickupModal
        open={readyModalOpen}
        onOpenChange={setReadyModalOpen}
        reserva={reservaToReady}
        onSuccess={loadReservas}
      />

      <ConfirmModal
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title="Cancelar Reserva"
        description={
          reservaToCancel ? (
            <div className="space-y-1.5">
              <p>Deseja realmente cancelar a reserva:</p>
              <p className="text-rose-600 font-semibold break-words">
                Reserva #{reservaToCancel.id_reserva} — "
                {reservaToCancel.titulo?.titulo_de_livro || 'Livro'}" para{' '}
                {reservaToCancel.leitor?.nome_do_leitor || 'Leitor'}
              </p>
              <p className="text-slate-500">Esta ação não pode ser desfeita.</p>
            </div>
          ) : (
            'Tem certeza que deseja cancelar esta reserva? Esta ação não pode ser desfeita.'
          )
        }
        confirmLabel="Sim, Cancelar Reserva"
        variant="destructive"
        loading={actionLoadingId === reservaToCancel?.id_reserva}
        onConfirm={executeCancel}
      />
    </div>
  )
}
