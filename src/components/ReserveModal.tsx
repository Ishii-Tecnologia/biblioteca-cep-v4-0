import React, { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { ReservasService } from '@/services/reservas'
import { TitulosService, TituloWithStats } from '@/services/titulos'
import { LeitoresService, Leitor } from '@/services/leitores'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { formatDateBR } from '@/lib/utils'
import {
  BookmarkCheck,
  Loader2,
  Book,
  User,
  Lock,
  ArrowLeft,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  Calendar,
  Sparkles,
  Users,
} from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface ReserveModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preSelectedTituloId?: string
  onSuccess: () => void
}

export function ReserveModal({
  open,
  onOpenChange,
  preSelectedTituloId,
  onSuccess,
}: ReserveModalProps) {
  const { profile, isOperadorOrAdmin, user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [checkingAvailability, setCheckingAvailability] = useState(false)

  const [titulos, setTitulos] = useState<TituloWithStats[]>([])
  const [leitores, setLeitores] = useState<Leitor[]>([])

  const [selectedTitulo, setSelectedTitulo] = useState<string>('')
  const [selectedLeitor, setSelectedLeitor] = useState<string>('')
  const [dataLimiteDesejada, setDataLimiteDesejada] = useState<string>('')

  // Regras 2.1 / 2.2 e 3.1 / 3.2
  const [availabilityInfo, setAvailabilityInfo] = useState<{
    disponivelParaEmprestimoDireto: boolean
    todosEmprestados: boolean
    filaCheia: boolean
    totalNaFila: number
    limiteFila: number
    dataPrevistaDevolucaoProxima: string | null
    dataSugeridaReserva: string | null
    sugerirNovaData: boolean
  } | null>(null)

  // Password verification step for regular readers
  const [step, setStep] = useState<'form' | 'password'>('form')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)

  const resetModalState = () => {
    setStep('form')
    setPassword('')
    setShowPassword(false)
    setPasswordError(null)
    setDataLimiteDesejada('')
    setAvailabilityInfo(null)
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetModalState()
    }
    onOpenChange(newOpen)
  }

  useEffect(() => {
    if (open) {
      resetModalState()
      loadData()
    }
  }, [open])

  useEffect(() => {
    if (preSelectedTituloId) {
      setSelectedTitulo(preSelectedTituloId)
    }
    if (profile?.id_leitor) {
      setSelectedLeitor(String(profile.id_leitor))
    }
  }, [preSelectedTituloId, profile, open])

  // Checar disponibilidade do livro e data limite quando mudarem
  useEffect(() => {
    if (!selectedTitulo) {
      setAvailabilityInfo(null)
      return
    }

    let isCancelled = false
    setCheckingAvailability(true)
    ReservasService.checkReservationAvailability(selectedTitulo, dataLimiteDesejada)
      .then((info) => {
        if (!isCancelled) {
          setAvailabilityInfo(info)
        }
      })
      .catch((err) => {
        console.warn('Erro ao checar disponibilidade para reserva:', err)
      })
      .finally(() => {
        if (!isCancelled) setCheckingAvailability(false)
      })

    return () => {
      isCancelled = true
    }
  }, [selectedTitulo, dataLimiteDesejada])

  useEffect(() => {
    if (step === 'password') {
      setTimeout(() => {
        passwordInputRef.current?.focus()
      }, 100)
    }
  }, [step])

  const loadData = async () => {
    setLoadingData(true)
    try {
      // DECISÃO C CONFIRMADA: Executar verificação de vencimento ao ABRIR o modal de reservas
      try {
        await ReservasService.checkAndExpirePickupDeadlines(profile?.full_name || 'Operador')
      } catch (expErr) {
        console.warn('Erro ao verificar prazos expirados ao abrir modal de reserva:', expErr)
      }

      const [booksData, readersData] = await Promise.all([
        TitulosService.getAll('', 'all', true),
        LeitoresService.getAll('', 'ativos'),
      ])
      setTitulos(booksData)
      setLeitores(readersData)

      // Set initial selected reader
      if (profile?.id_leitor) {
        setSelectedLeitor(String(profile.id_leitor))
      } else if (readersData.length > 0 && !selectedLeitor) {
        setSelectedLeitor(String(readersData[0].id_leitor))
      }
    } catch (err: any) {
      toast({ title: 'Erro ao carregar dados', description: err.message, variant: 'destructive' })
    } finally {
      setLoadingData(false)
    }
  }

  const handleAcceptSuggestion = (suggestedDate: string) => {
    setDataLimiteDesejada(suggestedDate)
    toast({
      title: 'Sugestão de data aplicada',
      description: `Data de retirada desejada ajustada para ${formatDateBR(suggestedDate)}.`,
    })
  }

  const executeReservation = async (dateLimitToUse?: string) => {
    setLoading(true)
    try {
      const operatorName = profile?.full_name || 'Leitor'
      const finalDateLimit =
        dateLimitToUse !== undefined ? dateLimitToUse : dataLimiteDesejada || null
      await ReservasService.create(
        selectedTitulo,
        Number(selectedLeitor),
        operatorName,
        finalDateLimit,
      )
      toast({
        title: 'Reserva confirmada!',
        description: 'Assim que um exemplar for devolvido, a fila de reservas será atendida.',
      })
      onSuccess()
      handleOpenChange(false)
    } catch (err: any) {
      toast({
        title: 'Não foi possível reservar',
        description: err.message || 'Erro ao processar reserva.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTitulo || !selectedLeitor) {
      toast({
        title: 'Campos incompletos',
        description: 'Selecione a obra e o leitor interessado.',
        variant: 'destructive',
      })
      return
    }

    if (isDiretoriaBlocked) {
      toast({
        title: 'Acesso Negado',
        description: 'O leitor selecionado não possui permissão para retirar livros da Diretoria.',
        variant: 'destructive',
      })
      return
    }

    // If operator or admin, create directly without password
    if (isOperadorOrAdmin) {
      await executeReservation()
      return
    }

    // For regular readers: move to password verification step
    setStep('password')
    setPassword('')
    setPasswordError(null)
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)

    if (!password) {
      setPasswordError('Informe sua senha para confirmar a reserva.')
      return
    }

    setLoading(true)
    try {
      let isAuthValid = false
      let authErrorMessage = 'Senha incorreta. Verifique e tente novamente.'

      try {
        const reauthRes = await (supabase.auth as any).reauthenticate()
        if (reauthRes && !reauthRes.error) {
          // If server supports password-less reauth flow
        }
      } catch (reauthErr) {
        console.warn('reauthenticate attempt:', reauthErr)
      }

      // Validate the specific password entered by the user
      if (user?.email) {
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: password,
        })

        if (verifyError) {
          isAuthValid = false
          authErrorMessage = 'Senha incorreta. Verifique e tente novamente.'
        } else {
          isAuthValid = true
        }
      } else {
        throw new Error('Usuário logado não encontrado.')
      }

      if (!isAuthValid) {
        setPasswordError(authErrorMessage)
        toast({
          title: 'Senha incorreta',
          description: authErrorMessage,
          variant: 'destructive',
        })
        setLoading(false)
        return
      }

      // Password is valid -> proceed to create reservation
      const operatorName = profile?.full_name || 'Leitor'
      await ReservasService.create(
        selectedTitulo,
        Number(selectedLeitor),
        operatorName,
        dataLimiteDesejada || null,
      )
      toast({
        title: 'Reserva confirmada!',
        description:
          'Identidade confirmada com sucesso! Assim que um exemplar for devolvido, a fila de reservas será atendida.',
      })
      onSuccess()
      handleOpenChange(false)
    } catch (err: any) {
      setPasswordError(err.message || 'Erro ao validar senha.')
      toast({
        title: 'Não foi possível confirmar reserva',
        description: err.message || 'Erro ao validar senha ou criar reserva.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // Find book and reader for summary displays
  const selectedTituloObj = titulos.find((t) => t.id_titulo === selectedTitulo)
  const currentReaderObj = leitores.find((r) => String(r.id_leitor) === selectedLeitor)

  // Validação de acesso à Diretoria
  const isTituloDiretoria = selectedTituloObj?.colecao === 'diretoria'
  const readerHasDiretoriaAccess = Boolean(currentReaderObj?.acesso_diretoria)
  const isDiretoriaBlocked = isTituloDiretoria && !readerHasDiretoriaAccess

  // Regra 3.1 & 3.2: Fila cheia
  const isFilaCheia = Boolean(availabilityInfo?.filaCheia)

  // Reader list for the dropdown:
  // For admin/operator: all readers
  // For regular reader: only their own reader profile (or fallback to profile.id_leitor)
  const availableReadersForSelect = isOperadorOrAdmin
    ? leitores
    : leitores.filter((r) => r.id_leitor === profile?.id_leitor || r.email === profile?.email)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        {step === 'form' ? (
          <form onSubmit={handleInitialSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900">
                <BookmarkCheck className="w-5 h-5 text-emerald-600" />
                Reservas e Fila de Espera
              </DialogTitle>
              <DialogDescription>
                Reserve um exemplar quando todas as cópias físicas estiverem emprestadas.
              </DialogDescription>
            </DialogHeader>

            {loadingData ? (
              <div className="py-8 text-center text-slate-400 flex flex-col items-center justify-center gap-1">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                <span className="text-xs">Carregando dados...</span>
              </div>
            ) : (
              <div className="grid gap-4 py-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <Book className="w-3.5 h-3.5 text-emerald-600" />
                    Obra Desejada *
                  </Label>
                  <Select value={selectedTitulo} onValueChange={setSelectedTitulo}>
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue placeholder="Selecione o livro..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {titulos.map((b) => (
                        <SelectItem key={b.id_titulo} value={b.id_titulo} className="text-xs">
                          <span className="font-semibold text-slate-800">{b.titulo_de_livro}</span>
                          <span className="text-slate-500 ml-1">({b.autor})</span>
                          <span className="text-[10px] ml-2 text-emerald-700 font-mono">
                            [{b.id_titulo}]
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <User className="w-3.5 h-3.5 text-emerald-600" />
                    Leitor Solicitante *
                  </Label>
                  <Select
                    value={selectedLeitor}
                    onValueChange={setSelectedLeitor}
                    disabled={!isOperadorOrAdmin && availableReadersForSelect.length <= 1}
                  >
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue placeholder="Selecione o leitor..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {isOperadorOrAdmin ? (
                        leitores.map((r) => (
                          <SelectItem
                            key={r.id_leitor}
                            value={String(r.id_leitor)}
                            className="text-xs"
                          >
                            <span className="font-semibold text-slate-800">{r.nome_do_leitor}</span>
                            <span className="text-slate-500 ml-2">({r.email})</span>
                          </SelectItem>
                        ))
                      ) : availableReadersForSelect.length > 0 ? (
                        availableReadersForSelect.map((r) => (
                          <SelectItem
                            key={r.id_leitor}
                            value={String(r.id_leitor)}
                            className="text-xs"
                          >
                            <span className="font-semibold text-slate-800">{r.nome_do_leitor}</span>
                            <span className="text-slate-500 ml-2">({r.email})</span>
                          </SelectItem>
                        ))
                      ) : profile?.id_leitor ? (
                        <SelectItem value={String(profile.id_leitor)} className="text-xs">
                          <span className="font-semibold text-slate-800">
                            {profile.full_name || 'Leitor'}
                          </span>
                          <span className="text-slate-500 ml-2">({profile.email})</span>
                        </SelectItem>
                      ) : (
                        <SelectItem value="0" disabled className="text-xs">
                          Cadastro de leitor não localizado
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {!isOperadorOrAdmin && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      A reserva será vinculada ao seu cadastro de leitor ({profile?.email}).
                    </p>
                  )}
                </div>

                {/* Campo Data Desejada de Retirada */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="data_limite_desejada"
                      className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                    >
                      <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                      Data Desejada de Retirada
                    </Label>
                    <span className="text-[11px] text-slate-400">Opcional</span>
                  </div>
                  <Input
                    id="data_limite_desejada"
                    type="date"
                    value={dataLimiteDesejada}
                    onChange={(e) => setDataLimiteDesejada(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="text-xs"
                  />
                  <p className="text-[11px] text-slate-500">
                    Informe a data em que pretende retirar este livro na Biblioteca, caso esteja
                    disponível.
                  </p>
                </div>

                {/* Alerta de Fila Cheia (Regras 3.1 & 3.2: 'Fila de espera está completa!') */}
                {isFilaCheia && (
                  <Alert
                    variant="destructive"
                    className="py-2.5 bg-rose-50 border-rose-300 text-rose-900"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <AlertDescription className="text-xs font-bold">
                      Fila de espera está completa!
                    </AlertDescription>
                    <p className="text-[11px] text-rose-700 mt-0.5">
                      O limite máximo de {availabilityInfo?.limiteFila ?? 3} leitores na fila de
                      espera desta obra foi atingido. Aguarde a conclusão dos atendimentos
                      anteriores.
                    </p>
                  </Alert>
                )}

                {/* Regras 2.1 & 2.2: Todos os exemplares emprestados até a data limite desejada + sugestão */}
                {availabilityInfo &&
                  availabilityInfo.todosEmprestados &&
                  availabilityInfo.sugerirNovaData &&
                  availabilityInfo.dataSugeridaReserva &&
                  !isFilaCheia && (
                    <div className="bg-amber-50/90 border border-amber-300 rounded-lg p-3 text-xs text-amber-950 space-y-2">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span className="text-amber-900">
                          todos os exemplares estão emprestados
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        {dataLimiteDesejada
                          ? `Até a data desejada (${formatDateBR(dataLimiteDesejada)}), não há previsão de devolução. A devolução mais próxima está prevista para `
                          : `Todos os exemplares estão emprestados. A devolução mais próxima está prevista para `}
                        <strong>
                          {formatDateBR(availabilityInfo.dataPrevistaDevolucaoProxima)}
                        </strong>
                        . Sugerimos reservar para o{' '}
                        <strong>
                          dia seguinte à data de entrega prevista (
                          {formatDateBR(availabilityInfo.dataSugeridaReserva)})
                        </strong>
                        :
                      </p>
                      <div className="flex items-center justify-between bg-white p-2.5 rounded border border-amber-200">
                        <div>
                          <span className="text-[11px] text-slate-500 block">
                            Data de reserva sugerida:
                          </span>
                          <span className="font-bold text-emerald-800 text-xs">
                            {formatDateBR(availabilityInfo.dataSugeridaReserva)}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            handleAcceptSuggestion(availabilityInfo.dataSugeridaReserva!)
                          }
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1 shadow-2xs"
                        >
                          <Sparkles className="w-3 h-3" />
                          Aceitar Sugestão
                        </Button>
                      </div>
                    </div>
                  )}

                {/* Info geral da fila de espera quando houver leitores */}
                {availabilityInfo && !isFilaCheia && (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        Status da Fila de Espera
                      </span>
                      <span className="font-mono text-[11px] text-slate-600">
                        {availabilityInfo.totalNaFila} / {availabilityInfo.limiteFila} leitores
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      As reservas seguem ordem cronológica de solicitação. Quando um exemplar for
                      devolvido, a biblioteca notificará o leitor para comparecer e realizar a
                      retirada.
                    </p>
                  </div>
                )}

                {/* Bloqueio visual para livros da Diretoria sem permissão */}
                {isDiretoriaBlocked && (
                  <Alert
                    variant="destructive"
                    className="py-2 bg-rose-50 border-rose-300 text-rose-900"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <AlertDescription className="text-xs font-semibold">
                      O leitor selecionado não possui permissão para reservar livros da Coleção da
                      Diretoria.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={
                  loading ||
                  loadingData ||
                  checkingAvailability ||
                  !selectedTitulo ||
                  !selectedLeitor ||
                  isDiretoriaBlocked ||
                  isFilaCheia
                }
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Confirmar Reserva
              </Button>
            </DialogFooter>
          </form>
        ) : (
          /* Step 2: Password confirmation for reader */
          <form onSubmit={handlePasswordSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <Lock className="w-4 h-4" />
                </div>
                <span>Confirmação de Identidade</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 pt-1">
                Para sua segurança, informe sua senha de acesso para autenticar e concluir a
                reserva.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Summary of reservation */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-500 font-medium">Obra:</span>
                  <span className="font-bold text-slate-800 text-right">
                    {selectedTituloObj?.titulo_de_livro || selectedTitulo}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 font-medium">Leitor:</span>
                  <span className="font-semibold text-slate-800">
                    {currentReaderObj?.nome_do_leitor || profile?.full_name} ({profile?.email})
                  </span>
                </div>
              </div>

              {passwordError && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-700 flex items-start gap-2">
                  <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{passwordError}</span>
                </div>
              )}

              {/* Password Input */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="reader-reserve-password"
                  className="text-xs font-semibold text-slate-700"
                >
                  Senha do Leitor *
                </Label>
                <div className="relative">
                  <Input
                    ref={passwordInputRef}
                    id="reader-reserve-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Digite sua senha de acesso"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (passwordError) setPasswordError(null)
                    }}
                    required
                    disabled={loading}
                    className="pr-10 text-sm"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Validação direta de credenciais via autenticação segura.</span>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep('form')
                  setPassword('')
                  setPasswordError(null)
                }}
                disabled={loading}
                className="gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={loading || !password}
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Confirmar e Reservar
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
