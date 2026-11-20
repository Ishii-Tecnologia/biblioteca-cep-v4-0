import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  ExemplaresService,
  Exemplar,
  EXEMPLAR_CONDICOES,
  getCondicaoLabel,
  getCondicaoBadgeClasses,
} from '@/services/exemplares'
import { TituloWithStats } from '@/services/titulos'
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  AlertTriangle,
  Wrench,
  ChevronDown,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { useHeaderCounters } from '@/hooks/use-header-counters'
import { ConfirmModal } from '@/components/ConfirmModal'

interface CopiesModalProps {
  isOpen: boolean
  onClose: () => void
  book: TituloWithStats | null
  onUpdate: () => void
}

export const CopiesModal: React.FC<CopiesModalProps> = ({ isOpen, onClose, book, onUpdate }) => {
  const { toast } = useToast()
  const { user, profile } = useAuth()
  const { refreshCounters } = useHeaderCounters()

  const [copies, setCopies] = useState<Exemplar[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)

  // Add copies form
  const [newCopiesQty, setNewCopiesQty] = useState(1)
  const [newCopiesLocation, setNewCopiesLocation] = useState('Estante Geral')
  const [newCopiesCondicao, setNewCopiesCondicao] = useState<string>(EXEMPLAR_CONDICOES[1])

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStatus, setEditStatus] = useState<string>('')
  const [editLocation, setEditLocation] = useState<string>('')
  const [editObservacao, setEditObservacao] = useState<string>('')
  const [editCondicao, setEditCondicao] = useState<string>(EXEMPLAR_CONDICOES[1])
  const [savingEdit, setSavingEdit] = useState(false)

  // Delete confirm state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [copyToDelete, setCopyToDelete] = useState<Exemplar | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  // Id do exemplar com troca de condição em andamento (selo da listagem)
  const [savingCondicaoId, setSavingCondicaoId] = useState<string | null>(null)

  const { isOperadorOrAdmin } = useAuth()

  const loadCopies = async () => {
    if (!book) return
    setLoading(true)
    try {
      const data = await ExemplaresService.getByTitulo(book.id_titulo)
      setCopies(data || [])
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar exemplares',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && book) {
      loadCopies()
      setEditingId(null)
      setEditObservacao('')
    }
  }, [isOpen, book])

  const handleAddCopies = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!book) return

    setAdding(true)
    try {
      const operadorInfo = {
        nome: profile?.nome || profile?.full_name || profile?.email || user?.email || 'Operador',
        id: user?.id || profile?.id,
      }
      await ExemplaresService.create(
        book.id_titulo,
        newCopiesLocation,
        newCopiesQty,
        operadorInfo,
        newCopiesCondicao,
      )
      toast({
        title: 'Exemplares adicionados',
        description: `${newCopiesQty} novo(s) exemplar(es) criado(s).`,
      })
      setNewCopiesQty(1)
      setNewCopiesCondicao(EXEMPLAR_CONDICOES[1])
      await loadCopies()
      onUpdate()
      refreshCounters()
    } catch (err: any) {
      toast({
        title: 'Erro ao adicionar exemplares',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setAdding(false)
    }
  }

  const handleStartEdit = (copy: Exemplar) => {
    setEditingId(copy.id_exemplar)
    setEditStatus(copy.status)
    setEditLocation(copy.localizacao || '')
    setEditObservacao('')
    // Pré-preencher com a condição atual do exemplar (normalizada para um valor válido da lista)
    const condicaoAtual = EXEMPLAR_CONDICOES.includes((copy.condicao ?? '') as any)
      ? (copy.condicao as string)
      : EXEMPLAR_CONDICOES[1]
    setEditCondicao(condicaoAtual)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditStatus('')
    setEditLocation('')
    setEditObservacao('')
    setEditCondicao(EXEMPLAR_CONDICOES[1])
  }

  const handleSaveEdit = async (copyId: string) => {
    setSavingEdit(true)
    try {
      const operatorName =
        profile?.nome || profile?.full_name || profile?.email || user?.email || 'Operador'
      const operatorId = user?.id || profile?.id || null
      await ExemplaresService.updateStatus(
        copyId,
        editStatus,
        editLocation,
        editObservacao,
        operatorName,
        operatorId,
        editCondicao,
      )
      toast({
        title: 'Exemplar atualizado',
        description: `Exemplar ${copyId} atualizado: status "${editStatus}", condição "${editCondicao}".`,
      })
      handleCancelEdit()
      await loadCopies()
      onUpdate()
      refreshCounters()
    } catch (err: any) {
      toast({
        title: 'Erro ao atualizar exemplar',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeleteCopy = (copy: Exemplar) => {
    setCopyToDelete(copy)
    setDeleteConfirmOpen(true)
  }

  const executeDeleteCopy = async () => {
    if (!copyToDelete) return
    setDeleteLoading(true)
    try {
      const operadorInfo = {
        nome: profile?.nome || profile?.full_name || profile?.email || user?.email || 'Operador',
        id: user?.id || profile?.id,
      }
      await ExemplaresService.delete(copyToDelete.id_exemplar, operadorInfo)
      toast({
        title: 'Exemplar removido',
        description: `O exemplar ${copyToDelete.id_exemplar} foi excluído com sucesso.`,
      })
      setDeleteConfirmOpen(false)
      setCopyToDelete(null)
      await loadCopies()
      onUpdate()
      refreshCounters()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir exemplar',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setDeleteLoading(false)
    }
  }

  // Troca rápida de condição direto no selo da listagem (atalho — a edição completa
  // pelo formulário do lápis continua disponível). Persiste via updateStatus,
  // que grava o log "Alteração de Exemplar" no histórico quando só a condição muda.
  const handleChangeCondicao = async (copy: Exemplar, novaCondicao: string) => {
    const condicaoAtual = copy.condicao || EXEMPLAR_CONDICOES[1]
    if (novaCondicao === condicaoAtual) return

    // Atualização otimista: mostra o selo novo na hora; reverte se falhar
    setSavingCondicaoId(copy.id_exemplar)
    setCopies((prev) =>
      prev.map((c) => (c.id_exemplar === copy.id_exemplar ? { ...c, condicao: novaCondicao } : c)),
    )

    try {
      const operatorName =
        profile?.nome || profile?.full_name || profile?.email || user?.email || 'Operador'
      const operatorId = user?.id || profile?.id || null
      await ExemplaresService.updateStatus(
        copy.id_exemplar,
        copy.status,
        copy.localizacao ?? undefined,
        undefined,
        operatorName,
        operatorId,
        novaCondicao,
      )
      toast({
        title: 'Condição atualizada',
        description: `Exemplar ${copy.id_exemplar}: condição alterada para "${novaCondicao}".`,
      })
      await loadCopies()
      onUpdate()
      refreshCounters()
    } catch (err: any) {
      // Reverter ao valor anterior
      setCopies((prev) =>
        prev.map((c) =>
          c.id_exemplar === copy.id_exemplar ? { ...c, condicao: condicaoAtual } : c,
        ),
      )
      toast({
        title: 'Erro ao atualizar condição',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSavingCondicaoId(null)
    }
  }

  // Selo de condição clicável: abre dropdown com as 5 opções; a atual fica marcada.
  // Para leitores (sem permissão de edição), o selo é renderizado estático.
  const renderCondicaoBadge = (copy: Exemplar) => {
    const badge = (
      <Badge
        className={`${getCondicaoBadgeClasses(copy.condicao)} ${
          isOperadorOrAdmin ? 'cursor-pointer hover:brightness-95 gap-1' : ''
        }`}
      >
        Condição: {getCondicaoLabel(copy.condicao)}
        {isOperadorOrAdmin && <ChevronDown className="w-3 h-3 opacity-70" />}
      </Badge>
    )

    if (!isOperadorOrAdmin) return badge

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{badge}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[9rem]">
          {EXEMPLAR_CONDICOES.map((c) => {
            const isCurrent = c === getCondicaoLabel(copy.condicao)
            return (
              <DropdownMenuItem
                key={c}
                disabled={isCurrent || savingCondicaoId === copy.id_exemplar}
                className="text-xs gap-2"
                onSelect={() => handleChangeCondicao(copy, c)}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${getCondicaoBadgeClasses(c).split(' ')[0]}`}
                />
                {c}
                {isCurrent && <Check className="w-3.5 h-3.5 ml-auto text-emerald-600" />}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Disponivel':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
            Disponível
          </Badge>
        )
      case 'Emprestado':
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
            Emprestado
          </Badge>
        )
      case 'Reservado':
        return (
          <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30">
            Reservado
          </Badge>
        )
      case 'Manutencao':
      case 'EM_MANUTENCAO':
      case 'Em Manutencao':
        return (
          <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 gap-1">
            <Wrench className="w-3 h-3" /> Em Manutenção
          </Badge>
        )
      case 'Perdido':
        return <Badge variant="destructive">Perdido / Baixado</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Gerenciar Exemplares: {book?.titulo_de_livro}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Código: <span className="font-mono">{book?.id_titulo}</span> | Total de exemplares
            cadastrados: <span className="font-semibold">{copies.length}</span>
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-2">
          {/* Formulário para Adicionar Novos Exemplares (Apenas Operador ou Administrador) */}
          {isOperadorOrAdmin && (
            <form
              onSubmit={handleAddCopies}
              className="p-4 bg-muted/40 rounded-xl border border-border space-y-3"
            >
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Adicionar Novos Exemplares
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Quantidade</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={newCopiesQty}
                    onChange={(e) => setNewCopiesQty(parseInt(e.target.value, 10) || 1)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Localização Física</Label>
                  <Input
                    value={newCopiesLocation}
                    onChange={(e) => setNewCopiesLocation(e.target.value)}
                    placeholder="Ex: Estante A, Gaveta 2"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Condição</Label>
                  <Select value={newCopiesCondicao} onValueChange={(v) => setNewCopiesCondicao(v)}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXEMPLAR_CONDICOES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={adding} className="gap-1.5 w-full text-xs h-9">
                  {adding ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Adicionar
                </Button>
              </div>
            </form>
          )}

          {/* Tabela de Exemplares Existentes */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Exemplares Cadastrados
            </h4>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : copies.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg">
                Nenhum exemplar cadastrado para este título.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden divide-y divide-border">
                {copies.map((copy) => {
                  const isEditing = editingId === copy.id_exemplar

                  return (
                    <div
                      key={copy.id_exemplar}
                      className="p-3.5 hover:bg-muted/30 transition-colors"
                    >
                      {isEditing ? (
                        <div className="space-y-3 bg-muted/50 p-3 rounded-lg border border-border">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-xs">
                              Exemplar {copy.id_exemplar} (Seq #{copy.seq})
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleSaveEdit(copy.id_exemplar)}
                                disabled={savingEdit}
                                className="h-7 px-2.5 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                              >
                                {savingEdit ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                                Salvar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleCancelEdit}
                                disabled={savingEdit}
                                className="h-7 px-2 text-xs"
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="space-y-1">
                              <Label className="text-xs font-medium">Status do Exemplar</Label>
                              <Select value={editStatus} onValueChange={setEditStatus}>
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Disponivel">Disponível</SelectItem>
                                  <SelectItem value="Emprestado">Emprestado</SelectItem>
                                  <SelectItem value="Reservado">Reservado</SelectItem>
                                  <SelectItem value="Manutencao">Em Manutenção</SelectItem>
                                  <SelectItem value="Perdido">Perdido / Baixa</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs font-medium">Localização Física</Label>
                              <Input
                                value={editLocation}
                                onChange={(e) => setEditLocation(e.target.value)}
                                className="h-8 text-xs"
                                placeholder="Estante..."
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs font-medium">Condição</Label>
                              <Select value={editCondicao} onValueChange={setEditCondicao}>
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {EXEMPLAR_CONDICOES.map((c) => (
                                    <SelectItem key={c} value={c}>
                                      {c}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Campo de observação para Histórico Geral (F-03) */}
                          <div className="space-y-1">
                            <Label className="text-xs font-medium flex items-center gap-1">
                              Observação / Motivo (Registrado no Histórico Geral)
                            </Label>
                            <Input
                              value={editObservacao}
                              onChange={(e) => setEditObservacao(e.target.value)}
                              className="h-8 text-xs"
                              placeholder="Ex: Capa solta, encadernação danificada, enviado para restauração..."
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs">
                                {copy.id_exemplar}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                (Exemplar #{copy.seq})
                              </span>
                              {getStatusBadge(copy.status)}
                              {renderCondicaoBadge(copy)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Localização:{' '}
                              <span className="font-medium text-foreground">
                                {copy.localizacao || 'Não especificada'}
                              </span>
                            </div>
                          </div>

                          {isOperadorOrAdmin && (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStartEdit(copy)}
                                className="h-8 px-2.5 text-xs gap-1"
                                title="Editar status ou localização"
                              >
                                <Edit2 className="w-3 h-3" />
                                Alterar Status
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteCopy(copy)}
                                disabled={copy.status === 'Emprestado'}
                                className="h-8 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                title={
                                  copy.status === 'Emprestado'
                                    ? 'Não pode excluir exemplar emprestado'
                                    : 'Excluir exemplar'
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>

      <ConfirmModal
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Excluir Exemplar"
        description={
          copyToDelete ? (
            <div className="space-y-1.5">
              <p>Deseja realmente excluir o exemplar:</p>
              <p className="text-rose-600 font-semibold break-words">
                "{book?.titulo_de_livro || 'Livro'}" — Exemplar {copyToDelete.id_exemplar} (Seq #
                {copyToDelete.seq})
              </p>
              <p className="text-slate-500">Esta ação não pode ser desfeita.</p>
            </div>
          ) : (
            'Tem certeza que deseja excluir este exemplar? Esta ação não pode ser desfeita.'
          )
        }
        confirmLabel="Sim, Excluir Exemplar"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={executeDeleteCopy}
      />
    </Dialog>
  )
}
