import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { PreReservasService, PreReservaDetailed, PreReservaStatus } from '@/services/pre-reservas'
import { formatDateBR } from '@/lib/utils'
import {
  Clock,
  CheckCircle,
  XCircle,
  Search,
  RefreshCw,
  BookOpen,
  User,
  AlertCircle,
  CheckCircle2,
  Calendar,
} from 'lucide-react'

export function PreReservasQueueTab() {
  const { profile } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<PreReservaDetailed[]>([])
  const [statusFilter, setStatusFilter] = useState<PreReservaStatus | 'all'>('PENDENTE_VALIDACAO')
  const [searchTerm, setSearchTerm] = useState('')

  // Modal de Rejeição
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [itemToReject, setItemToReject] = useState<PreReservaDetailed | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Modal de Aprovação / Confirmação
  const [approveModalOpen, setApproveModalOpen] = useState(false)
  const [itemToApprove, setItemToApprove] = useState<PreReservaDetailed | null>(null)

  useEffect(() => {
    loadItems()
  }, [statusFilter])

  async function loadItems() {
    try {
      setLoading(true)
      const data = await PreReservasService.getAll(statusFilter)
      setItems(data)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar pré-reservas',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const filteredItems = items.filter((item) => {
    const q = searchTerm.toLowerCase()
    const readerName = item.leitor?.nome_do_leitor?.toLowerCase() || ''
    const bookTitle = item.livro?.titulo_de_livro?.toLowerCase() || ''
    const bookId = item.livro_id.toLowerCase()
    return readerName.includes(q) || bookTitle.includes(q) || bookId.includes(q)
  })

  async function handleApprove() {
    if (!itemToApprove) return
    try {
      setActionLoading(true)
      const opNome = profile?.nome || 'Operador'
      const opId = profile?.id

      const res = await PreReservasService.validar(
        itemToApprove.id,
        'APROVAR',
        undefined,
        opId,
        opNome,
      )

      toast({
        title: 'Pré-reserva Aprovada!',
        description: res.mensagem || 'Fluxo processado com sucesso conforme disponibilidade.',
      })

      setApproveModalOpen(false)
      setItemToApprove(null)
      loadItems()
    } catch (err: any) {
      const msg = err?.message || 'Falha ao validar pré-reserva.'
      toast({
        title: 'Erro na aprovação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReject() {
    if (!itemToReject) return
    try {
      setActionLoading(true)
      const opNome = profile?.nome || 'Operador'
      const opId = profile?.id

      const res = await PreReservasService.validar(
        itemToReject.id,
        'REJEITAR',
        rejectReason.trim() || 'Solicitação rejeitada pelo operador.',
        opId,
        opNome,
      )

      toast({
        title: 'Pré-reserva Rejeitada',
        description: res.mensagem || 'Solicitação encerrada.',
      })

      setRejectModalOpen(false)
      setItemToReject(null)
      setRejectReason('')
      loadItems()
    } catch (err: any) {
      toast({
        title: 'Erro ao rejeitar',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            Fila de Pré-reservas (Solicitações de Livros)
          </h3>
          <p className="text-sm text-muted-foreground">
            Validação determinística pelo operador conforme Seção 4 da especificação.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={loadItems}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-lg border w-full sm:w-auto text-xs">
          <Button
            variant={statusFilter === 'PENDENTE_VALIDACAO' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setStatusFilter('PENDENTE_VALIDACAO')}
          >
            Pendentes
          </Button>
          <Button
            variant={statusFilter === 'APROVADO' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setStatusFilter('APROVADO')}
          >
            Aprovadas
          </Button>
          <Button
            variant={statusFilter === 'REJEITADO' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setStatusFilter('REJEITADO')}
          >
            Rejeitadas
          </Button>
          <Button
            variant={statusFilter === 'all' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setStatusFilter('all')}
          >
            Todas
          </Button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por leitor ou livro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      {/* Lista de Pré-reservas */}
      {loading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Carregando solicitações de pré-reserva...
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma pré-reserva encontrada com o filtro selecionado.
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredItems.map((item) => {
            const hasCopiesAvailable = (item.exemplares_disponiveis || 0) > 0
            const queueFull = (item.total_fila || 0) >= 2

            return (
              <Card
                key={item.id}
                className="overflow-hidden border hover:border-primary/40 transition-colors"
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Dados do Livro e Leitor */}
                    <div className="flex items-start gap-3.5">
                      {item.livro?.capa_url ? (
                        <img
                          src={item.livro.capa_url}
                          alt={item.livro.titulo_de_livro}
                          className="w-14 h-20 object-cover rounded shadow-sm shrink-0 border"
                        />
                      ) : (
                        <div className="w-14 h-20 bg-muted flex items-center justify-center rounded shrink-0 border">
                          <BookOpen className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-base leading-tight">
                            {item.livro?.titulo_de_livro || `Livro #${item.livro_id}`}
                          </h4>
                          <Badge
                            variant={
                              item.status === 'PENDENTE_VALIDACAO'
                                ? 'outline'
                                : item.status === 'APROVADO'
                                  ? 'default'
                                  : 'destructive'
                            }
                            className="text-xs"
                          >
                            {item.status}
                          </Badge>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {item.livro?.autor || 'Autor não informado'} • Cód: {item.livro_id} •
                          Coleção: {item.livro?.colecao || 'Geral'}
                        </p>

                        <div className="pt-1 flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            <User className="w-3.5 h-3.5 text-blue-600" />
                            {item.leitor?.nome_do_leitor || `Leitor #${item.leitor_id}`}
                          </span>
                          {item.leitor?.email && <span>{item.leitor.email}</span>}
                          {item.leitor?.telefone && <span>{item.leitor.telefone}</span>}
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            Solicitado em: {formatDateBR(item.created_at)}
                          </span>
                        </div>

                        {/* Status de Disponibilidade em tempo real para tomada de decisão */}
                        <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
                          {hasCopiesAvailable ? (
                            <Badge
                              variant="secondary"
                              className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              {item.exemplares_disponiveis} exemplar(es) disponível(is) → Gerará
                              EMPRÉSTIMO (PENDENTE_RETIRADA)
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
                            >
                              <AlertCircle className="w-3.5 h-3.5 mr-1" />
                              Sem exemplares disponíveis (Fila: {item.total_fila || 0}/2) →{' '}
                              {queueFull ? 'Fila Cheia (Rejeitará)' : 'Entrará na Fila de Reserva'}
                            </Badge>
                          )}

                          {item.resultado_fluxo && (
                            <span className="text-[11px] text-muted-foreground">
                              Resultado: <strong>{item.resultado_fluxo}</strong>
                            </span>
                          )}

                          {item.motivo_rejeicao && (
                            <span className="text-[11px] text-rose-600 font-medium">
                              Motivo: {item.motivo_rejeicao}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ações do Operador */}
                    {item.status === 'PENDENTE_VALIDACAO' && (
                      <div className="flex md:flex-col items-center gap-2 justify-end shrink-0 pt-2 md:pt-0">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 w-full md:w-28"
                          onClick={() => {
                            setItemToApprove(item)
                            setApproveModalOpen(true)
                          }}
                        >
                          <CheckCircle className="w-4 h-4" />
                          Aprovar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-rose-600 border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1.5 w-full md:w-28"
                          onClick={() => {
                            setItemToReject(item)
                            setRejectModalOpen(true)
                          }}
                        >
                          <XCircle className="w-4 h-4" />
                          Rejeitar
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal de Confirmação de Aprovação */}
      <Dialog open={approveModalOpen} onOpenChange={setApproveModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aprovar Pré-reserva</DialogTitle>
            <DialogDescription>
              Confirmar aprovação determinística da solicitação de{' '}
              <strong>{itemToApprove?.leitor?.nome_do_leitor}</strong> para o livro{' '}
              <strong>{itemToApprove?.livro?.titulo_de_livro}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="text-xs space-y-2 py-2">
            <p className="text-muted-foreground">
              O sistema executará a validação transacional no banco com Lock row-level:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Valida limite de 4 empréstimos e 4 reservas do leitor.</li>
              <li>
                Se houver exemplar DISPONÍVEL: exemplar vira BLOQUEADO e empréstimo entra em
                PENDENTE_RETIRADA com prazo de 4 dias úteis.
              </li>
              <li>
                Se não houver exemplar DISPONÍVEL e a fila tiver menos de 2 leitores: entra na fila
                de reserva e agenda empréstimo para o dia seguinte à devolução.
              </li>
              <li>
                Se a fila estiver com 2 leitores: rejeita com "Não há disponibilidade para mais
                reservas."
              </li>
            </ul>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setApproveModalOpen(false)}
              disabled={actionLoading}
            >
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleApprove}
              disabled={actionLoading}
            >
              {actionLoading ? 'Processando...' : 'Confirmar Aprovação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Rejeição */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar Pré-reserva</DialogTitle>
            <DialogDescription>
              Informe o motivo da rejeição da solicitação de{' '}
              <strong>{itemToReject?.leitor?.nome_do_leitor}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Textarea
              placeholder="Ex.: Leitor possui pendências documentais, ou obra restrita temporariamente..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setRejectModalOpen(false)}
              disabled={actionLoading}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={actionLoading}>
              {actionLoading ? 'Rejeitando...' : 'Confirmar Rejeição'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
