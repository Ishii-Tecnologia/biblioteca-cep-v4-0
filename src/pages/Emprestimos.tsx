import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useHeaderCounters } from '@/hooks/use-header-counters'
import { EmprestimosService, EmprestimoDetailed } from '@/services/emprestimos'
import { getPrazoRenovacaoDias } from '@/services/parametros'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Repeat,
  Search,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  CornerDownLeft,
  Loader2,
  Calendar,
  User,
  Book,
} from 'lucide-react'
import { LoanModal } from '@/components/LoanModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'

export default function Emprestimos() {
  const { isOperadorOrAdmin, profile } = useAuth()
  const { toast } = useToast()
  const { refreshCounters } = useHeaderCounters()

  const [loans, setLoans] = useState<EmprestimoDetailed[]>([])
  const [loading, setLoading] = useState(true)
  const [statusTab, setStatusTab] = useState<'todos' | 'ativos' | 'atrasados' | 'devolvidos'>(
    'ativos',
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [prazoRenovacaoDias, setPrazoRenovacaoDias] = useState<number>(15)

  const [loanModalOpen, setLoanModalOpen] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null)

  // Confirm modals state
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false)
  const [loanToReturn, setLoanToReturn] = useState<EmprestimoDetailed | null>(null)

  const [renewConfirmOpen, setRenewConfirmOpen] = useState(false)
  const [loanToRenew, setLoanToRenew] = useState<EmprestimoDetailed | null>(null)

  const loadLoans = async () => {
    setLoading(true)
    try {
      const [data, prazoRenovacao] = await Promise.all([
        EmprestimosService.getAll(statusTab, searchQuery),
        getPrazoRenovacaoDias(),
      ])
      setLoans(data)
      setPrazoRenovacaoDias(prazoRenovacao)
      refreshCounters()
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar empréstimos',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLoans()
  }, [statusTab])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loadLoans()
  }

  const handleReturn = (loan: EmprestimoDetailed) => {
    setLoanToReturn(loan)
    setReturnConfirmOpen(true)
  }

  const executeReturn = async () => {
    if (!loanToReturn) return
    setActionLoadingId(loanToReturn.id_emprestimo)
    try {
      const operatorName = profile?.full_name || 'Operador'
      await EmprestimosService.returnLoan(loanToReturn.id_exemplar, operatorName)
      toast({
        title: 'Devolução registrada',
        description: `Exemplar ${loanToReturn.id_exemplar} devolvido com sucesso!`,
      })
      setReturnConfirmOpen(false)
      setLoanToReturn(null)
      await loadLoans()
      refreshCounters()
    } catch (err: any) {
      toast({
        title: 'Erro ao registrar devolução',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleRenew = (loan: EmprestimoDetailed) => {
    if (loan.numero_renovacoes >= 1) {
      toast({
        title: 'Limite atingido',
        description: 'Este empréstimo já atingiu o limite de 1 renovação permitida.',
        variant: 'destructive',
      })
      return
    }
    setLoanToRenew(loan)
    setRenewConfirmOpen(true)
  }

  const executeRenew = async () => {
    if (!loanToRenew) return
    setActionLoadingId(loanToRenew.id_emprestimo)
    try {
      const operatorName = profile?.full_name || 'Operador'
      const res = await EmprestimosService.renewLoan(loanToRenew.id_emprestimo, operatorName)
      toast({
        title: 'Empréstimo renovado',
        description: `Prazo estendido com sucesso! Nova data: ${formatDate(res.nova_data_prevista)}`,
      })
      setRenewConfirmOpen(false)
      setLoanToRenew(null)
      await loadLoans()
      refreshCounters()
    } catch (err: any) {
      toast({
        title: 'Não foi possível renovar',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Repeat className="w-6 h-6 text-emerald-600" />
            Controle de Empréstimos & Devoluções
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Acompanhamento de prazos, histórico de renovações (+{prazoRenovacaoDias}d) e registro de
            devoluções.
          </p>
        </div>

        {isOperadorOrAdmin && (
          <Button
            onClick={() => setLoanModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-2 shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            Novo Empréstimo
          </Button>
        )}
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <Tabs
          value={statusTab}
          onValueChange={(val) => setStatusTab(val as any)}
          className="w-full md:w-auto"
        >
          <TabsList className="grid grid-cols-4 w-full md:w-auto bg-slate-100 p-1">
            <TabsTrigger value="ativos" className="text-xs font-semibold">
              Emprestados
            </TabsTrigger>
            <TabsTrigger
              value="atrasados"
              className="text-xs font-semibold text-rose-700 data-[state=active]:text-rose-700"
            >
              Atrasados
            </TabsTrigger>
            <TabsTrigger value="devolvidos" className="text-xs font-semibold">
              Devolvidos
            </TabsTrigger>
            <TabsTrigger value="todos" className="text-xs font-semibold">
              Todos
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full md:w-80">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar por leitor, exemplar ou título..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 text-xs h-9 bg-white"
            />
          </div>
          <Button type="submit" size="sm" variant="outline" className="h-9 text-xs px-3">
            Buscar
          </Button>
        </form>
      </div>

      {/* Loans List */}
      {loading ? (
        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="text-xs text-slate-500 font-medium">
            Carregando registros de empréstimos...
          </p>
        </div>
      ) : loans.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 p-12 text-center bg-slate-50/50">
          <div className="max-w-md mx-auto space-y-3">
            <Repeat className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-semibold text-slate-800">Nenhum empréstimo encontrado</h3>
            <p className="text-xs text-slate-500">
              Não há registros para os filtros selecionados. Realize um novo empréstimo no botão
              acima.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {loans.map((loan) => {
            const isReturned = !!loan.data_devolucao_real
            const isOverdue = !isReturned && loan.atraso
            const isLoadingThis = actionLoadingId === loan.id_emprestimo

            return (
              <Card
                key={loan.id_emprestimo}
                className={`overflow-hidden border transition-all ${
                  isOverdue
                    ? 'border-rose-300 bg-rose-50/20'
                    : isReturned
                      ? 'border-slate-200 bg-white opacity-80'
                      : 'border-slate-200 bg-white hover:border-emerald-300 shadow-sm'
                }`}
              >
                <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Book & Reader Details */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-800 rounded border">
                        {loan.id_exemplar}
                      </span>
                      {isReturned ? (
                        <Badge className="bg-slate-100 text-slate-700 border-slate-300 gap-1 text-[11px] shadow-none select-none">
                          <CheckCircle2 className="w-3 h-3 text-slate-500" />
                          Devolvido em {formatDate(loan.data_devolucao_real)}
                        </Badge>
                      ) : isOverdue ? (
                        <Badge className="bg-rose-100 text-rose-800 border-rose-300 gap-1 text-[11px] shadow-none select-none">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          Atrasado ({loan.dias_atraso} dia(s))
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1 text-[11px] shadow-none select-none">
                          <Clock className="w-3 h-3 text-emerald-600" />
                          Emprestado
                        </Badge>
                      )}

                      {loan.numero_renovacoes > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-teal-800 bg-teal-50 border-teal-200 shadow-none select-none"
                        >
                          {loan.numero_renovacoes}x Renovado
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div className="flex items-start gap-2">
                        <Book className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-slate-900 leading-snug">
                            {loan.exemplar?.titulo?.titulo_de_livro || 'Livro não identificado'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {loan.exemplar?.titulo?.autor} • Cópia #{loan.exemplar?.seq}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <User className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-slate-900 leading-snug">
                            {loan.leitor?.nome_do_leitor || 'Leitor'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {loan.leitor?.email}{' '}
                            {loan.leitor?.telefone ? `• ${loan.leitor?.telefone}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Dates timeline */}
                  <div className="flex items-center gap-4 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100 shrink-0">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Empréstimo
                      </span>
                      <p className="font-semibold text-slate-700">
                        {formatDate(loan.data_emprestimo)}
                      </p>
                    </div>

                    <div className="text-slate-300">→</div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Prazo Previsto
                      </span>
                      <p className={`font-bold ${isOverdue ? 'text-rose-600' : 'text-slate-800'}`}>
                        {formatDate(loan.data_prevista_devolucao)}
                      </p>
                    </div>
                  </div>

                  {/* Right Actions */}
                  {!isReturned && isOperadorOrAdmin && (
                    <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          isLoadingThis ||
                          !!loan.data_devolucao_real ||
                          loan.numero_renovacoes >= 1 ||
                          (loan.dias_atraso ?? 0) > 0 ||
                          !!loan.atraso
                        }
                        onClick={() => handleRenew(loan)}
                        className="h-8 text-xs border-teal-300 text-teal-800 hover:bg-teal-50 gap-1.5"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        Renovar (+{prazoRenovacaoDias}d)
                      </Button>

                      <Button
                        size="sm"
                        disabled={isLoadingThis}
                        onClick={() => handleReturn(loan)}
                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5 shadow-sm"
                      >
                        {isLoadingThis ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CornerDownLeft className="w-3.5 h-3.5" />
                        )}
                        Registrar Devolução
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modals */}
      <LoanModal open={loanModalOpen} onOpenChange={setLoanModalOpen} onSuccess={loadLoans} />

      <ConfirmModal
        open={returnConfirmOpen}
        onOpenChange={setReturnConfirmOpen}
        title="Registrar Devolução"
        description={`Confirmar o recebimento e a devolução física do exemplar ${loanToReturn?.id_exemplar} ("${loanToReturn?.exemplar?.titulo?.titulo_de_livro}") emprestado para ${loanToReturn?.leitor?.nome_do_leitor}?`}
        confirmLabel="Confirmar Devolução"
        variant="primary"
        loading={actionLoadingId === loanToReturn?.id_emprestimo}
        onConfirm={executeReturn}
      />

      <ConfirmModal
        open={renewConfirmOpen}
        onOpenChange={setRenewConfirmOpen}
        title="Renovar Prazo de Empréstimo"
        description={`Deseja renovar o empréstimo do exemplar ${loanToRenew?.id_exemplar} ("${loanToRenew?.exemplar?.titulo?.titulo_de_livro}") por mais ${prazoRenovacaoDias} dias corridos?`}
        confirmLabel={`Sim, Renovar (+${prazoRenovacaoDias} dias)`}
        variant="primary"
        loading={actionLoadingId === loanToRenew?.id_emprestimo}
        onConfirm={executeRenew}
      />
    </div>
  )
}
