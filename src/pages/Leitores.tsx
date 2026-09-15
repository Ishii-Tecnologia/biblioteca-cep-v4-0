import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { LeitoresService, LeitorWithStats, Leitor } from '@/services/leitores'
import {
  isRateLimitError,
  getFriendlyAuthErrorMessage,
  getRemainingCooldownSeconds,
} from '@/lib/auth-errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Users,
  Search,
  UserPlus,
  Pencil,
  Trash2,
  Lock,
  Unlock,
  Loader2,
  Repeat,
  AlertTriangle,
  Mail,
  Phone,
  ShieldCheck,
  UserCheck,
  History,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ReaderModal } from '@/components/ReaderModal'
import { ReaderLoanHistoryModal } from '@/components/ReaderLoanHistoryModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useToast } from '@/hooks/use-toast'
import { useHeaderCounters } from '@/hooks/use-header-counters'

export default function Leitores() {
  const { user, profile, isOperadorOrAdmin, isAdmin } = useAuth()
  const { toast } = useToast()
  const { refreshLeitoresPendentes } = useHeaderCounters()

  const [readers, setReaders] = useState<LeitorWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'ativos' | 'bloqueados' | 'pendentes'>(
    'all',
  )

  const [readerModalOpen, setReaderModalOpen] = useState(false)
  const [readerToEdit, setReaderToEdit] = useState<Leitor | null>(null)
  const [isSelfEdit, setIsSelfEdit] = useState(false)

  // Modais de Aprovação e Rejeição de auto-cadastro pendente
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false)
  const [readerToApprove, setReaderToApprove] = useState<LeitorWithStats | null>(null)
  const [approveLoading, setApproveLoading] = useState(false)

  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false)
  const [readerToReject, setReaderToReject] = useState<LeitorWithStats | null>(null)
  const [rejectLoading, setRejectLoading] = useState(false)

  const [resendLoadingId, setResendLoadingId] = useState<number | null>(null)
  const [nowTimestamp, setNowTimestamp] = useState<number>(Date.now())

  // Atualiza timestamp a cada segundo para refrescar contadores de cooldown
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTimestamp(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Histórico de empréstimos do leitor
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [readerForHistory, setReaderForHistory] = useState<LeitorWithStats | null>(null)

  // Confirm modals state
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false)
  const [readerToToggleBlock, setReaderToToggleBlock] = useState<LeitorWithStats | null>(null)
  const [blockLoading, setBlockLoading] = useState(false)

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [readerToDelete, setReaderToDelete] = useState<LeitorWithStats | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const getInitials = (name?: string) => {
    if (!name) return 'L'
    const parts = name.trim().split(' ')
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return name.substring(0, 2).toUpperCase()
  }

  const loadReaders = async () => {
    setLoading(true)
    try {
      const data = await LeitoresService.getAll(searchQuery, filterStatus)
      if (isOperadorOrAdmin) {
        setReaders(data)
      } else {
        // Se for leitor logado comum, filtrar estritamente para exibir apenas seu próprio registro
        const ownReaders = data.filter(
          (r) =>
            (user?.id && r.id_auth === user.id) ||
            (user?.email && r.email?.toLowerCase() === user.email.toLowerCase()) ||
            (profile?.id_leitor && r.id_leitor === profile.id_leitor),
        )
        setReaders(ownReaders)
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar leitores',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReaders()
  }, [filterStatus, isOperadorOrAdmin, user?.id, user?.email])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loadReaders()
  }

  const handleToggleBlock = (reader: LeitorWithStats) => {
    setReaderToToggleBlock(reader)
    setBlockConfirmOpen(true)
  }

  const executeToggleBlock = async () => {
    if (!readerToToggleBlock) return
    setBlockLoading(true)
    try {
      await LeitoresService.toggleBlock(
        readerToToggleBlock.id_leitor,
        readerToToggleBlock.bloqueado,
      )
      toast({
        title: readerToToggleBlock.bloqueado ? 'Leitor desbloqueado' : 'Leitor bloqueado',
        description: `O status do leitor ${readerToToggleBlock.nome_do_leitor} foi atualizado com sucesso.`,
      })
      setBlockConfirmOpen(false)
      setReaderToToggleBlock(null)
      loadReaders()
    } catch (err: any) {
      toast({
        title: 'Erro ao atualizar status',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setBlockLoading(false)
    }
  }

  const handleDelete = (reader: LeitorWithStats) => {
    setReaderToDelete(reader)
    setDeleteConfirmOpen(true)
  }

  const executeDelete = async () => {
    if (!readerToDelete) return
    setDeleteLoading(true)
    try {
      await LeitoresService.delete(readerToDelete.id_leitor)
      toast({
        title: 'Leitor removido',
        description: `O cadastro de ${readerToDelete.nome_do_leitor} foi excluído com sucesso.`,
      })
      setDeleteConfirmOpen(false)
      setReaderToDelete(null)
      loadReaders()
    } catch (err: any) {
      toast({
        title: 'Não foi possível excluir',
        description: err.message || 'Verifique se não há empréstimos ou reservas pendentes.',
        variant: 'destructive',
      })
    } finally {
      setDeleteLoading(false)
    }
  }

  const isReaderOwner = (reader: LeitorWithStats) => {
    if (!user) return false
    return (
      reader.id_auth === user.id ||
      reader.email?.toLowerCase() === user.email?.toLowerCase() ||
      reader.id_leitor === profile?.id_leitor
    )
  }

  const handleApprove = (reader: LeitorWithStats) => {
    setReaderToApprove(reader)
    setApproveConfirmOpen(true)
  }

  const executeApprove = async () => {
    if (!readerToApprove) return
    setApproveLoading(true)
    try {
      const res = await LeitoresService.approveReader(readerToApprove.id_leitor)
      if (!res.success) {
        throw new Error(res.error || 'Falha ao aprovar cadastro.')
      }

      if (res.emailSent) {
        toast({
          title: 'Cadastro aprovado com sucesso!',
          description: `O leitor ${readerToApprove.nome_do_leitor} foi ativado e o e-mail com o link de primeiro acesso foi enviado para ${readerToApprove.email}.`,
        })
      } else if (res.isRateLimit) {
        toast({
          title: 'Cadastro aprovado (limite de envio)',
          description: `O leitor foi ativado com sucesso! Porém, um e-mail já foi enviado recentemente para ${readerToApprove.email}. Aguarde alguns minutos antes de reenviar o link de acesso.`,
        })
      } else {
        toast({
          title: 'Cadastro aprovado',
          description: `O leitor ${readerToApprove.nome_do_leitor} foi ativado. O link de primeiro acesso pode ser reenviado pelo operador quando desejar.`,
        })
      }
      setApproveConfirmOpen(false)
      setReaderToApprove(null)
      await Promise.all([loadReaders(), refreshLeitoresPendentes()])
    } catch (err: any) {
      const friendlyMsg = getFriendlyAuthErrorMessage(err, 'Verifique as permissões de acesso.')
      toast({
        title: 'Erro ao aprovar cadastro',
        description: friendlyMsg,
        variant: 'destructive',
      })
    } finally {
      setApproveLoading(false)
    }
  }

  const handleReject = (reader: LeitorWithStats) => {
    setReaderToReject(reader)
    setRejectConfirmOpen(true)
  }

  const executeReject = async () => {
    if (!readerToReject) return
    setRejectLoading(true)
    try {
      const res = await LeitoresService.rejectReader(readerToReject.id_leitor)
      if (!res.success) {
        throw new Error(res.error || 'Falha ao recusar cadastro.')
      }

      toast({
        title: 'Cadastro recusado e excluído',
        description: `A solicitação de cadastro de ${readerToReject.nome_do_leitor} foi removida.`,
      })
      setRejectConfirmOpen(false)
      setReaderToReject(null)
      await Promise.all([loadReaders(), refreshLeitoresPendentes()])
    } catch (err: any) {
      toast({
        title: 'Erro ao recusar cadastro',
        description: err.message || 'Não foi possível excluir a solicitação.',
        variant: 'destructive',
      })
    } finally {
      setRejectLoading(false)
    }
  }

  const handleResendFirstAccessEmail = async (reader: LeitorWithStats) => {
    // 1. Verificação prévia no cliente: evitar requisições repetidas se dentro da janela de cooldown
    const cooldownRemaining = getRemainingCooldownSeconds(reader.ultimo_envio_email_em)
    if (cooldownRemaining > 0) {
      toast({
        title: 'Aguarde antes de reenviar',
        description: `Você já enviou um e-mail para este leitor recentemente. Aguarde ${cooldownRemaining} segundo(s) antes de reenviar.`,
      })
      return
    }

    setResendLoadingId(reader.id_leitor)
    try {
      const res = await LeitoresService.sendPasswordResetEmail(reader.email)
      if (res.success) {
        toast({
          title: 'E-mail enviado com sucesso!',
          description: `Link de definição de senha reenviado para ${reader.email}.`,
        })
        await loadReaders()
      } else if (res.isRateLimit) {
        toast({
          title: 'Aguarde antes de reenviar',
          description:
            res.error ||
            'Você já enviou um e-mail para este leitor recentemente. Aguarde alguns minutos antes de reenviar.',
        })
      } else {
        throw new Error(res.error || 'Falha ao reenviar e-mail.')
      }
    } catch (err: any) {
      const isRate = isRateLimitError(err)
      const friendlyMsg = getFriendlyAuthErrorMessage(
        err,
        'Não foi possível enviar o link de primeiro acesso.',
      )
      toast({
        title: isRate ? 'Aguarde antes de reenviar' : 'Erro ao reenviar e-mail',
        description: friendlyMsg,
        variant: isRate ? 'default' : 'destructive',
      })
    } finally {
      setResendLoadingId(null)
    }
  }

  const handleEditReader = (reader: LeitorWithStats) => {
    setReaderToEdit(reader)
    setIsSelfEdit(isReaderOwner(reader))
    setReaderModalOpen(true)
  }

  const handleOpenHistory = (reader: LeitorWithStats) => {
    setReaderForHistory(reader)
    setHistoryModalOpen(true)
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            {isOperadorOrAdmin ? 'Gestão de Leitores' : 'Meu Cadastro de Leitor'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {isOperadorOrAdmin
              ? 'Cadastre leitores, consulte histórico de empréstimos e gerencie permissões de retirada.'
              : 'Visualize seus dados cadastrais e atualize seu Nome, Telefones e Foto de perfil.'}
          </p>
        </div>

        {isOperadorOrAdmin && (
          <Button
            onClick={() => {
              setReaderToEdit(null)
              setIsSelfEdit(false)
              setReaderModalOpen(true)
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-2 shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Cadastrar Novo Leitor
          </Button>
        )}
      </div>

      {/* Filter and Search Bar (Visível apenas para operador/admin ou quando houver filtros) */}
      {isOperadorOrAdmin ? (
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2 flex-1">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar por nome, e-mail ou telefone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs sm:text-sm bg-white"
              />
            </div>
            <Button
              type="submit"
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4"
            >
              Buscar
            </Button>
          </form>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg self-start sm:self-auto">
            <Button
              size="sm"
              variant={filterStatus === 'all' ? 'default' : 'ghost'}
              className={`h-7 text-xs ${filterStatus === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              onClick={() => setFilterStatus('all')}
            >
              Todos
            </Button>
            <Button
              size="sm"
              variant={filterStatus === 'ativos' ? 'default' : 'ghost'}
              className={`h-7 text-xs ${filterStatus === 'ativos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              onClick={() => setFilterStatus('ativos')}
            >
              Ativos
            </Button>
            <Button
              size="sm"
              variant={filterStatus === 'pendentes' ? 'default' : 'ghost'}
              className={`h-7 text-xs ${filterStatus === 'pendentes' ? 'bg-amber-500 text-white shadow-sm hover:bg-amber-600' : 'text-amber-700 hover:bg-amber-50'}`}
              onClick={() => setFilterStatus('pendentes')}
            >
              Pendentes de Validação
            </Button>
            <Button
              size="sm"
              variant={filterStatus === 'bloqueados' ? 'default' : 'ghost'}
              className={`h-7 text-xs ${filterStatus === 'bloqueados' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              onClick={() => setFilterStatus('bloqueados')}
            >
              Bloqueados
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Você está visualizando suas informações de leitor. Mantenha seus dados de contato
              atualizados para avisos de empréstimos.
            </span>
          </div>
        </div>
      )}

      {/* Readers List */}
      {loading ? (
        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="text-xs text-slate-500 font-medium">Carregando dados do leitor...</p>
        </div>
      ) : readers.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 p-12 text-center bg-slate-50/50">
          <div className="max-w-md mx-auto space-y-3">
            <Users className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-semibold text-slate-800">
              {isOperadorOrAdmin
                ? 'Nenhum leitor encontrado'
                : 'Nenhum cadastro de leitor vinculado'}
            </h3>
            <p className="text-xs text-slate-500">
              {isOperadorOrAdmin
                ? 'Não encontramos nenhum leitor para o termo buscado.'
                : 'Não foi localizado um registro de leitor vinculado à sua conta.'}
            </p>
          </div>
        </Card>
      ) : (
        <div
          className={
            isOperadorOrAdmin
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
              : 'max-w-xl mx-auto w-full'
          }
        >
          {readers.map((reader) => {
            const isOwner = isReaderOwner(reader)
            const canEdit = isOperadorOrAdmin || isOwner

            return (
              <Card
                key={reader.id_leitor}
                className={`border transition-all flex flex-col justify-between bg-white ${
                  reader.bloqueado
                    ? 'border-rose-200 bg-rose-50/10'
                    : 'border-slate-200 hover:border-emerald-300 shadow-sm'
                }`}
              >
                <div className="p-4 space-y-3">
                  {/* Header with Photo */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-12 h-12 border-2 border-emerald-500/30 shadow-xs shrink-0">
                        {reader.foto && (
                          <AvatarImage
                            src={reader.foto}
                            alt={reader.nome_do_leitor || ''}
                            className="object-cover"
                          />
                        )}
                        <AvatarFallback className="bg-emerald-100 text-emerald-800 text-sm font-bold">
                          {getInitials(reader.nome_do_leitor || '')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-slate-400">
                            ID #{reader.id_leitor}
                          </span>
                          {isOwner && (
                            <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                              Seu Cadastro
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-slate-900 text-base leading-tight line-clamp-1">
                          {reader.nome_do_leitor}
                        </h3>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {reader.status_cadastro === 'pendente' ? (
                        <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-900 gap-1 shrink-0 select-none shadow-2xs animate-pulse">
                          <Clock className="w-3 h-3 text-amber-700" />
                          Pendente de Validação
                        </span>
                      ) : reader.bloqueado ? (
                        <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2.5 py-0.5 text-[10px] font-medium text-rose-800 gap-1 shrink-0 select-none">
                          <Lock className="w-3 h-3 text-rose-600" />
                          Bloqueado
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-medium text-emerald-700 shrink-0 select-none">
                          Ativo
                        </span>
                      )}
                      {reader.acesso_diretoria && (
                        <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-900 gap-0.5 shrink-0 select-none shadow-2xs">
                          Diretoria: Sim
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Cursos Frequentados na CEP */}
                  {reader.cursos_nomes && reader.cursos_nomes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      {reader.cursos_nomes.map((nomeCurso, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium"
                        >
                          {nomeCurso}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Contact Info */}
                  <div className="space-y-1.5 text-xs text-slate-600 pt-1">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate font-mono">{reader.email}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {reader.telefone ? (
                            <span>{reader.telefone}</span>
                          ) : (
                            <span className="text-slate-400 italic">Sem celular</span>
                          )}
                        </span>
                      </div>
                      {reader.telefone_fixo && (
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>Fixo: {reader.telefone_fixo}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Loans Stats */}
                  <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-100 text-slate-500">
                    <span className="flex items-center gap-1">
                      <Repeat className="w-3.5 h-3.5 text-emerald-600" />
                      {reader.emprestimos_ativos} empréstimo(s) ativo(s)
                    </span>

                    {reader.emprestimos_atrasados > 0 && (
                      <span className="text-rose-600 font-semibold flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" />
                        {reader.emprestimos_atrasados} atrasado(s)
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-1">
                  {reader.status_cadastro === 'pendente' && isOperadorOrAdmin ? (
                    /* Ações para leitor pendente de validação */
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1 px-2.5 shadow-xs"
                          onClick={() => handleApprove(reader)}
                          title="Aprovar cadastro e enviar e-mail com link de primeiro acesso"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Aprovar</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 gap-1 px-2"
                          onClick={() => handleReject(reader)}
                          title="Recusar e excluir solicitação de cadastro"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Recusar</span>
                        </Button>
                      </div>

                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-slate-500 hover:text-slate-900"
                              onClick={() => handleEditReader(reader)}
                              aria-label="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            Editar
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  ) : (
                    /* Ações normais para leitor ativo/aprovado */
                    <>
                      {/* Left action: Bloquear/Desbloquear para staff */}
                      {isOperadorOrAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className={`h-7 text-xs px-2 gap-1 ${
                            reader.bloqueado
                              ? 'text-emerald-700 hover:bg-emerald-50'
                              : 'text-amber-700 hover:bg-amber-50'
                          }`}
                          onClick={() => handleToggleBlock(reader)}
                        >
                          {reader.bloqueado ? (
                            <>
                              <Unlock className="w-3 h-3" />
                              Desbloquear
                            </>
                          ) : (
                            <>
                              <Lock className="w-3 h-3" />
                              Bloquear
                            </>
                          )}
                        </Button>
                      )}

                      <div className="flex items-center gap-1.5 ml-auto">
                        {/* Botão de reenviar e-mail de acesso para o leitor (se for staff) */}
                        {isOperadorOrAdmin &&
                          (() => {
                            const cooldown = getRemainingCooldownSeconds(
                              reader.ultimo_envio_email_em,
                            )
                            const isCooldownActive = cooldown > 0
                            const isCurrentLoading = resendLoadingId === reader.id_leitor

                            return (
                              <Button
                                size="sm"
                                variant="ghost"
                                className={`h-7 text-xs px-2 gap-1 transition-colors ${
                                  isCooldownActive
                                    ? 'text-slate-400 bg-slate-100/60 cursor-not-allowed'
                                    : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                                }`}
                                onClick={() => handleResendFirstAccessEmail(reader)}
                                disabled={isCurrentLoading || isCooldownActive}
                                title={
                                  isCooldownActive
                                    ? `E-mail enviado recentemente. Aguarde ${cooldown}s antes de reenviar.`
                                    : 'Reenviar e-mail de primeiro acesso / redefinição de senha'
                                }
                              >
                                {isCurrentLoading ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                                ) : isCooldownActive ? (
                                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                                ) : (
                                  <Send className="w-3.5 h-3.5 text-emerald-600" />
                                )}
                                <span className="hidden sm:inline">
                                  {isCooldownActive ? `Reenviar (${cooldown}s)` : 'Reenviar Link'}
                                </span>
                              </Button>
                            )
                          })()}

                        {/* Botão Histórico de Empréstimos */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2.5 bg-white border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 gap-1.5 shadow-2xs"
                          onClick={() => handleOpenHistory(reader)}
                          title="Ver histórico de empréstimos do leitor"
                        >
                          <History className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Histórico</span>
                          {reader.total_emprestimos > 0 && (
                            <span className="text-[10px] px-1 py-0 rounded bg-slate-100 text-slate-600 font-semibold group-hover:bg-emerald-100 group-hover:text-emerald-800">
                              {reader.total_emprestimos}
                            </span>
                          )}
                        </Button>

                        {/* Botão Editar: só ícone com tooltip e acessibilidade adequada */}
                        {canEdit && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-slate-500 hover:text-slate-900"
                                onClick={() => handleEditReader(reader)}
                                aria-label="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Editar
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {canEdit && isAdmin && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                            onClick={() => handleDelete(reader)}
                            title="Excluir leitor"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modals */}
      <ReaderLoanHistoryModal
        open={historyModalOpen}
        onOpenChange={setHistoryModalOpen}
        reader={readerForHistory}
      />

      <ReaderModal
        open={readerModalOpen}
        onOpenChange={setReaderModalOpen}
        readerToEdit={readerToEdit}
        isSelfEdit={isSelfEdit}
        onSuccess={loadReaders}
        onViewHistory={() => {
          if (readerToEdit) {
            setReaderForHistory(readerToEdit as any)
            setHistoryModalOpen(true)
          }
        }}
      />

      <ConfirmModal
        open={blockConfirmOpen}
        onOpenChange={setBlockConfirmOpen}
        title={readerToToggleBlock?.bloqueado ? 'Desbloquear Leitor' : 'Bloquear Leitor'}
        description={
          readerToToggleBlock?.bloqueado
            ? `Deseja liberar o cadastro de ${readerToToggleBlock?.nome_do_leitor} para realizar novos empréstimos?`
            : `Deseja bloquear o leitor ${readerToToggleBlock?.nome_do_leitor}? Ele não poderá retirar novos exemplares até ser desbloqueado.`
        }
        confirmLabel={readerToToggleBlock?.bloqueado ? 'Sim, Desbloquear' : 'Sim, Bloquear'}
        variant={readerToToggleBlock?.bloqueado ? 'primary' : 'warning'}
        loading={blockLoading}
        onConfirm={executeToggleBlock}
      />

      <ConfirmModal
        open={approveConfirmOpen}
        onOpenChange={setApproveConfirmOpen}
        title="Aprovar Cadastro de Leitor"
        description={
          readerToApprove ? (
            <div className="space-y-2">
              <p>
                Deseja aprovar o cadastro de <strong>{readerToApprove.nome_do_leitor}</strong> (
                {readerToApprove.email})?
              </p>
              <div className="bg-emerald-50 border border-emerald-200 rounded p-2.5 text-xs text-emerald-900">
                Ao confirmar, a conta do leitor será ativada e um e-mail com o link de primeiro
                acesso será disparado automaticamente para que ele defina sua senha.
              </div>
            </div>
          ) : (
            'Deseja aprovar o cadastro deste leitor?'
          )
        }
        confirmLabel="Sim, Aprovar e Enviar E-mail"
        variant="primary"
        loading={approveLoading}
        onConfirm={executeApprove}
      />

      <ConfirmModal
        open={rejectConfirmOpen}
        onOpenChange={setRejectConfirmOpen}
        title="Recusar Solicitação de Cadastro"
        description={
          readerToReject ? (
            <div className="space-y-1.5">
              <p>Deseja recusar a solicitação de cadastro do leitor:</p>
              <p className="text-rose-600 font-semibold break-words">
                "{readerToReject.nome_do_leitor}" ({readerToReject.email})
              </p>
              <p className="text-slate-500">O registro pendente será removido da base de dados.</p>
            </div>
          ) : (
            'Deseja recusar o cadastro deste leitor?'
          )
        }
        confirmLabel="Sim, Recusar e Excluir"
        variant="destructive"
        loading={rejectLoading}
        onConfirm={executeReject}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Excluir Cadastro do Leitor"
        description={
          readerToDelete ? (
            <div className="space-y-1.5">
              <p>Deseja realmente excluir o cadastro do leitor:</p>
              <p className="text-rose-600 font-semibold break-words">
                "{readerToDelete.nome_do_leitor}" (ID #{readerToDelete.id_leitor})
              </p>
              <p className="text-slate-500">Esta ação não pode ser desfeita.</p>
            </div>
          ) : (
            'Tem certeza que deseja excluir o leitor? Esta ação não pode ser desfeita.'
          )
        }
        confirmLabel="Sim, Excluir Cadastro"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={executeDelete}
      />
    </div>
  )
}
