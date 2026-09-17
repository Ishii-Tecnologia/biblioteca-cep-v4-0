import React, { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { EmprestimosService, EmprestimoDetailed } from '@/services/emprestimos'
import { LeitorWithStats, Leitor } from '@/services/leitores'
import { formatDate, formatDateTime } from '@/lib/utils'
import {
  History,
  BookOpen,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Search,
  Loader2,
  BookMarked,
  User,
  ShieldAlert,
} from 'lucide-react'

interface ReaderLoanHistoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reader: LeitorWithStats | Leitor | null
}

export function ReaderLoanHistoryModal({
  open,
  onOpenChange,
  reader,
}: ReaderLoanHistoryModalProps) {
  const [loans, setLoans] = useState<EmprestimoDetailed[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'todos' | 'em_aberto' | 'devolvidos' | 'atrasados'
  >('todos')

  useEffect(() => {
    if (open && reader?.id_leitor) {
      loadHistory(reader.id_leitor)
      setSearch('')
      setStatusFilter('todos')
    } else {
      setLoans([])
      setError(null)
    }
  }, [open, reader?.id_leitor])

  const loadHistory = async (readerId: number) => {
    setLoading(true)
    setError(null)
    try {
      const data = await EmprestimosService.getByLeitor(readerId)
      setLoans(data)
    } catch (err: any) {
      console.error('[ReaderLoanHistoryModal] Erro ao carregar histórico:', err)
      setError(err.message || 'Não foi possível carregar o histórico de empréstimos.')
    } finally {
      setLoading(false)
    }
  }

  const filteredLoans = useMemo(() => {
    return loans.filter((loan) => {
      const isReturned = !!loan.data_devolucao_real
      const isOverdue = !isReturned && loan.atraso

      if (statusFilter === 'em_aberto' && isReturned) return false
      if (statusFilter === 'devolvidos' && !isReturned) return false
      if (statusFilter === 'atrasados' && !isOverdue) return false

      if (search.trim()) {
        const q = search.toLowerCase().trim()
        const bookTitle = loan.exemplar?.titulo?.titulo_de_livro?.toLowerCase() || ''
        const author = loan.exemplar?.titulo?.autor?.toLowerCase() || ''
        const copyCode = loan.id_exemplar.toLowerCase()
        return bookTitle.includes(q) || author.includes(q) || copyCode.includes(q)
      }

      return true
    })
  }, [loans, search, statusFilter])

  // Contadores para filtros
  const counts = useMemo(() => {
    const total = loans.length
    const abertos = loans.filter((l) => !l.data_devolucao_real).length
    const atrasados = loans.filter((l) => !l.data_devolucao_real && l.atraso).length
    const devolvidos = loans.filter((l) => !!l.data_devolucao_real).length
    return { total, abertos, atrasados, devolvidos }
  }, [loans])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <DialogTitle className="flex items-center gap-2 text-slate-900 text-lg">
                  <History className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>Histórico de Empréstimos</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Consulta de todas as obras retiradas, datas de empréstimo/devolução e situação.
                </DialogDescription>
              </div>

              {reader && (
                <div className="text-right shrink-0">
                  <span className="font-mono text-[10px] text-slate-400 block">
                    ID #{reader.id_leitor}
                  </span>
                  {reader.bloqueado && (
                    <Badge
                      variant="outline"
                      className="border-rose-200 bg-rose-50 text-rose-700 text-[10px] px-1.5 py-0"
                    >
                      Bloqueado
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Reader Card pill */}
            {reader && (
              <div className="mt-3 flex items-center gap-3 p-2.5 rounded-lg bg-white border border-slate-200/80 shadow-2xs">
                <Avatar className="w-9 h-9 border border-emerald-400/40 shrink-0">
                  {reader.foto && <AvatarImage src={reader.foto} alt={reader.nome_do_leitor} />}
                  <AvatarFallback className="bg-emerald-100 text-emerald-800 text-xs font-bold">
                    {reader.nome_do_leitor ? reader.nome_do_leitor.slice(0, 2).toUpperCase() : 'L'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 text-sm truncate">
                      {reader.nome_do_leitor}
                    </span>
                    {(reader as any).acesso_diretoria && (
                      <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[9px] px-1.5 py-0 font-medium">
                        Diretoria
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 truncate">
                    <span className="truncate">{reader.email}</span>
                    {reader.telefone && <span>• {reader.telefone}</span>}
                  </div>
                </div>
              </div>
            )}
          </DialogHeader>

          {/* Quick search & Filters */}
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar por livro, autor ou código de exemplar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs h-8 bg-white"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-md self-start sm:self-auto">
              <Button
                type="button"
                size="sm"
                variant={statusFilter === 'todos' ? 'default' : 'ghost'}
                onClick={() => setStatusFilter('todos')}
                className={`h-7 text-xs px-2.5 ${
                  statusFilter === 'todos'
                    ? 'bg-white text-slate-900 shadow-2xs hover:bg-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos ({counts.total})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={statusFilter === 'em_aberto' ? 'default' : 'ghost'}
                onClick={() => setStatusFilter('em_aberto')}
                className={`h-7 text-xs px-2.5 ${
                  statusFilter === 'em_aberto'
                    ? 'bg-white text-slate-900 shadow-2xs hover:bg-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ativos ({counts.abertos})
              </Button>
              {counts.atrasados > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant={statusFilter === 'atrasados' ? 'default' : 'ghost'}
                  onClick={() => setStatusFilter('atrasados')}
                  className={`h-7 text-xs px-2.5 ${
                    statusFilter === 'atrasados'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs hover:bg-rose-50 font-semibold'
                      : 'text-rose-600 hover:text-rose-700'
                  }`}
                >
                  Atrasados ({counts.atrasados})
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant={statusFilter === 'devolvidos' ? 'default' : 'ghost'}
                onClick={() => setStatusFilter('devolvidos')}
                className={`h-7 text-xs px-2.5 ${
                  statusFilter === 'devolvidos'
                    ? 'bg-white text-slate-900 shadow-2xs hover:bg-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Devolvidos ({counts.devolvidos})
              </Button>
            </div>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 min-h-[260px] max-h-[58vh]">
          {loading ? (
            <div className="py-16 text-center flex flex-col items-center justify-center gap-2 text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
              <p className="text-xs font-medium">Carregando histórico do leitor...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Erro ao buscar histórico</p>
                <p className="mt-0.5">{error}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reader && loadHistory(reader.id_leitor)}
                  className="mt-2 h-7 text-xs bg-white text-rose-700 border-rose-300 hover:bg-rose-100"
                >
                  Tentar novamente
                </Button>
              </div>
            </div>
          ) : filteredLoans.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50 p-6">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-semibold text-slate-700">
                {loans.length === 0
                  ? 'Este leitor ainda não possui empréstimos'
                  : 'Nenhum empréstimo encontrado para os filtros selecionados'}
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                {loans.length === 0
                  ? 'Quando o leitor retirar exemplares na biblioteca, o histórico completo aparecerá aqui com datas e status.'
                  : 'Tente alterar o filtro ou o termo de busca para visualizar outros registros.'}
              </p>
            </div>
          ) : (
            filteredLoans.map((loan) => {
              const isReturned = !!loan.data_devolucao_real
              const isOverdue = !isReturned && loan.atraso
              const titulo = loan.exemplar?.titulo

              return (
                <div
                  key={loan.id_emprestimo}
                  className={`border rounded-lg p-3.5 transition-all bg-white flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                    isOverdue
                      ? 'border-rose-200 bg-rose-50/20'
                      : isReturned
                        ? 'border-slate-200/90 hover:border-slate-300'
                        : 'border-emerald-200 bg-emerald-50/10 hover:border-emerald-300'
                  }`}
                >
                  {/* Left: Book details & cover */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Cover or fallback */}
                    <div className="w-12 h-16 rounded bg-slate-100 border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center">
                      {titulo?.capa_url ? (
                        <img
                          src={titulo.capa_url}
                          alt={titulo.titulo_de_livro || 'Capa'}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <BookMarked className="w-6 h-6 text-slate-400" />
                      )}
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          Exemplar: {loan.id_exemplar}
                        </span>
                        {(() => {
                          const isDiretoria =
                            (titulo as any)?.colecao === 'diretoria' ||
                            loan.id_exemplar?.toUpperCase().startsWith('DIR-')
                          return isDiretoria ? (
                            <Badge
                              variant="outline"
                              className="bg-amber-50 text-amber-900 border-amber-300 font-semibold text-[10px] py-0 px-1.5 shadow-none"
                            >
                              Biblioteca Rino Curti
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-emerald-50 text-emerald-800 border-emerald-300 font-medium text-[10px] py-0 px-1.5 shadow-none"
                            >
                              Biblioteca Cecilia Braga
                            </Badge>
                          )
                        })()}
                        {titulo?.categoria && (
                          <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                            {titulo.categoria}
                          </span>
                        )}
                      </div>

                      <h4 className="font-bold text-slate-900 text-sm leading-tight line-clamp-2">
                        {titulo?.titulo_de_livro || 'Título não identificado'}
                      </h4>

                      <p className="text-xs text-slate-600 truncate">
                        {titulo?.autor ? `Autor: ${titulo.autor}` : 'Autor não informado'}
                      </p>

                      {/* Dates row */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 pt-1.5">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Empréstimo:</span>
                          <strong className="text-slate-800 font-medium">
                            {formatDate(loan.data_emprestimo)}
                          </strong>
                        </div>

                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Prevista:</span>
                          <strong
                            className={`font-medium ${
                              isOverdue ? 'text-rose-600 font-bold' : 'text-slate-800'
                            }`}
                          >
                            {formatDate(loan.data_prevista_devolucao)}
                          </strong>
                        </div>

                        {loan.data_devolucao_real && (
                          <div className="flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Devolvido em:</span>
                            <strong className="font-semibold">
                              {formatDate(loan.data_devolucao_real)}
                            </strong>
                          </div>
                        )}

                        {loan.numero_renovacoes > 0 && (
                          <div className="flex items-center gap-1 text-slate-500">
                            <RotateCcw className="w-3 h-3 text-slate-400" />
                            <span>{loan.numero_renovacoes} renovação(ões)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Status badge */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    {isReturned ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs py-0.5 px-2 gap-1 font-medium shadow-none hover:bg-emerald-50">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Devolvido
                      </Badge>
                    ) : isOverdue ? (
                      <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-xs py-0.5 px-2 gap-1 font-bold shadow-none hover:bg-rose-100">
                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                        Atrasado ({loan.dias_atraso}d)
                      </Badge>
                    ) : (
                      <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs py-0.5 px-2 gap-1 font-medium shadow-none hover:bg-blue-50">
                        <Clock className="w-3 h-3 text-blue-600" />
                        Em Andamento
                      </Badge>
                    )}

                    <span className="text-[10px] text-slate-400 font-mono">
                      Empréstimo #{loan.id_emprestimo}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Total: <strong className="text-slate-800">{filteredLoans.length}</strong> empréstimo(s)
            {loans.length !== filteredLoans.length && ` (de ${loans.length} no total)`}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs bg-white"
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
