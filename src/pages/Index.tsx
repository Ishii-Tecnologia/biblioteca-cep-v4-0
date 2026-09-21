import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { EmprestimosService } from '@/services/emprestimos'
import { TitulosService, TituloWithStats, TotaisSeparadosPorColecao } from '@/services/titulos'
import {
  getPrazoEmprestimoDias,
  getMaxRenovacoes,
  getPrazoRenovacaoDias,
} from '@/services/parametros'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  BookOpen,
  Users,
  Repeat,
  AlertTriangle,
  BookmarkCheck,
  Search,
  PlusCircle,
  TrendingUp,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Library,
  BookMarked,
  CheckCircle2,
  Wrench,
  Briefcase,
  Lock,
} from 'lucide-react'
import { BookFormModal } from '@/components/BookFormModal'
import { LoanModal } from '@/components/LoanModal'
import { ReserveModal } from '@/components/ReserveModal'

export default function Index() {
  const { user, isOperadorOrAdmin, isDiretoriaOrAdmin, isAdmin } = useAuth()
  const [stats, setStats] = useState({
    totalTitulos: 0,
    totalExemplares: 0,
    exemplaresDisponiveis: 0,
    exemplaresEmprestados: 0,
    exemplaresManutencao: 0,
    totalLeitores: 0,
    emprestimosAtivos: 0,
    emprestimosAtrasados: 0,
    reservasAtivas: 0,
  })
  const [colecoesStats, setColecoesStats] = useState<TotaisSeparadosPorColecao | null>(null)
  const [recentBooks, setRecentBooks] = useState<TituloWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [prazoDias, setPrazoDias] = useState<number>(15)
  const [maxRenovacoes, setMaxRenovacoes] = useState<number>(1)
  const [prazoRenovacaoDias, setPrazoRenovacaoDias] = useState<number>(15)

  const [bookModalOpen, setBookModalOpen] = useState(false)
  const [loanModalOpen, setLoanModalOpen] = useState(false)
  const [reserveModalOpen, setReserveModalOpen] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [dashboardStats, colStats, books, prazo, maxRenov, prazoRenov] = await Promise.all([
        EmprestimosService.getDashboardMetrics(),
        TitulosService.getTotaisDetalhadosPorColecao().catch(() => null),
        TitulosService.getAll('', 'all', true),
        getPrazoEmprestimoDias(),
        getMaxRenovacoes(),
        getPrazoRenovacaoDias(),
      ])
      setStats(dashboardStats)
      if (colStats) {
        setColecoesStats(colStats)
      }
      setRecentBooks(books.slice(0, 8))
      setPrazoDias(prazo)
      setMaxRenovacoes(maxRenov)
      setPrazoRenovacaoDias(prazoRenov)
    } catch (e) {
      console.error('Error loading dashboard:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  return (
    <div className="space-y-8 pb-10">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-800 via-teal-700 to-slate-900 text-white p-6 sm:p-8 shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-medium backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
            Sistema Integrado de Gestão Bibliotecária
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
            Biblioteca CEP — Controle de Acervo & Empréstimos
          </h1>
          <p className="text-sm sm:text-base text-emerald-100/90 leading-relaxed">
            Plataforma aberta e gratuita para consulta de acervo, registro de empréstimos com
            devolução em {prazoDias} dias, renovações e reservas sem custos adicionais.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              asChild
              className="bg-white text-emerald-900 hover:bg-emerald-50 font-semibold shadow-md gap-2"
            >
              <Link to="/acervo">
                <BookOpen className="w-4 h-4 text-emerald-700" />
                Explorar Acervo Completo
              </Link>
            </Button>

            {isOperadorOrAdmin ? (
              <Button
                onClick={() => setLoanModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md gap-2 border border-emerald-400/40"
              >
                <Repeat className="w-4 h-4" />
                Novo Empréstimo
              </Button>
            ) : user ? (
              <Button
                onClick={() => setReserveModalOpen(true)}
                variant="outline"
                className="bg-emerald-900/40 text-white border-emerald-400/40 hover:bg-emerald-800/60 font-semibold gap-2"
              >
                <BookmarkCheck className="w-4 h-4 text-emerald-300" />
                Fazer Reserva
              </Button>
            ) : null}

            {isOperadorOrAdmin && (
              <Button
                onClick={() => setBookModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium gap-2 shadow-md"
              >
                <PlusCircle className="w-4 h-4 text-blue-200" />
                Cadastrar Livro
              </Button>
            )}
          </div>
        </div>

        {/* Decorative background shape */}
        <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden lg:flex items-center justify-center opacity-15 pointer-events-none">
          <Library className="w-64 h-64 text-white" />
        </div>
      </div>

      {/* Seção de Destaque das Duas Bibliotecas / Coleções */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Library className="w-5 h-5 text-emerald-600" />
              Nossas Bibliotecas & Coleções
            </h2>
            <p className="text-xs text-slate-500">
              Acesse os acervos disponíveis na Biblioteca da CEP
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card Biblioteca Cecília Braga (Acervo Geral) */}
          <Card className="border-emerald-200/90 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40 shadow-xs hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
                  <BookOpen className="w-6 h-6" />
                </div>
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold text-xs py-0.5 px-2">
                  Acervo Geral
                </Badge>
              </div>
              <CardTitle className="text-base sm:text-lg font-bold text-slate-900 mt-2">
                Biblioteca Cecília Braga
              </CardTitle>
              <CardDescription className="text-xs text-slate-600 leading-relaxed">
                Acervo geral da Biblioteca da CEP. Catálogo amplo e aberto a todos os leitores
                cadastrados para pesquisa e empréstimos.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between border-t border-emerald-100/80 pt-3 text-xs">
                {colecoesStats ? (
                  <span className="text-[11px] font-medium text-emerald-800">
                    {colecoesStats.geral.totalTitulos} títulos •{' '}
                    {colecoesStats.geral.totalDisponiveis} disponíveis
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500">Acesso público aos leitores</span>
                )}
                <Button
                  asChild
                  size="sm"
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-2xs"
                >
                  <Link to="/acervo">
                    <span>Acessar Acervo</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Card Biblioteca Rino Curti (Acervo da Diretoria) */}
          {isDiretoriaOrAdmin ? (
            <Card className="border-amber-200/90 bg-gradient-to-br from-amber-50/70 via-white to-orange-50/40 shadow-xs hover:shadow-md hover:border-amber-300 transition-all flex flex-col justify-between">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 shadow-2xs">
                    <Briefcase className="w-6 h-6 text-amber-700" />
                  </div>
                  <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-bold text-xs py-0.5 px-2">
                    Coleção da Diretoria • Restrito
                  </Badge>
                </div>
                <CardTitle className="text-base sm:text-lg font-bold text-slate-900 mt-2 flex items-center gap-2">
                  Biblioteca Rino Curti
                </CardTitle>
                <CardDescription className="text-xs text-slate-600 leading-relaxed">
                  Coleção da Diretoria. Obras institucionais, especiais e de consulta reservada aos
                  membros autorizados da diretoria.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between border-t border-amber-100/80 pt-3 text-xs">
                  {colecoesStats ? (
                    <span className="text-[11px] font-medium text-amber-900">
                      {colecoesStats.diretoria.totalTitulos} títulos •{' '}
                      {colecoesStats.diretoria.totalDisponiveis} disponíveis
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-800 font-medium">Acesso liberado</span>
                  )}
                  <Button
                    asChild
                    size="sm"
                    className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5 shadow-2xs"
                  >
                    <Link to="/acervo-diretoria">
                      <span>Acessar Acervo</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200/80 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Títulos no Acervo
            </CardTitle>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <BookMarked className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{stats.totalTitulos}</div>
            <div className="text-xs text-slate-500 mt-1 space-y-1">
              <p className="flex items-center gap-1">
                <span className="font-semibold text-slate-700">{stats.totalExemplares}</span> cópias
                físicas totais
              </p>
              {colecoesStats && (
                <div className="flex items-center gap-2 pt-0.5 text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    Geral: {colecoesStats.geral.totalTitulos}
                  </span>
                  {isDiretoriaOrAdmin && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                        Diretoria: {colecoesStats.diretoria.totalTitulos}
                      </span>
                    </>
                  )}
                </div>
              )}
              <div
                className="flex items-center gap-1 text-rose-600/70 dark:text-rose-400/70 font-normal cursor-default select-none"
                title="Exemplares atualmente em manutenção"
              >
                <Wrench className="w-3 h-3 shrink-0 opacity-80" />
                <span>{stats.exemplaresManutencao} em manutenção</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Disponíveis para Empréstimo
            </CardTitle>
            <div className="p-2 rounded-lg bg-teal-50 text-teal-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-teal-700">{stats.exemplaresDisponiveis}</div>
            <p className="text-xs text-slate-500 mt-1">
              {stats.exemplaresEmprestados} em circulação no momento
            </p>
            {colecoesStats && isDiretoriaOrAdmin && (
              <div className="flex items-center gap-2 pt-1.5 text-[11px] text-slate-600 border-t border-slate-100 mt-1.5">
                <span className="inline-flex items-center gap-1 font-medium text-teal-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />
                  Geral: {colecoesStats.geral.totalDisponiveis} disp.
                </span>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                  Dir: {colecoesStats.diretoria.totalDisponiveis} disp.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Empréstimos Ativos
            </CardTitle>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Repeat className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{stats.emprestimosAtivos}</div>
            <div className="text-xs mt-1 flex items-center gap-1.5">
              {stats.emprestimosAtrasados > 0 ? (
                <span className="text-rose-600 font-semibold flex items-center gap-0.5">
                  <AlertTriangle className="w-3 h-3" />
                  {stats.emprestimosAtrasados} com atraso
                </span>
              ) : (
                <span className="text-emerald-600 font-medium">Todos em dia</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Leitores Cadastrados
            </CardTitle>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <Users className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{stats.totalLeitores}</div>
            <p className="text-xs text-slate-500 mt-1">
              {stats.reservasAtivas} reserva(s) aguardando liberação
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Search & Filter Area */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Pesquisar por título, autor, gênero ou código..."
            className="pl-9 text-xs sm:text-sm bg-slate-50/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                window.location.href = `/acervo?q=${encodeURIComponent(searchQuery)}`
              }
            }}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="text-xs border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <Link to={searchQuery ? `/acervo?q=${encodeURIComponent(searchQuery)}` : '/acervo'}>
              Buscar no Acervo
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
          >
            <Link to="/acervo">
              Ver Todos ({stats.totalTitulos})
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Featured / Recent Titles Showcase */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-emerald-600" />
              Destaques do Acervo
            </h2>
            <p className="text-xs text-slate-500">
              Obras recém-catalogadas disponíveis para consulta e empréstimo
            </p>
          </div>
          <Link
            to="/acervo"
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
          >
            Explorar catálogo completo
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {recentBooks.map((book) => {
            const hasAvailable = book.exemplares_disponiveis > 0
            return (
              <Card
                key={book.id_titulo}
                className="overflow-hidden border-slate-200/80 hover:border-emerald-300 hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded border">
                      {book.id_titulo}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        hasAvailable
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {hasAvailable
                        ? `${book.exemplares_disponiveis} disponível(is)`
                        : 'Emprestados'}
                    </Badge>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors line-clamp-1 text-sm">
                      {book.titulo_de_livro}
                    </h3>
                    <p className="text-xs text-slate-600 font-medium line-clamp-1">{book.autor}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {book.categoria || 'Geral'}{' '}
                      {book.ano_publicacao ? `• ${book.ano_publicacao}` : ''}
                    </p>
                  </div>
                </div>

                <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-500">
                    Total: {book.total_exemplares} exemplar(es)
                  </span>
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100/50 p-0 px-2"
                  >
                    <Link to={`/acervo?q=${encodeURIComponent(book.id_titulo)}`}>Ver detalhes</Link>
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Library Rules and Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
            <Clock className="w-4 h-4 text-emerald-600" />
            Prazo de {prazoDias} Dias
          </div>
          <p className="text-xs text-emerald-800 leading-relaxed">
            Empréstimos com prazo padrão de {prazoDias} dias corridos. Devolução simples e rápida no
            balcão de atendimento.
          </p>
        </div>

        <div className="bg-teal-50/70 border border-teal-200/80 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-teal-900 font-bold text-sm">
            <Repeat className="w-4 h-4 text-teal-600" />
            {maxRenovacoes} {maxRenovacoes === 1 ? 'Renovação Permitida' : 'Renovações Permitidas'}
          </div>
          <p className="text-xs text-teal-800 leading-relaxed">
            {maxRenovacoes === 1
              ? `É permitida uma renovação por mais ${prazoRenovacaoDias} dias caso o livro não possua solicitações ativas na fila de reservas.`
              : `São permitidas até ${maxRenovacoes} renovações por mais ${prazoRenovacaoDias} dias cada, caso o livro não possua solicitações ativas na fila de reservas.`}
          </p>
        </div>

        <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <ShieldCheck className="w-4 h-4 text-slate-700" />
            Gratuito & Educativo
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">
            O acervo é público e comunitário. Não há cobrança de taxas ou multas pecuniárias para
            uso dos serviços.
          </p>
        </div>
      </div>

      {/* Modals */}
      <BookFormModal
        isOpen={bookModalOpen}
        onClose={() => setBookModalOpen(false)}
        onSuccess={loadData}
        categories={[]}
      />
      <LoanModal open={loanModalOpen} onOpenChange={setLoanModalOpen} onSuccess={loadData} />
      <ReserveModal
        open={reserveModalOpen}
        onOpenChange={setReserveModalOpen}
        onSuccess={loadData}
      />
    </div>
  )
}
