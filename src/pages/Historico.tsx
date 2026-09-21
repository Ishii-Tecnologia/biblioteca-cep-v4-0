import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HistoricoService, HistoricoDetailed, MovimentacaoReportItem } from '@/services/historico'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { formatDate, formatDateTime, formatPhone } from '@/lib/utils'
import { exportToCsv } from '@/lib/csv'
import { getCsvSeparador } from '@/services/parametros'
import { AuditoriaJobService, AuditoriaJobConfig } from '@/services/auditoria-job'
import { DatePickerBR } from '@/components/DatePickerBR'
import {
  History,
  Search,
  Calendar,
  User,
  Book,
  Download,
  Trash2,
  AlertTriangle,
  Clock,
  Layers,
  Users as UsersIcon,
  Activity,
  Shield,
  Phone,
  Mail,
  Copy,
  Lock,
  Repeat,
  Printer,
  SlidersHorizontal,
  CheckSquare,
  Square,
  BarChart2,
  Bookmark,
  Wrench,
  RotateCcw,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

export default function Historico() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTipoParam = searchParams.get('tipo') || 'todos'

  const { profile } = useAuth()
  const { toast } = useToast()

  // Tab state
  const [activeTab, setActiveTab] = useState<
    'logs' | 'leitores' | 'titulos' | 'usuarios' | 'movimentacoes'
  >((searchParams.get('tab') as any) || 'logs')

  // --- ABA 1: LOGS / HISTÓRICO GERAL ---
  const [logs, setLogs] = useState<HistoricoDetailed[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [searchLogs, setSearchLogs] = useState('')
  const [tipoFiltroLogs, setTipoFiltroLogs] = useState<string>(initialTipoParam)
  const [colecaoLogsFilter, setColecaoLogsFilter] = useState<'all' | 'geral' | 'diretoria'>('all')
  const [dataInicioLogs, setDataInicioLogs] = useState('')
  const [dataFimLogs, setDataFimLogs] = useState('')

  // Auditoria Automática & Expurgo States
  const [auditConfig, setAuditConfig] = useState<AuditoriaJobConfig | null>(null)
  const [runningJob, setRunningJob] = useState(false)

  // Clean logs modal
  const [isCleanModalOpen, setIsCleanModalOpen] = useState(false)
  const [cleanPeriod, setCleanPeriod] = useState('30')
  const [cleanType, setCleanType] = useState('todos')
  const [isCleaning, setIsCleaning] = useState(false)

  // --- ABA NOVIDADE: RELATÓRIO DE LEITORES ---
  const [leitoresList, setLeitoresList] = useState<any[]>([])
  const [loadingLeitores, setLoadingLeitores] = useState(false)
  const [searchLeitores, setSearchLeitores] = useState('')
  const [statusLeitoresFilter, setStatusLeitoresFilter] = useState('all')

  // --- ABA 2: TÍTULOS COM EXEMPLARES ---
  const [titulosList, setTitulosList] = useState<any[]>([])
  const [loadingTitulos, setLoadingTitulos] = useState(false)
  const [searchTitulos, setSearchTitulos] = useState('')
  const [categoryTitulosFilter, setCategoryTitulosFilter] = useState('all')
  const [colecaoTitulosFilter, setColecaoTitulosFilter] = useState<'all' | 'geral' | 'diretoria'>(
    'all',
  )

  // --- ABA 3: USUÁRIOS ---
  const [usuariosList, setUsuariosList] = useState<any[]>([])
  const [loadingUsuarios, setLoadingUsuarios] = useState(false)
  const [searchUsuarios, setSearchUsuarios] = useState('')
  const [roleUsuariosFilter, setRoleUsuariosFilter] = useState('all')

  // --- ABA 4: MOVIMENTAÇÕES POR DATA ---
  const [movimentacoesList, setMovimentacoesList] = useState<MovimentacaoReportItem[]>([])
  const [loadingMovimentacoes, setLoadingMovimentacoes] = useState(false)
  const [dataInicioMov, setDataInicioMov] = useState('')
  const [dataFimMov, setDataFimMov] = useState('')
  const [tipoMovFilter, setTipoMovFilter] = useState('all')
  const [colecaoMovFilter, setColecaoMovFilter] = useState<'all' | 'geral' | 'diretoria'>('all')
  const [searchMov, setSearchMov] = useState('')

  // --- CHAVES LOCALSTORAGE PARA PERSISTÊNCIA DE COLUNAS ---
  const STORAGE_KEYS = {
    logs: 'biblioteca_cep_relatorio_cols_logs',
    leitores: 'biblioteca_cep_relatorio_cols_leitores',
    titulos: 'biblioteca_cep_relatorio_cols_titulos',
    usuarios: 'biblioteca_cep_relatorio_cols_usuarios',
    movimentacoes: 'biblioteca_cep_relatorio_cols_movimentacoes',
  }

  // --- SELEÇÃO DE COLUNAS PARA IMPRESSÃO / PDF (COM PERSISTÊNCIA) ---
  const defaultColsLogs = {
    data_hora: true,
    operacao: true,
    acervo: true,
    exemplar: true,
    leitor: true,
    operador: true,
    detalhes: true,
    observacao: true,
  }

  const [colsLogs, setColsLogs] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.logs)
      if (saved) {
        return { ...defaultColsLogs, ...JSON.parse(saved) }
      }
    } catch (e) {
      console.error('Erro ao ler colunas de logs do localStorage', e)
    }
    return defaultColsLogs
  })

  const defaultColsLeitores = {
    id: true,
    nome: true,
    email: true,
    telefone: true,
    status: true,
    emprestimos: true,
    data_cadastro: true,
  }

  const [colsLeitores, setColsLeitores] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.leitores)
      if (saved) {
        return { ...defaultColsLeitores, ...JSON.parse(saved) }
      }
    } catch (e) {
      console.error('Erro ao ler colunas de leitores do localStorage', e)
    }
    return defaultColsLeitores
  })

  const defaultColsTitulos = {
    codigo: true,
    titulo: true,
    acervo: true,
    autor: true,
    categoria: true,
    editora: true,
    total_exemplares: true,
    detalhes_exemplares: true,
  }

  const [colsTitulos, setColsTitulos] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.titulos)
      if (saved) {
        return { ...defaultColsTitulos, ...JSON.parse(saved) }
      }
    } catch (e) {
      console.error('Erro ao ler colunas de titulos do localStorage', e)
    }
    return defaultColsTitulos
  })

  const defaultColsUsuarios = {
    nome: true,
    email: true,
    telefone: true,
    papel: true,
    status: true,
    data_cadastro: true,
  }

  const [colsUsuarios, setColsUsuarios] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.usuarios)
      if (saved) {
        return { ...defaultColsUsuarios, ...JSON.parse(saved) }
      }
    } catch (e) {
      console.error('Erro ao ler colunas de usuários do localStorage', e)
    }
    return defaultColsUsuarios
  })

  const defaultColsMovimentacoes = {
    tipo: true,
    data_evento: true,
    titulo_livro: true,
    acervo: true,
    exemplar: true,
    leitor: true,
    status: true,
    detalhes: true,
  }

  const [colsMovimentacoes, setColsMovimentacoes] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.movimentacoes)
      if (saved) {
        return { ...defaultColsMovimentacoes, ...JSON.parse(saved) }
      }
    } catch (e) {
      console.error('Erro ao ler colunas de movimentações do localStorage', e)
    }
    return defaultColsMovimentacoes
  })

  // Efeitos para persistir quando o usuário altera qualquer seleção de colunas
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(colsLogs))
    } catch (e) {
      console.error('Erro ao salvar colunas de logs no localStorage', e)
    }
  }, [colsLogs])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.leitores, JSON.stringify(colsLeitores))
    } catch (e) {
      console.error('Erro ao salvar colunas de leitores no localStorage', e)
    }
  }, [colsLeitores])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.titulos, JSON.stringify(colsTitulos))
    } catch (e) {
      console.error('Erro ao salvar colunas de títulos no localStorage', e)
    }
  }, [colsTitulos])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.usuarios, JSON.stringify(colsUsuarios))
    } catch (e) {
      console.error('Erro ao salvar colunas de usuários no localStorage', e)
    }
  }, [colsUsuarios])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.movimentacoes, JSON.stringify(colsMovimentacoes))
    } catch (e) {
      console.error('Erro ao salvar colunas de movimentações no localStorage', e)
    }
  }, [colsMovimentacoes])

  // Check admin
  const isAdmin = profile?.role === 'admin'

  // Sincronizar query params
  useEffect(() => {
    const tipo = searchParams.get('tipo')
    if (tipo && tipo !== tipoFiltroLogs) {
      setTipoFiltroLogs(tipo)
    }
    const tab = searchParams.get('tab')
    if (tab && tab !== activeTab) {
      setActiveTab(tab as any)
    }
  }, [searchParams])

  // Carregar status do agendamento de auditoria
  const fetchAuditConfig = async () => {
    try {
      const cfg = await AuditoriaJobService.loadConfig()
      setAuditConfig(cfg)
    } catch (e) {
      console.warn('Erro ao carregar parâmetros de auditoria no histórico:', e)
    }
  }

  // Disparo manual com filtro de N dias
  const handleExecuteAuditJobDirect = async () => {
    setRunningJob(true)
    try {
      const res = await AuditoriaJobService.runJobNow(true)
      if (!res.success) {
        throw new Error(res.error || res.message)
      }
      toast({
        title: 'Job de Auditoria Executado',
        description: res.message,
        className: 'bg-white text-slate-900 border-emerald-200 shadow-md',
      })
      await fetchLogs()
      await fetchAuditConfig()
    } catch (err: any) {
      toast({
        title: 'Falha ao executar auditoria mensal',
        description: err.message || 'Erro inesperado na execução do job.',
        variant: 'destructive',
      })
    } finally {
      setRunningJob(false)
    }
  }

  // Aplicar filtro dos últimos N dias no histórico
  const handleApplyNDaysFilter = () => {
    const days = auditConfig?.diasRetroativos || 30
    const today = new Date()
    const startDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000)

    const startStr = `${String(startDate.getDate()).padStart(2, '0')}/${String(startDate.getMonth() + 1).padStart(2, '0')}/${startDate.getFullYear()}`
    const endStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`

    setDataInicioLogs(startStr)
    setDataFimLogs(endStr)
    fetchLogs(undefined, startStr, endStr)

    toast({
      title: `Filtro aplicado: últimos ${days} dias`,
      description: `Período configurado de ${startStr} até ${endStr}.`,
    })
  }

  // Load logs
  const fetchLogs = async (customTipo?: string, customInicio?: string, customFim?: string) => {
    // Quando o tipo estiver marcado como "Todos os tipos" (ou "todos"), listar todos os registros da tabela (sem filtro de tipo)
    try {
      setLoadingLogs(true)
      const currentTipo = customTipo !== undefined ? customTipo : tipoFiltroLogs
      const data = await HistoricoService.getAll(
        0,
        currentTipo === 'todos' ? undefined : currentTipo,
        (customInicio !== undefined ? customInicio : dataInicioLogs).trim() || undefined,
        (customFim !== undefined ? customFim : dataFimLogs).trim() || undefined,
      )
      setLogs(data)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar histórico',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoadingLogs(false)
    }
  }

  // Filter logs manually via button
  const handleFilterLogs = () => {
    if (!dataInicioLogs.trim() || !dataFimLogs.trim()) {
      toast({
        title: 'Informe a data inicial e final',
        description:
          'Por favor, preencha os campos "De" e "Até" com as datas desejadas antes de aplicar o filtro.',
        variant: 'destructive',
      })
      return
    }
    fetchLogs(undefined, dataInicioLogs, dataFimLogs)
  }

  const handleTipoLogsChange = (newTipo: string) => {
    setTipoFiltroLogs(newTipo)
    if (newTipo !== 'todos') {
      setSearchParams({ tipo: newTipo })
    } else {
      setSearchParams({})
    }
  }

  const handleResetLogsFilter = () => {
    setTipoFiltroLogs('todos')
    setColecaoLogsFilter('all')
    setSearchLogs('')
    setDataInicioLogs('')
    setDataFimLogs('')
    setSearchParams({})
    fetchLogs('todos', '', '')
  }

  // Load leitores
  const fetchLeitores = async () => {
    try {
      setLoadingLeitores(true)
      const data = await HistoricoService.getLeitoresReport()
      setLeitoresList(data)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar relatório de leitores',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoadingLeitores(false)
    }
  }

  // Load titulos
  const fetchTitulos = async () => {
    try {
      setLoadingTitulos(true)
      const data = await HistoricoService.getTitulosComExemplares()
      setTitulosList(data)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar títulos e exemplares',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoadingTitulos(false)
    }
  }

  // Load usuarios
  const fetchUsuarios = async () => {
    try {
      setLoadingUsuarios(true)
      const data = await HistoricoService.getUsuariosReport()
      setUsuariosList(data)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar relatório de usuários',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoadingUsuarios(false)
    }
  }

  // Load movimentacoes
  const fetchMovimentacoes = async (customInicio?: string, customFim?: string) => {
    try {
      setLoadingMovimentacoes(true)
      const data = await HistoricoService.getMovimentacoesPorData(
        (customInicio !== undefined ? customInicio : dataInicioMov).trim() || undefined,
        (customFim !== undefined ? customFim : dataFimMov).trim() || undefined,
      )
      setMovimentacoesList(data)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar movimentações',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoadingMovimentacoes(false)
    }
  }

  // Filter movimentações manually via button
  const handleFilterMovimentacoes = () => {
    if (!dataInicioMov.trim() || !dataFimMov.trim()) {
      toast({
        title: 'Informe a data inicial e final',
        description:
          'Por favor, preencha os campos "De" e "Até" com as datas desejadas antes de aplicar o filtro.',
        variant: 'destructive',
      })
      return
    }
    fetchMovimentacoes(dataInicioMov, dataFimMov)
  }

  useEffect(() => {
    fetchLogs()
    fetchAuditConfig()
  }, [tipoFiltroLogs])

  useEffect(() => {
    if (activeTab === 'leitores' && leitoresList.length === 0) {
      fetchLeitores()
    } else if (activeTab === 'titulos') {
      fetchTitulos()
    } else if (activeTab === 'usuarios' && usuariosList.length === 0) {
      fetchUsuarios()
    } else if (activeTab === 'movimentacoes') {
      fetchMovimentacoes()
    }
  }, [activeTab])

  // Filter logs locally by search and acervo
  const filteredLogs = logs.filter((l) => {
    if (colecaoLogsFilter !== 'all') {
      const col = (
        l.colecao || (l.id_exemplar?.toUpperCase().startsWith('DIR-') ? 'diretoria' : 'geral')
      ).toLowerCase()
      if (col !== colecaoLogsFilter) return false
    }
    if (!searchLogs) return true
    const q = searchLogs.toLowerCase()
    const acervoLabel = (
      l.colecao || (l.id_exemplar?.toUpperCase().startsWith('DIR-') ? 'diretoria' : 'geral')
    ).toLowerCase()
    return (
      (l.detalhes && l.detalhes.toLowerCase().includes(q)) ||
      (l.observacao && l.observacao.toLowerCase().includes(q)) ||
      (l.tipo_operacao && l.tipo_operacao.toLowerCase().includes(q)) ||
      (l.id_exemplar && l.id_exemplar.toLowerCase().includes(q)) ||
      (l.leitor?.nome_do_leitor && l.leitor.nome_do_leitor.toLowerCase().includes(q)) ||
      (l.usuario_sistema && l.usuario_sistema.toLowerCase().includes(q)) ||
      acervoLabel.includes(q)
    )
  })

  // Filter leitores locally
  const filteredLeitores = leitoresList.filter((l) => {
    const matchesStatus =
      statusLeitoresFilter === 'all' ||
      (statusLeitoresFilter === 'ativos' && !l.bloqueado) ||
      (statusLeitoresFilter === 'bloqueados' && l.bloqueado)
    if (!matchesStatus) return false
    if (!searchLeitores) return true
    const q = searchLeitores.toLowerCase()
    return (
      (l.nome_do_leitor && l.nome_do_leitor.toLowerCase().includes(q)) ||
      (l.email && l.email.toLowerCase().includes(q)) ||
      (l.telefone && l.telefone.toLowerCase().includes(q))
    )
  })

  // Filter titulos locally
  const filteredTitulos = titulosList.filter((item) => {
    const itemColecao = (
      item.colecao || (item.id_titulo?.toUpperCase().startsWith('DIR-') ? 'diretoria' : 'geral')
    ).toLowerCase()
    if (colecaoTitulosFilter !== 'all' && itemColecao !== colecaoTitulosFilter) {
      return false
    }
    const matchesCategory =
      categoryTitulosFilter === 'all' || item.categoria === categoryTitulosFilter
    if (!matchesCategory) return false
    if (!searchTitulos) return true
    const q = searchTitulos.toLowerCase()
    const acervoLabel = itemColecao === 'diretoria' ? 'diretoria' : 'geral'
    const matchesSearch =
      (item.titulo_de_livro && item.titulo_de_livro.toLowerCase().includes(q)) ||
      (item.autor && item.autor.toLowerCase().includes(q)) ||
      (item.categoria && item.categoria.toLowerCase().includes(q)) ||
      (item.id_titulo && item.id_titulo.toLowerCase().includes(q)) ||
      acervoLabel.includes(q) ||
      (item.exemplar && item.exemplar.some((ex: any) => ex.id_exemplar.toLowerCase().includes(q)))
    return matchesSearch
  })

  // Categories list for filter
  const categoriesList = Array.from(
    new Set(titulosList.map((t) => t.categoria).filter(Boolean)),
  ).sort()

  // Filter usuarios locally
  const filteredUsuarios = usuariosList.filter((u) => {
    const matchesRole = roleUsuariosFilter === 'all' || u.role === roleUsuariosFilter
    if (!matchesRole) return false
    if (!searchUsuarios) return true
    const q = searchUsuarios.toLowerCase()
    return (
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.nome && u.nome.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.telefone && u.telefone.toLowerCase().includes(q)) ||
      (u.phone && u.phone.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q))
    )
  })

  // Filter movimentacoes locally
  const filteredMovimentacoes = movimentacoesList.filter((m) => {
    const mColecao = (
      m.colecao || (m.id_exemplar?.toUpperCase().startsWith('DIR-') ? 'diretoria' : 'geral')
    ).toLowerCase()
    if (colecaoMovFilter !== 'all' && mColecao !== colecaoMovFilter) {
      return false
    }
    const matchesTipo = tipoMovFilter === 'all' || m.tipo_registro === tipoMovFilter
    if (!matchesTipo) return false
    if (!searchMov) return true
    const q = searchMov.toLowerCase()
    const acervoLabel = mColecao === 'diretoria' ? 'diretoria' : 'geral'
    return (
      m.titulo_livro.toLowerCase().includes(q) ||
      m.leitor_nome.toLowerCase().includes(q) ||
      (m.id_exemplar && m.id_exemplar.toLowerCase().includes(q)) ||
      m.detalhes.toLowerCase().includes(q) ||
      acervoLabel.includes(q)
    )
  })

  // Clean logs handler
  const handleCleanLogs = async () => {
    try {
      setIsCleaning(true)
      const count = await HistoricoService.deleteWithFilters(parseInt(cleanPeriod, 10), cleanType)
      toast({
        title: 'Histórico limpo com sucesso',
        description: `${count} registro(s) excluído(s).`,
      })
      setIsCleanModalOpen(false)
      fetchLogs()
    } catch (err: any) {
      toast({
        title: 'Erro ao limpar histórico',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsCleaning(false)
    }
  }

  // Export CSV helper padronizado com separador configurado (default ';' ou ',') e BOM UTF-8
  const exportCSV = async (data: any[], filename: string) => {
    if (!data.length) {
      toast({
        title: 'Sem dados para exportar',
        variant: 'destructive',
      })
      return
    }

    const delimiter = await getCsvSeparador()
    exportToCsv(data, filename, undefined, delimiter)
  }

  // Resumo de exemplares agrupado por categoria
  const categoryStats = (() => {
    const stats: Record<string, { titulos: number; exemplares: number }> = {}
    filteredTitulos.forEach((t) => {
      const cat = t.categoria || 'Sem categoria'
      if (!stats[cat]) {
        stats[cat] = { titulos: 0, exemplares: 0 }
      }
      stats[cat].titulos += 1
      stats[cat].exemplares += (t.exemplar || []).length
    })
    return Object.entries(stats).sort((a, b) => b[1].exemplares - a[1].exemplares)
  })()

  const totalExemplaresGeral = filteredTitulos.reduce(
    (acc, t) => acc + (t.exemplar || []).length,
    0,
  )

  // Export leitores CSV
  const handleExportLeitores = () => {
    const exportData = filteredLeitores.map((l) => ({
      ID: l.id_leitor,
      Nome: l.nome_do_leitor || '-',
      Email: l.email || '-',
      Telefone: l.telefone ? formatPhone(l.telefone) : '-',
      Status: l.bloqueado ? 'Bloqueado' : 'Ativo',
      Data_Cadastro: formatDate(l.data_cadastro || l.created_at),
      Emprestimos_Ativos: l.emprestimos_ativos || 0,
      Emprestimos_Atrasados: l.emprestimos_atrasados || 0,
      Total_Emprestimos: l.total_emprestimos || 0,
    }))
    exportCSV(exportData, 'relatorio_leitores')
  }

  // Print/Export PDF function for Relatório de Leitores
  const handlePrintLeitores = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast({
        title: 'Bloqueio de pop-up detectado',
        description: 'Permita pop-ups no seu navegador para imprimir ou gerar PDF.',
        variant: 'destructive',
      })
      return
    }

    const visibleColsCount = Object.values(colsLeitores).filter(Boolean).length || 1

    const ths: string[] = []
    if (colsLeitores.id) ths.push('<th>ID</th>')
    if (colsLeitores.nome) ths.push('<th>Nome</th>')
    if (colsLeitores.email) ths.push('<th>E-mail</th>')
    if (colsLeitores.telefone) ths.push('<th>Telefone</th>')
    if (colsLeitores.status) ths.push('<th>Status</th>')
    if (colsLeitores.emprestimos)
      ths.push('<th style="text-align: center;">Empréstimos (Ativos / Total)</th>')
    if (colsLeitores.data_cadastro) ths.push('<th style="text-align: center;">Data Cadastro</th>')

    const rowsHtml = filteredLeitores
      .map((l) => {
        const tds: string[] = []
        if (colsLeitores.id) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">#${l.id_leitor}</td>`,
          )
        }
        if (colsLeitores.nome) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${l.nome_do_leitor || 'Sem nome'}</td>`,
          )
        }
        if (colsLeitores.email) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${l.email || '-'}</td>`,
          )
        }
        if (colsLeitores.telefone) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${l.telefone ? formatPhone(l.telefone) : '-'}</td>`,
          )
        }
        if (colsLeitores.status) {
          tds.push(`
            <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">
              <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; background-color: ${l.bloqueado ? '#fee2e2; color: #991b1b;' : '#dcfce7; color: #166534;'}">
                ${l.bloqueado ? 'Bloqueado' : 'Ativo'}
              </span>
            </td>
          `)
        }
        if (colsLeitores.emprestimos) {
          tds.push(`
            <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">
              <strong>${l.emprestimos_ativos || 0}</strong> ativo(s) / <strong>${l.total_emprestimos || 0}</strong> total
              ${l.emprestimos_atrasados > 0 ? `<br><span style="color: #e11d48; font-size: 10px; font-weight: bold;">(${l.emprestimos_atrasados} atrasado)</span>` : ''}
            </td>
          `)
        }
        if (colsLeitores.data_cadastro) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace; text-align: center;">${formatDate(l.data_cadastro || l.created_at)}</td>`,
          )
        }
        return `<tr>${tds.join('')}</tr>`
      })
      .join('')

    const dateToday = formatDate(new Date())

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Relatório de Leitores - Biblioteca CEP</title>
          <style>
            @media print {
              @page { size: landscape; margin: 12mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 10px; margin-bottom: 15px; }
            .title { font-size: 18px; font-weight: bold; color: #065f46; margin: 0; }
            .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
            .meta { text-align: right; font-size: 11px; color: #64748b; }
            table { width: 100%; border-collapse: collapse; text-align: left; }
            th { background-color: #f8fafc; padding: 8px; border-bottom: 2px solid #cbd5e1; font-weight: 600; color: #475569; font-size: 11px; text-transform: uppercase; }
            .summary { margin-top: 15px; padding: 10px; background-color: #f1f5f9; border-radius: 6px; font-size: 11px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">Biblioteca CEP - Relatório de Leitores</h1>
              <div class="subtitle">Listagem oficial de leitores cadastrados e histórico de empréstimos</div>
            </div>
            <div class="meta">
              <div><strong>Data de Emissão:</strong> ${dateToday}</div>
              <div><strong>Total Listado:</strong> ${filteredLeitores.length} leitor(es)</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                ${ths.join('')}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="${visibleColsCount}" style="text-align: center; padding: 20px;">Nenhum leitor encontrado.</td></tr>`}
            </tbody>
          </table>
          <div class="summary">
            <div>Filtro aplicado: <strong>${statusLeitoresFilter === 'all' ? 'Todos os Status' : statusLeitoresFilter === 'ativos' ? 'Apenas Ativos' : 'Apenas Bloqueados'}</strong></div>
            <div>Documento gerado pelo sistema Biblioteca CEP</div>
          </div>
          <script>
            window.onload = function() {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  // Print/Export PDF function for Logs de Auditoria
  const handlePrintLogs = () => {
    if (!dataInicioLogs.trim() || !dataFimLogs.trim()) {
      toast({
        title: 'Informe a data desejada',
        description:
          'Por favor, selecione os campos "De" e "Até" com a data desejada antes de gerar o relatório.',
        variant: 'destructive',
      })
      return
    }

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast({
        title: 'Bloqueio de pop-up detectado',
        description: 'Permita pop-ups no seu navegador para imprimir ou gerar PDF.',
        variant: 'destructive',
      })
      return
    }

    const visibleColsCount = Object.values(colsLogs).filter(Boolean).length || 1

    const ths: string[] = []
    if (colsLogs.data_hora) ths.push('<th>Data / Hora</th>')
    if (colsLogs.operacao) ths.push('<th>Operação</th>')
    if (colsLogs.acervo) ths.push('<th>Acervo</th>')
    if (colsLogs.exemplar) ths.push('<th>Exemplar</th>')
    if (colsLogs.leitor) ths.push('<th>Leitor</th>')
    if (colsLogs.operador) ths.push('<th>Operador</th>')
    if (colsLogs.detalhes) ths.push('<th>Detalhes</th>')
    if (colsLogs.observacao) ths.push('<th>Observação</th>')

    const rowsHtml = filteredLogs
      .map((l) => {
        const tds: string[] = []
        const col = (
          l.colecao || (l.id_exemplar?.toUpperCase().startsWith('DIR-') ? 'diretoria' : 'geral')
        ).toLowerCase()
        const acervoBadgeHtml =
          col === 'diretoria'
            ? '<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; background-color: #fef3c7; color: #92400e; border: 1px solid #fde68a;">Rino Curti</span>'
            : '<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; background-color: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;">Cecília Braga</span>'

        if (colsLogs.data_hora) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace; white-space: nowrap;">${formatDateTime(l.data_hora)}</td>`,
          )
        }
        if (colsLogs.operacao) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${l.tipo_operacao}</td>`,
          )
        }
        if (colsLogs.acervo) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${acervoBadgeHtml}</td>`,
          )
        }
        if (colsLogs.exemplar) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${l.id_exemplar ? `${l.id_exemplar}` : '-'}</td>`,
          )
        }
        if (colsLogs.leitor) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${l.leitor?.nome_do_leitor || (l.id_leitor ? `#${l.id_leitor}` : '-')}</td>`,
          )
        }
        if (colsLogs.operador) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${l.usuario_sistema || 'Sistema'}</td>`,
          )
        }
        if (colsLogs.detalhes) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #475569;">${l.detalhes || '-'}</td>`,
          )
        }
        if (colsLogs.observacao) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #b91c1c; font-style: italic;">${l.observacao || '-'}</td>`,
          )
        }
        return `<tr>${tds.join('')}</tr>`
      })
      .join('')

    const dateToday = formatDate(new Date())

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Relatório de Logs e Auditoria - Biblioteca CEP</title>
          <style>
            @media print {
              @page { size: landscape; margin: 12mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 10px; margin-bottom: 15px; }
            .title { font-size: 18px; font-weight: bold; color: #065f46; margin: 0; }
            .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
            .meta { text-align: right; font-size: 11px; color: #64748b; }
            table { width: 100%; border-collapse: collapse; text-align: left; }
            th { background-color: #f8fafc; padding: 8px; border-bottom: 2px solid #cbd5e1; font-weight: 600; color: #475569; font-size: 11px; text-transform: uppercase; }
            .summary { margin-top: 15px; padding: 10px; background-color: #f1f5f9; border-radius: 6px; font-size: 11px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">Biblioteca CEP - Relatório de Auditoria (Logs)</h1>
              <div class="subtitle">Histórico cronológico de operações e eventos do sistema</div>
            </div>
            <div class="meta">
              <div><strong>Data de Emissão:</strong> ${dateToday}</div>
              <div><strong>Total de Registros:</strong> ${filteredLogs.length}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                ${ths.join('')}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="${visibleColsCount}" style="text-align: center; padding: 20px;">Nenhum registro de auditoria encontrado.</td></tr>`}
            </tbody>
          </table>
          <div class="summary">
            <div>Filtro de Operação: <strong>${tipoFiltroLogs === 'todos' ? 'Todos os tipos' : tipoFiltroLogs}</strong></div>
            <div>Documento gerado pelo sistema Biblioteca CEP</div>
          </div>
          <script>
            window.onload = function() { window.focus(); window.print(); };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  // Print/Export PDF function for Títulos e Exemplares
  const handlePrintTitulos = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast({
        title: 'Bloqueio de pop-up detectado',
        description: 'Permita pop-ups no seu navegador para imprimir ou gerar PDF.',
        variant: 'destructive',
      })
      return
    }

    const visibleColsCount = Object.values(colsTitulos).filter(Boolean).length || 1

    const ths: string[] = []
    if (colsTitulos.codigo) ths.push('<th>Código</th>')
    if (colsTitulos.titulo) ths.push('<th>Título</th>')
    if (colsTitulos.acervo) ths.push('<th>Acervo</th>')
    if (colsTitulos.autor) ths.push('<th>Autor</th>')
    if (colsTitulos.categoria) ths.push('<th>Categoria</th>')
    if (colsTitulos.editora) ths.push('<th>Editora</th>')
    if (colsTitulos.total_exemplares) ths.push('<th style="text-align: center;">Exemplares</th>')
    if (colsTitulos.detalhes_exemplares) ths.push('<th>Códigos / Status</th>')

    const rowsHtml = filteredTitulos
      .map((t) => {
        const exemplares = t.exemplar || []
        const exemplaresFormatted = exemplares.length
          ? exemplares
              .map(
                (e: any) =>
                  `<span style="display: inline-block; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 3px; padding: 1px 5px; margin: 2px; font-family: monospace; font-size: 10px;">${e.id_exemplar} (${e.status})</span>`,
              )
              .join(' ')
          : '<em style="color: #94a3b8;">Nenhum</em>'

        const col = (
          t.colecao || (t.id_titulo?.toUpperCase().startsWith('DIR-') ? 'diretoria' : 'geral')
        ).toLowerCase()
        const acervoBadgeHtml =
          col === 'diretoria'
            ? '<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; background-color: #fef3c7; color: #92400e; border: 1px solid #fde68a;">Rino Curti</span>'
            : '<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; background-color: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;">Cecília Braga</span>'

        const tds: string[] = []
        if (colsTitulos.codigo) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${t.id_titulo}</td>`,
          )
        }
        if (colsTitulos.titulo) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${t.titulo_de_livro}</td>`,
          )
        }
        if (colsTitulos.acervo) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${acervoBadgeHtml}</td>`,
          )
        }
        if (colsTitulos.autor) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${t.autor || '-'}</td>`,
          )
        }
        if (colsTitulos.categoria) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${t.categoria || '-'}</td>`,
          )
        }
        if (colsTitulos.editora) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${t.editora || '-'}</td>`,
          )
        }
        if (colsTitulos.total_exemplares) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${exemplares.length}</td>`,
          )
        }
        if (colsTitulos.detalhes_exemplares) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${exemplaresFormatted}</td>`,
          )
        }
        return `<tr>${tds.join('')}</tr>`
      })
      .join('')

    // Tabela de resumo por categoria para impressão
    const categoryStatsRowsHtml = categoryStats
      .map(
        ([cat, data]) => `
      <tr>
        <td style="padding: 4px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${cat}</td>
        <td style="padding: 4px 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${data.titulos}</td>
        <td style="padding: 4px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: #065f46;">${data.exemplares}</td>
      </tr>
    `,
      )
      .join('')

    const dateToday = formatDate(new Date())

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Relatório de Títulos e Exemplares - Biblioteca CEP</title>
          <style>
            @media print {
              @page { size: landscape; margin: 12mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 10px; margin-bottom: 15px; }
            .title { font-size: 18px; font-weight: bold; color: #065f46; margin: 0; }
            .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
            .meta { text-align: right; font-size: 11px; color: #64748b; }
            table { width: 100%; border-collapse: collapse; text-align: left; margin-bottom: 15px; }
            th { background-color: #f8fafc; padding: 8px; border-bottom: 2px solid #cbd5e1; font-weight: 600; color: #475569; font-size: 11px; text-transform: uppercase; }
            .summary-box { display: flex; gap: 20px; margin-top: 15px; page-break-inside: avoid; }
            .category-card { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background-color: #f8fafc; }
            .category-card h3 { margin: 0 0 8px 0; font-size: 13px; color: #065f46; }
            .footer { margin-top: 15px; padding: 10px; background-color: #f1f5f9; border-radius: 6px; font-size: 11px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">Biblioteca CEP - Relatório de Títulos e Exemplares</h1>
              <div class="subtitle">Catálogo de obras registradas, total de exemplares por categoria e detalhamento físico</div>
            </div>
            <div class="meta">
              <div><strong>Data de Emissão:</strong> ${dateToday}</div>
              <div><strong>Total de Títulos:</strong> ${filteredTitulos.length} | <strong>Total de Exemplares:</strong> ${totalExemplaresGeral}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                ${ths.join('')}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="${visibleColsCount}" style="text-align: center; padding: 20px;">Nenhum título encontrado.</td></tr>`}
            </tbody>
          </table>

          <!-- Total de Exemplares por Categoria -->
          <div class="category-card">
            <h3>Total de Exemplares por Categoria</h3>
            <table style="margin-bottom: 0;">
              <thead>
                <tr>
                  <th style="font-size: 10px;">Categoria</th>
                  <th style="text-align: center; font-size: 10px;">Qtd. Títulos</th>
                  <th style="text-align: center; font-size: 10px;">Total de Exemplares</th>
                </tr>
              </thead>
              <tbody>
                ${categoryStatsRowsHtml || '<tr><td colspan="3" style="text-align: center; padding: 10px;">Sem dados de categoria.</td></tr>'}
                <tr style="background-color: #f1f5f9; font-weight: bold;">
                  <td style="padding: 6px 8px; border-top: 2px solid #cbd5e1;">TOTAL CONSOLIDADO</td>
                  <td style="padding: 6px 8px; border-top: 2px solid #cbd5e1; text-align: center;">${filteredTitulos.length} títulos</td>
                  <td style="padding: 6px 8px; border-top: 2px solid #cbd5e1; text-align: center; color: #065f46;">${totalExemplaresGeral} exemplares</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="footer">
            <div>Filtro Categoria: <strong>${categoryTitulosFilter === 'all' ? 'Todas' : categoryTitulosFilter}</strong></div>
            <div>Documento gerado pelo sistema Biblioteca CEP</div>
          </div>
          <script>
            window.onload = function() { window.focus(); window.print(); };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  // Print/Export PDF function for Usuários
  const handlePrintUsuarios = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast({
        title: 'Bloqueio de pop-up detectado',
        description: 'Permita pop-ups no seu navegador para imprimir ou gerar PDF.',
        variant: 'destructive',
      })
      return
    }

    const visibleColsCount = Object.values(colsUsuarios).filter(Boolean).length || 1

    const ths: string[] = []
    if (colsUsuarios.nome) ths.push('<th>Nome</th>')
    if (colsUsuarios.email) ths.push('<th>E-mail</th>')
    if (colsUsuarios.telefone) ths.push('<th>Telefone</th>')
    if (colsUsuarios.papel) ths.push('<th>Papel</th>')
    if (colsUsuarios.status) ths.push('<th>Status</th>')
    if (colsUsuarios.data_cadastro)
      ths.push('<th style="text-align: center;">Data de Cadastro</th>')

    const rowsHtml = filteredUsuarios
      .map((u) => {
        const tds: string[] = []
        if (colsUsuarios.nome) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${u.full_name || u.nome || 'Sem nome'}</td>`,
          )
        }
        if (colsUsuarios.email) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${u.email || '-'}</td>`,
          )
        }
        if (colsUsuarios.telefone) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${u.phone || u.telefone ? formatPhone(u.phone || u.telefone) : '-'}</td>`,
          )
        }
        if (colsUsuarios.papel) {
          tds.push(`
            <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">
              <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; background-color: ${u.role === 'admin' ? '#f3e8ff; color: #6b21a8;' : '#e0e7ff; color: #3730a3;'}">
                ${u.role === 'admin' ? 'Administrador' : 'Operador'}
              </span>
            </td>
          `)
        }
        if (colsUsuarios.status) {
          tds.push(`
            <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">
              <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; background-color: ${u.status === 'inativo' || u.bloqueado ? '#fee2e2; color: #991b1b;' : '#dcfce7; color: #166534;'}">
                ${u.status === 'inativo' || u.bloqueado ? 'Inativo' : 'Ativo'}
              </span>
            </td>
          `)
        }
        if (colsUsuarios.data_cadastro) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace; text-align: center;">${formatDate(u.created_at)}</td>`,
          )
        }
        return `<tr>${tds.join('')}</tr>`
      })
      .join('')

    const dateToday = formatDate(new Date())

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Relatório de Usuários - Biblioteca CEP</title>
          <style>
            @media print {
              @page { size: portrait; margin: 12mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 10px; margin-bottom: 15px; }
            .title { font-size: 18px; font-weight: bold; color: #065f46; margin: 0; }
            .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
            .meta { text-align: right; font-size: 11px; color: #64748b; }
            table { width: 100%; border-collapse: collapse; text-align: left; }
            th { background-color: #f8fafc; padding: 8px; border-bottom: 2px solid #cbd5e1; font-weight: 600; color: #475569; font-size: 11px; text-transform: uppercase; }
            .summary { margin-top: 15px; padding: 10px; background-color: #f1f5f9; border-radius: 6px; font-size: 11px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">Biblioteca CEP - Relatório de Usuários</h1>
              <div class="subtitle">Listagem de operadores e administradores do sistema</div>
            </div>
            <div class="meta">
              <div><strong>Data de Emissão:</strong> ${dateToday}</div>
              <div><strong>Total de Usuários:</strong> ${filteredUsuarios.length}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                ${ths.join('')}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="${visibleColsCount}" style="text-align: center; padding: 20px;">Nenhum usuário encontrado.</td></tr>`}
            </tbody>
          </table>
          <div class="summary">
            <div>Filtro de Papel: <strong>${roleUsuariosFilter === 'all' ? 'Todos os Papéis' : roleUsuariosFilter === 'admin' ? 'Administrador' : 'Operador'}</strong></div>
            <div>Documento gerado pelo sistema Biblioteca CEP</div>
          </div>
          <script>
            window.onload = function() { window.focus(); window.print(); };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  // Export logs CSV
  const handleExportLogs = () => {
    if (!dataInicioLogs.trim() || !dataFimLogs.trim()) {
      toast({
        title: 'Informe a data desejada',
        description:
          'Por favor, selecione os campos "De" e "Até" com a data desejada antes de exportar o relatório.',
        variant: 'destructive',
      })
      return
    }

    const exportData = filteredLogs.map((l) => {
      const col = (
        l.colecao || (l.id_exemplar?.toUpperCase().startsWith('DIR-') ? 'diretoria' : 'geral')
      ).toLowerCase()
      const acervoText = col === 'diretoria' ? 'Biblioteca Rino Curti' : 'Biblioteca Cecília Braga'
      return {
        Data_Hora: formatDateTime(l.data_hora),
        Operação: l.tipo_operacao,
        Acervo: acervoText,
        Exemplar: l.id_exemplar || '-',
        Leitor: l.leitor?.nome_do_leitor || (l.id_leitor ? `#${String(l.id_leitor)}` : '-'),
        Operador: l.usuario_sistema || 'Sistema',
        Detalhes: l.detalhes || '-',
        Observação: l.observacao || '-',
      }
    })
    exportCSV(exportData, 'relatorio_logs')
  }

  // Export titulos CSV
  const handleExportTitulos = () => {
    const exportData: any[] = []
    filteredTitulos.forEach((t) => {
      const exemplares = t.exemplar || []
      const codigos = exemplares.map((e: any) => e.id_exemplar).join(' | ')
      const col = (
        t.colecao || (t.id_titulo?.toUpperCase().startsWith('DIR-') ? 'diretoria' : 'geral')
      ).toLowerCase()
      const acervoText = col === 'diretoria' ? 'Biblioteca Rino Curti' : 'Biblioteca Cecília Braga'
      exportData.push({
        Codigo_Titulo: t.id_titulo,
        Titulo: t.titulo_de_livro,
        Acervo: acervoText,
        Autor: t.autor,
        Categoria: t.categoria || '-',
        Editora: t.editora || '-',
        Total_Exemplares: exemplares.length,
        Codigos_Exemplares: codigos || 'Nenhum',
      })
    })
    exportCSV(exportData, 'relatorio_titulos_exemplares')
  }

  // Export usuarios CSV
  const handleExportUsuarios = () => {
    const exportData = filteredUsuarios.map((u) => ({
      Nome: u.full_name || u.nome || '-',
      Email: u.email || '-',
      Telefone: u.phone || u.telefone || '-',
      Papel: u.role === 'admin' ? 'Administrador' : 'Operador',
      Status: u.status === 'inativo' || u.bloqueado ? 'Inativo' : 'Ativo',
      Data_Cadastro: formatDate(u.created_at),
    }))
    exportCSV(exportData, 'relatorio_usuarios')
  }

  // Export movimentacoes CSV
  const handleExportMovimentacoes = () => {
    if (!dataInicioMov.trim() || !dataFimMov.trim()) {
      toast({
        title: 'Informe a data desejada',
        description:
          'Por favor, selecione os campos "De" e "Até" com a data desejada antes de exportar o relatório.',
        variant: 'destructive',
      })
      return
    }

    const exportData = filteredMovimentacoes.map((m) => {
      const col = (
        m.colecao || (m.id_exemplar?.toUpperCase().startsWith('DIR-') ? 'diretoria' : 'geral')
      ).toLowerCase()
      const acervoText = col === 'diretoria' ? 'Biblioteca Rino Curti' : 'Biblioteca Cecília Braga'
      return {
        Tipo: m.tipo_registro,
        Data_Evento: formatDate(m.data_evento),
        Titulo_Livro: m.titulo_livro,
        Acervo: acervoText,
        Exemplar: m.id_exemplar || '-',
        Leitor: m.leitor_nome,
        Status: m.status,
        Detalhes: m.detalhes,
      }
    })
    exportCSV(exportData, 'relatorio_movimentacoes')
  }

  // Print/Export PDF function for Movimentações
  const handlePrintMovimentacoes = () => {
    if (!dataInicioMov.trim() || !dataFimMov.trim()) {
      toast({
        title: 'Informe a data desejada',
        description:
          'Por favor, selecione os campos "De" e "Até" com a data desejada antes de gerar o relatório.',
        variant: 'destructive',
      })
      return
    }

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast({
        title: 'Bloqueio de pop-up detectado',
        description: 'Permita pop-ups no seu navegador para imprimir ou gerar PDF.',
        variant: 'destructive',
      })
      return
    }

    const visibleColsCount = Object.values(colsMovimentacoes).filter(Boolean).length || 1

    const ths: string[] = []
    if (colsMovimentacoes.tipo) ths.push('<th>Tipo</th>')
    if (colsMovimentacoes.data_evento) ths.push('<th>Data Evento</th>')
    if (colsMovimentacoes.titulo_livro) ths.push('<th>Livro / Título</th>')
    if (colsMovimentacoes.acervo) ths.push('<th>Acervo</th>')
    if (colsMovimentacoes.exemplar) ths.push('<th>Exemplar</th>')
    if (colsMovimentacoes.leitor) ths.push('<th>Leitor</th>')
    if (colsMovimentacoes.status) ths.push('<th>Status</th>')
    if (colsMovimentacoes.detalhes) ths.push('<th>Detalhes / Previsão</th>')

    const rowsHtml = filteredMovimentacoes
      .map((m) => {
        const tds: string[] = []
        const col = (
          m.colecao || (m.id_exemplar?.toUpperCase().startsWith('DIR-') ? 'diretoria' : 'geral')
        ).toLowerCase()
        const acervoBadgeHtml =
          col === 'diretoria'
            ? '<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; background-color: #f1f5f9; color: #92400e; border: 1px solid #fde68a;">Rino Curti</span>'
            : '<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; background-color: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;">Cecília Braga</span>'

        if (colsMovimentacoes.tipo) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${m.tipo_registro}</td>`,
          )
        }
        if (colsMovimentacoes.data_evento) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${formatDate(m.data_evento)}</td>`,
          )
        }
        if (colsMovimentacoes.titulo_livro) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${m.titulo_livro}</td>`,
          )
        }
        if (colsMovimentacoes.acervo) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${acervoBadgeHtml}</td>`,
          )
        }
        if (colsMovimentacoes.exemplar) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${m.id_exemplar || '-'}</td>`,
          )
        }
        if (colsMovimentacoes.leitor) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${m.leitor_nome}</td>`,
          )
        }
        if (colsMovimentacoes.status) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${m.status}</td>`,
          )
        }
        if (colsMovimentacoes.detalhes) {
          tds.push(
            `<td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">${m.detalhes}</td>`,
          )
        }
        return `<tr>${tds.join('')}</tr>`
      })
      .join('')

    const dateToday = formatDate(new Date())

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Relatório de Movimentações - Biblioteca CEP</title>
          <style>
            @media print {
              @page { size: landscape; margin: 12mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 10px; margin-bottom: 15px; }
            .title { font-size: 18px; font-weight: bold; color: #065f46; margin: 0; }
            .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
            .meta { text-align: right; font-size: 11px; color: #64748b; }
            table { width: 100%; border-collapse: collapse; text-align: left; }
            th { background-color: #f8fafc; padding: 8px; border-bottom: 2px solid #cbd5e1; font-weight: 600; color: #475569; font-size: 11px; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">Biblioteca CEP - Relatório de Movimentações</h1>
              <div class="subtitle">Empréstimos e Reservas registrados por período (dd/mm/yy)</div>
            </div>
            <div class="meta">
              <div><strong>Data de Emissão:</strong> ${dateToday}</div>
              <div><strong>Total de Registros:</strong> ${filteredMovimentacoes.length}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                ${ths.join('')}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="${visibleColsCount}" style="text-align: center; padding: 20px;">Nenhuma movimentação encontrada.</td></tr>`}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.focus(); window.print(); };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const getTipoBadge = (tipo: string) => {
    const t = tipo.toLowerCase()
    if (t.includes('inclusão de livro') || t.includes('inclusao de livro')) {
      return (
        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-semibold">
          Inclusão de Livro
        </Badge>
      )
    }
    if (t.includes('alteração de livro') || t.includes('alteracao de livro')) {
      return (
        <Badge className="bg-sky-100 text-sky-800 border-sky-200 font-semibold">
          Alteração de Livro
        </Badge>
      )
    }
    if (t.includes('exclusão de livro') || t.includes('exclusao de livro')) {
      return (
        <Badge className="bg-rose-100 text-rose-900 border-rose-300 font-bold">
          Exclusão de Livro
        </Badge>
      )
    }
    if (t.includes('inclusão de exemplar') || t.includes('inclusao de exemplar')) {
      return (
        <Badge className="bg-teal-100 text-teal-800 border-teal-200 font-semibold">
          Inclusão de Exemplar
        </Badge>
      )
    }
    if (t.includes('alteração de exemplar') || t.includes('alteracao de exemplar')) {
      return (
        <Badge className="bg-cyan-100 text-cyan-800 border-cyan-200 font-semibold">
          Alteração de Exemplar
        </Badge>
      )
    }
    if (t.includes('exclusão de exemplar') || t.includes('exclusao de exemplar')) {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200 font-semibold">
          Exclusão de Exemplar
        </Badge>
      )
    }
    if (t.includes('empréstimo') || t.includes('emprestimo')) {
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Empréstimo</Badge>
    }
    if (t.includes('devolução') || t.includes('devolucao')) {
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Devolução</Badge>
    }
    if (t.includes('renovação') || t.includes('renovacao')) {
      return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Renovação</Badge>
    }
    if (t.includes('reserva')) {
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200">{tipo}</Badge>
    }
    if (t.includes('manutenção') || t.includes('manutencao')) {
      return <Badge className="bg-rose-100 text-rose-800 border-rose-200">{tipo}</Badge>
    }
    if (t.includes('importação') || t.includes('importacao')) {
      return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">{tipo}</Badge>
    }
    return <Badge variant="outline">{tipo}</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <History className="h-8 w-8 text-primary" />
            Relatórios e Histórico
          </h1>
          <p className="text-muted-foreground mt-1">
            Auditoria completa, relatórios de leitores, títulos, usuários e movimentações do acervo.
          </p>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(val: any) => setActiveTab(val)}
        className="w-full space-y-6"
      >
        <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 w-full h-auto p-1 bg-muted/60">
          <TabsTrigger value="logs" className="py-2.5 flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span>Auditoria (Logs)</span>
          </TabsTrigger>
          <TabsTrigger value="leitores" className="py-2.5 flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>Leitores</span>
          </TabsTrigger>
          <TabsTrigger value="titulos" className="py-2.5 flex items-center gap-2">
            <Layers className="h-4 w-4" />
            <span>Títulos e Exemplares</span>
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="py-2.5 flex items-center gap-2">
            <UsersIcon className="h-4 w-4" />
            <span>Usuários</span>
          </TabsTrigger>
          <TabsTrigger value="movimentacoes" className="py-2.5 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>Movimentações</span>
          </TabsTrigger>
        </TabsList>

        {/* ----------------- ABA NOVIDADE: RELATÓRIO DE LEITORES ----------------- */}
        <TabsContent value="leitores" className="space-y-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    Relatório de Leitores Cadastrados
                  </CardTitle>
                  <CardDescription>
                    Listagem consolidada contendo Nome, E-mail, Telefone, Status de bloqueio, Data
                    de Cadastro e estatísticas de empréstimos (dd/mm/yy).
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <SlidersHorizontal className="h-4 w-4" />
                        Colunas na Impressão
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3" align="end">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-foreground border-b pb-1 flex items-center justify-between">
                          <span>Colunas do Relatório</span>
                          <span className="text-[10px] text-muted-foreground">Impressão/PDF</span>
                        </div>
                        <div className="space-y-1.5 pt-1">
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsLeitores.id}
                              onCheckedChange={(v) =>
                                setColsLeitores((prev) => ({ ...prev, id: !!v }))
                              }
                            />
                            <span>ID do Leitor</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsLeitores.nome}
                              onCheckedChange={(v) =>
                                setColsLeitores((prev) => ({ ...prev, nome: !!v }))
                              }
                            />
                            <span>Nome</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsLeitores.email}
                              onCheckedChange={(v) =>
                                setColsLeitores((prev) => ({ ...prev, email: !!v }))
                              }
                            />
                            <span>E-mail</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsLeitores.telefone}
                              onCheckedChange={(v) =>
                                setColsLeitores((prev) => ({ ...prev, telefone: !!v }))
                              }
                            />
                            <span>Telefone</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsLeitores.status}
                              onCheckedChange={(v) =>
                                setColsLeitores((prev) => ({ ...prev, status: !!v }))
                              }
                            />
                            <span>Status (Ativo/Bloqueado)</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsLeitores.emprestimos}
                              onCheckedChange={(v) =>
                                setColsLeitores((prev) => ({ ...prev, emprestimos: !!v }))
                              }
                            />
                            <span>Empréstimos</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsLeitores.data_cadastro}
                              onCheckedChange={(v) =>
                                setColsLeitores((prev) => ({ ...prev, data_cadastro: !!v }))
                              }
                            />
                            <span>Data de Cadastro</span>
                          </label>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportLeitores}
                    className="gap-1.5"
                  >
                    <Download className="h-4 w-4" />
                    Exportar CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrintLeitores}
                    className="gap-1.5"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir / PDF
                  </Button>
                </div>
              </div>

              {/* Filtros Leitores */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, email ou telefone..."
                    value={searchLeitores}
                    onChange={(e) => setSearchLeitores(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <Select value={statusLeitoresFilter} onValueChange={setStatusLeitoresFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="ativos">Apenas Ativos</SelectItem>
                    <SelectItem value="bloqueados">Apenas Bloqueados</SelectItem>
                  </SelectContent>
                </Select>

                <div className="text-sm text-muted-foreground flex items-center justify-end">
                  Total de leitores:{' '}
                  <strong className="ml-1 text-foreground">{filteredLeitores.length}</strong>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {loadingLeitores ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((n) => (
                    <Skeleton key={n} className="h-14 w-full" />
                  ))}
                </div>
              ) : filteredLeitores.length === 0 ? (
                <div className="text-center py-12 border rounded-lg border-dashed bg-muted/20">
                  <User className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-base font-medium text-foreground">Nenhum leitor encontrado</p>
                  <p className="text-sm text-muted-foreground">
                    Tente ajustar o termo de pesquisa ou os filtros aplicados.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-border/80 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>E-mail</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Empréstimos</TableHead>
                        <TableHead>Data de Cadastro</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLeitores.map((leitorItem) => (
                        <TableRow key={leitorItem.id_leitor} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            #{leitorItem.id_leitor}
                          </TableCell>
                          <TableCell className="font-semibold text-foreground">
                            {leitorItem.nome_do_leitor || 'Sem nome'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{leitorItem.email || '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>
                                {leitorItem.telefone ? formatPhone(leitorItem.telefone) : '-'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {leitorItem.bloqueado ? (
                              <Badge variant="destructive" className="gap-1">
                                <Lock className="h-3 w-3" />
                                Bloqueado
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                                Ativo
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 text-xs">
                              <span className="flex items-center gap-1 text-slate-700 font-medium">
                                <Repeat className="h-3 w-3 text-emerald-600" />
                                <span>{leitorItem.emprestimos_ativos || 0} ativo(s)</span>
                                <span className="text-muted-foreground text-[11px]">
                                  / {leitorItem.total_emprestimos || 0} total
                                </span>
                              </span>
                              {leitorItem.emprestimos_atrasados > 0 && (
                                <span className="flex items-center gap-1 text-rose-600 font-medium text-[11px]">
                                  <AlertTriangle className="h-3 w-3" />
                                  {leitorItem.emprestimos_atrasados} atrasado(s)
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {formatDate(leitorItem.data_cadastro || leitorItem.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------------- ABA 1: LOGS DE AUDITORIA ----------------- */}
        <TabsContent value="logs" className="space-y-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    Histórico Geral de Operações
                  </CardTitle>
                  <CardDescription>
                    Visualização cronológica com operador responsável e data no formato padrão
                    dd/mm/yy.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <SlidersHorizontal className="h-4 w-4" />
                        Colunas na Impressão
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3" align="end">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-foreground border-b pb-1 flex items-center justify-between">
                          <span>Colunas do Relatório</span>
                          <span className="text-[10px] text-muted-foreground">Impressão/PDF</span>
                        </div>
                        <div className="space-y-1.5 pt-1">
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsLogs.data_hora}
                              onCheckedChange={(v) =>
                                setColsLogs((prev) => ({ ...prev, data_hora: !!v }))
                              }
                            />
                            <span>Data / Hora</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsLogs.operacao}
                              onCheckedChange={(v) =>
                                setColsLogs((prev) => ({ ...prev, operacao: !!v }))
                              }
                            />
                            <span>Operação</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsLogs.acervo}
                              onCheckedChange={(v) =>
                                setColsLogs((prev) => ({ ...prev, acervo: !!v }))
                              }
                            />
                            <span>Acervo</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsLogs.exemplar}
                              onCheckedChange={(v) =>
                                setColsLogs((prev) => ({ ...prev, exemplar: !!v }))
                              }
                            />
                            <span>Exemplar</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsLogs.leitor}
                              onCheckedChange={(v) =>
                                setColsLogs((prev) => ({ ...prev, leitor: !!v }))
                              }
                            />
                            <span>Leitor</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsLogs.operador}
                              onCheckedChange={(v) =>
                                setColsLogs((prev) => ({ ...prev, operador: !!v }))
                              }
                            />
                            <span>Operador</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsLogs.detalhes}
                              onCheckedChange={(v) =>
                                setColsLogs((prev) => ({ ...prev, detalhes: !!v }))
                              }
                            />
                            <span>Detalhes</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsLogs.observacao}
                              onCheckedChange={(v) =>
                                setColsLogs((prev) => ({ ...prev, observacao: !!v }))
                              }
                            />
                            <span>Observação</span>
                          </label>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportLogs}
                    className="gap-1.5"
                  >
                    <Download className="h-4 w-4" />
                    Exportar CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePrintLogs} className="gap-1.5">
                    <Printer className="h-4 w-4" />
                    Imprimir / PDF
                  </Button>
                  {isAdmin && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExecuteAuditJobDirect}
                        disabled={runningJob}
                        className="gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                        title="Disparar fluxo completo agora: gerar PDF, enviar por e-mail e expurgar a base"
                      >
                        <Mail className="h-4 w-4 text-emerald-600" />
                        {runningJob ? 'Processando Job...' : 'Disparar Envio & Expurgo Mensal'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setIsCleanModalOpen(true)}
                        className="gap-1.5"
                      >
                        <Trash2 className="h-4 w-4" />
                        Limpar Registros
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Banner de Status do Job Automático e Atalho para Últimos N Dias */}
              {auditConfig && (
                <div className="p-3 bg-slate-50 dark:bg-muted/30 border border-slate-200 dark:border-border rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${auditConfig.ativo ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}
                    />
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                        <span>Envio Automático & Expurgo:</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] py-0 px-1.5 ${
                            auditConfig.ativo
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : 'border-slate-300 bg-slate-100 text-slate-600'
                          }`}
                        >
                          {auditConfig.ativo
                            ? `Ativo (Todo dia ${auditConfig.diaEnvio} às ${auditConfig.horaEnvio})`
                            : 'Inativo no momento'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Período do relatório:{' '}
                        <strong>últimos {auditConfig.diasRetroativos} dias</strong> • Retenção de
                        expurgo: <strong>{auditConfig.diasRetencao} dias</strong> • Destinatários:{' '}
                        <em>{auditConfig.destinatarios || 'nenhum configurado'}</em>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleApplyNDaysFilter}
                      className="h-7 text-xs gap-1 border-slate-300 hover:bg-slate-100"
                      title={`Filtrar tabela para os últimos ${auditConfig.diasRetroativos} dias conforme regra do job`}
                    >
                      <Calendar className="w-3 h-3 text-emerald-600" />
                      Filtrar Últimos {auditConfig.diasRetroativos} Dias
                    </Button>
                  </div>
                </div>
              )}

              {/* Atalhos Rápidos & Filtros da aba de logs */}
              <div className="space-y-3 pt-4">
                {/* Barra de Atalhos Rápidos */}
                <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-50 dark:bg-muted/40 rounded-lg border border-slate-200 dark:border-border text-xs">
                  <span className="font-semibold text-slate-600 dark:text-muted-foreground flex items-center gap-1.5 pl-1">
                    <History className="w-3.5 h-3.5 text-primary" />
                    Atalhos Rápidos:
                  </span>

                  <Button
                    type="button"
                    size="sm"
                    variant={tipoFiltroLogs === 'todos' ? 'default' : 'outline'}
                    onClick={() => handleTipoLogsChange('todos')}
                    className="h-7 text-xs px-2.5"
                  >
                    Todos os Registros
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant={
                      tipoFiltroLogs === 'manutencao_todas' ||
                      tipoFiltroLogs === 'Entrada em Manutenção' ||
                      tipoFiltroLogs === 'Saída de Manutenção'
                        ? 'destructive'
                        : 'outline'
                    }
                    onClick={() => handleTipoLogsChange('manutencao_todas')}
                    className={`h-7 text-xs px-2.5 gap-1.5 font-medium ${
                      tipoFiltroLogs === 'manutencao_todas'
                        ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                        : 'border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800'
                    }`}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    Entradas / Saídas de Manutenção
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant={tipoFiltroLogs === 'Empréstimo' ? 'default' : 'outline'}
                    onClick={() => handleTipoLogsChange('Empréstimo')}
                    className="h-7 text-xs px-2.5"
                  >
                    Empréstimos
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant={tipoFiltroLogs === 'Devolução' ? 'default' : 'outline'}
                    onClick={() => handleTipoLogsChange('Devolução')}
                    className="h-7 text-xs px-2.5"
                  >
                    Devoluções
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant={tipoFiltroLogs === 'acervo_geral' ? 'default' : 'outline'}
                    onClick={() => handleTipoLogsChange('acervo_geral')}
                    className="h-7 text-xs px-2.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 font-medium"
                  >
                    📖 Ações no Acervo
                  </Button>

                  {(tipoFiltroLogs !== 'todos' || searchLogs || dataInicioLogs || dataFimLogs) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleResetLogsFilter}
                      className="h-7 text-xs px-2 ml-auto text-slate-600 hover:text-slate-900 gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Voltar à visão completa
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar nos logs..."
                      value={searchLogs}
                      onChange={(e) => setSearchLogs(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  <Select
                    value={colecaoLogsFilter}
                    onValueChange={(val: any) => setColecaoLogsFilter(val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Acervo: Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Acervo: Todos</SelectItem>
                      <SelectItem value="geral">Acervo Geral</SelectItem>
                      <SelectItem value="diretoria">Acervo Diretoria</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={tipoFiltroLogs} onValueChange={handleTipoLogsChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tipo de Operação" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os tipos de operações</SelectItem>
                      <SelectItem value="acervo_geral" className="font-semibold text-emerald-700">
                        📚 Todas as Ações de Acervo (Títulos e Exemplares)
                      </SelectItem>
                      <SelectItem value="Inclusão de Livro">
                        📖 Inclusão de Livro (Título)
                      </SelectItem>
                      <SelectItem value="Alteração de Livro">
                        ✏️ Alteração de Livro (Título)
                      </SelectItem>
                      <SelectItem value="Exclusão de Livro">
                        🗑️ Exclusão de Livro (Título)
                      </SelectItem>
                      <SelectItem value="Inclusão de Exemplar">➕ Inclusão de Exemplar</SelectItem>
                      <SelectItem value="Alteração de Exemplar">
                        🔄 Alteração de Exemplar
                      </SelectItem>
                      <SelectItem value="Exclusão de Exemplar">❌ Exclusão de Exemplar</SelectItem>
                      <SelectItem value="manutencao_todas" className="font-semibold text-rose-700">
                        🔧 Todas as Manutenções (Entradas e Saídas)
                      </SelectItem>
                      <SelectItem value="Entrada em Manutenção">Entrada em Manutenção</SelectItem>
                      <SelectItem value="Saída de Manutenção">Saída de Manutenção</SelectItem>
                      <SelectItem value="Empréstimo">Empréstimos</SelectItem>
                      <SelectItem value="Devolução">Devoluções</SelectItem>
                      <SelectItem value="Renovação">Renovações</SelectItem>
                      <SelectItem value="Reserva Criada">Reserva Criada</SelectItem>
                      <SelectItem value="Reserva Cancelada">Reserva Cancelada</SelectItem>
                      <SelectItem value="Reserva Atendida">Reserva Atendida</SelectItem>
                      <SelectItem value="Baixa / Perdido">Baixa / Perdido</SelectItem>
                      <SelectItem value="Importação CSV Acervo">Importação CSV Acervo</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium shrink-0">De:</span>
                    <DatePickerBR
                      value={dataInicioLogs}
                      onChange={setDataInicioLogs}
                      placeholder="dd/mm/aaaa"
                      className="flex-1"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium shrink-0">Até:</span>
                    <DatePickerBR
                      value={dataFimLogs}
                      onChange={setDataFimLogs}
                      placeholder="dd/mm/aaaa"
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleFilterLogs}
                      className="h-9 px-3 shrink-0"
                    >
                      Filtrar
                    </Button>
                  </div>
                </div>

                {/* Banner de status / filtro ativo se filtrando por manutenção */}
                {(tipoFiltroLogs === 'manutencao_todas' ||
                  tipoFiltroLogs === 'Entrada em Manutenção' ||
                  tipoFiltroLogs === 'Saída de Manutenção') && (
                  <div className="p-2.5 px-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-xs text-rose-900">
                    <div className="flex items-center gap-2 font-medium">
                      <Wrench className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>
                        Exibindo apenas registros de <strong>Manutenção de Exemplares</strong>{' '}
                        (Entradas e Saídas).
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleResetLogsFilter}
                      className="h-6 text-xs text-rose-800 hover:text-rose-900 hover:bg-rose-100 font-semibold"
                    >
                      Ver todos os registros
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent>
              {loadingLogs ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Skeleton key={n} className="h-20 w-full" />
                  ))}
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-12 border rounded-lg border-dashed bg-muted/20">
                  <History className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-base font-medium text-foreground">
                    Nenhum registro encontrado
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Ajuste os filtros ou o período selecionado para ver os logs.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id_log}
                      className="p-4 rounded-lg border border-border/70 bg-card hover:bg-muted/30 transition-colors shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-3"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {getTipoBadge(log.tipo_operacao)}
                          <span className="font-semibold text-sm text-foreground">
                            {log.id_exemplar
                              ? `Exemplar ${log.id_exemplar}`
                              : 'Registro do Sistema'}
                          </span>
                          {(() => {
                            const col = (
                              log.colecao ||
                              (log.id_exemplar?.toUpperCase().startsWith('DIR-')
                                ? 'diretoria'
                                : 'geral')
                            ).toLowerCase()
                            return col === 'diretoria' ? (
                              <Badge
                                variant="outline"
                                className="bg-amber-100 text-amber-900 border-amber-300 font-semibold text-xs"
                              >
                                Diretoria
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-slate-100 text-slate-700 border-slate-300 font-medium text-xs"
                              >
                                Geral
                              </Badge>
                            )
                          })()}
                          {log.leitor?.nome_do_leitor && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 bg-muted px-2 py-0.5 rounded">
                              <User className="h-3 w-3" />
                              {log.leitor.nome_do_leitor}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{log.detalhes || '-'}</p>
                        {log.observacao && (
                          <div className="flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-400 bg-rose-50/80 dark:bg-rose-950/30 p-2 rounded border border-rose-200/60 dark:border-rose-900/50 mt-1">
                            <span className="font-semibold shrink-0">Observação / Motivo:</span>
                            <span className="italic">{log.observacao}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-row md:flex-col items-start md:items-end justify-between border-t md:border-t-0 pt-2 md:pt-0 border-border/40 gap-1 text-xs">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <User className="h-3.5 w-3.5 text-primary" />
                          <span>
                            Operador:{' '}
                            <strong className="text-primary font-semibold">
                              {log.usuario_sistema || 'Sistema'}
                            </strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{formatDateTime(log.data_hora)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------------- ABA 2: TÍTULOS E EXEMPLARES ----------------- */}
        <TabsContent value="titulos" className="space-y-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    Relatório de Títulos com Exemplares
                  </CardTitle>
                  <CardDescription>
                    Listagem consolidada de todas as obras cadastradas com totalizadores por
                    categoria e exemplares físicos vinculados.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <SlidersHorizontal className="h-4 w-4" />
                        Colunas na Impressão
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3" align="end">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-foreground border-b pb-1 flex items-center justify-between">
                          <span>Colunas do Relatório</span>
                          <span className="text-[10px] text-muted-foreground">Impressão/PDF</span>
                        </div>
                        <div className="space-y-1.5 pt-1">
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsTitulos.codigo}
                              onCheckedChange={(v) =>
                                setColsTitulos((prev) => ({ ...prev, codigo: !!v }))
                              }
                            />
                            <span>Código do Título</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsTitulos.titulo}
                              onCheckedChange={(v) =>
                                setColsTitulos((prev) => ({ ...prev, titulo: !!v }))
                              }
                            />
                            <span>Título do Livro</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsTitulos.acervo}
                              onCheckedChange={(v) =>
                                setColsTitulos((prev) => ({ ...prev, acervo: !!v }))
                              }
                            />
                            <span>Acervo</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsTitulos.autor}
                              onCheckedChange={(v) =>
                                setColsTitulos((prev) => ({ ...prev, autor: !!v }))
                              }
                            />
                            <span>Autor</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsTitulos.categoria}
                              onCheckedChange={(v) =>
                                setColsTitulos((prev) => ({ ...prev, categoria: !!v }))
                              }
                            />
                            <span>Categoria</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsTitulos.editora}
                              onCheckedChange={(v) =>
                                setColsTitulos((prev) => ({ ...prev, editora: !!v }))
                              }
                            />
                            <span>Editora</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsTitulos.total_exemplares}
                              onCheckedChange={(v) =>
                                setColsTitulos((prev) => ({ ...prev, total_exemplares: !!v }))
                              }
                            />
                            <span>Qtd. Exemplares</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsTitulos.detalhes_exemplares}
                              onCheckedChange={(v) =>
                                setColsTitulos((prev) => ({
                                  ...prev,
                                  detalhes_exemplares: !!v,
                                }))
                              }
                            />
                            <span>Códigos / Status</span>
                          </label>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportTitulos}
                    className="gap-1.5"
                  >
                    <Download className="h-4 w-4" />
                    Exportar CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrintTitulos}
                    className="gap-1.5"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir / PDF
                  </Button>
                </div>
              </div>

              {/* Filtros de Títulos (sem filtro de datas) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar título, autor ou exemplar..."
                    value={searchTitulos}
                    onChange={(e) => setSearchTitulos(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <Select
                  value={colecaoTitulosFilter}
                  onValueChange={(val: any) => setColecaoTitulosFilter(val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Acervo: Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Acervo: Todos</SelectItem>
                    <SelectItem value="geral">Acervo Geral</SelectItem>
                    <SelectItem value="diretoria">Acervo Diretoria</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={categoryTitulosFilter} onValueChange={setCategoryTitulosFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Categorias</SelectItem>
                    {categoriesList.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="text-sm text-muted-foreground flex items-center justify-end">
                  Total de títulos:{' '}
                  <strong className="ml-1 text-foreground">{filteredTitulos.length}</strong>
                </div>
              </div>

              {/* Bloco Total de Exemplares por Categoria */}
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <BarChart2 className="h-3.5 w-3.5 text-primary" />
                    Total de Exemplares por Categoria
                  </h3>
                  <div className="text-xs text-muted-foreground">
                    Total geral:{' '}
                    <strong className="text-primary font-bold">{totalExemplaresGeral}</strong>{' '}
                    exemplar(es) em{' '}
                    <strong className="text-foreground">{filteredTitulos.length}</strong> título(s)
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {categoryStats.map(([cat, data]) => (
                    <div
                      key={cat}
                      className="p-2.5 rounded-md border border-border/70 bg-muted/30 flex flex-col justify-between"
                    >
                      <span className="text-xs font-medium text-foreground truncate" title={cat}>
                        {cat}
                      </span>
                      <div className="flex items-baseline justify-between mt-1 pt-1 border-t border-border/40">
                        <span className="text-[11px] text-muted-foreground">
                          {data.titulos} {data.titulos === 1 ? 'título' : 'títulos'}
                        </span>
                        <Badge
                          variant="secondary"
                          className="font-bold text-xs bg-primary/10 text-primary border-primary/20"
                        >
                          {data.exemplares} {data.exemplares === 1 ? 'ex.' : 'exs.'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {loadingTitulos ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((n) => (
                    <Skeleton key={n} className="h-28 w-full" />
                  ))}
                </div>
              ) : filteredTitulos.length === 0 ? (
                <div className="text-center py-12 border rounded-lg border-dashed bg-muted/20">
                  <Book className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-base font-medium text-foreground">Nenhum título encontrado</p>
                  <p className="text-sm text-muted-foreground">
                    Tente alterar o termo de busca ou filtro de categoria.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredTitulos.map((titulo) => {
                    const exemplares = titulo.exemplar || []
                    return (
                      <div
                        key={titulo.id_titulo}
                        className="rounded-lg border border-border/80 bg-card p-4 shadow-sm space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-2 border-b border-border/40 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-base text-foreground">
                                {titulo.titulo_de_livro}
                              </span>
                              <Badge variant="outline" className="text-xs bg-muted font-mono">
                                {titulo.id_titulo}
                              </Badge>
                              {(() => {
                                const col = (
                                  titulo.colecao ||
                                  (titulo.id_titulo?.toUpperCase().startsWith('DIR-')
                                    ? 'diretoria'
                                    : 'geral')
                                ).toLowerCase()
                                return col === 'diretoria' ? (
                                  <Badge
                                    variant="outline"
                                    className="bg-amber-100 text-amber-900 border-amber-300 font-semibold text-xs"
                                  >
                                    Diretoria
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="bg-slate-100 text-slate-700 border-slate-300 font-medium text-xs"
                                  >
                                    Geral
                                  </Badge>
                                )
                              })()}
                              {!titulo.ativo && (
                                <Badge variant="secondary" className="text-xs">
                                  Inativo
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              Autor:{' '}
                              <span className="font-medium text-foreground">
                                {titulo.autor || 'Não informado'}
                              </span>
                              {titulo.editora && ` • Editora: ${titulo.editora}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {titulo.categoria && (
                              <Badge
                                variant="outline"
                                className="bg-muted/50 text-black border-border/80 font-normal select-none"
                              >
                                {titulo.categoria}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="font-semibold">
                              {exemplares.length} exemplar(es)
                            </Badge>
                          </div>
                        </div>

                        {/* Exemplares vinculados */}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Copy className="h-3.5 w-3.5" />
                            Exemplares Cadastrados ({exemplares.length}):
                          </p>
                          {exemplares.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">
                              Nenhum exemplar cadastrado para esta obra.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                              {exemplares.map((ex: any) => {
                                const statusColor =
                                  ex.status === 'Disponivel'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : ex.status === 'Emprestado'
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'

                                return (
                                  <div
                                    key={ex.id_exemplar}
                                    className="p-2.5 rounded border border-border/60 bg-muted/20 flex flex-col justify-between gap-1 text-xs"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-mono font-bold text-foreground">
                                        {ex.id_exemplar}
                                      </span>
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusColor}`}
                                      >
                                        {ex.status}
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-muted-foreground truncate">
                                      Local: {ex.localizacao || 'Padrão'}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------------- ABA 3: USUÁRIOS ----------------- */}
        <TabsContent value="usuarios" className="space-y-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <UsersIcon className="h-5 w-5 text-primary" />
                    Relatório de Usuários do Sistema
                  </CardTitle>
                  <CardDescription>
                    Listagem de todos os operadores e administradores cadastrados com data padrão
                    (dd/mm/yy).
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <SlidersHorizontal className="h-4 w-4" />
                        Colunas na Impressão
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3" align="end">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-foreground border-b pb-1 flex items-center justify-between">
                          <span>Colunas do Relatório</span>
                          <span className="text-[10px] text-muted-foreground">Impressão/PDF</span>
                        </div>
                        <div className="space-y-1.5 pt-1">
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsUsuarios.nome}
                              onCheckedChange={(v) =>
                                setColsUsuarios((prev) => ({ ...prev, nome: !!v }))
                              }
                            />
                            <span>Nome</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsUsuarios.email}
                              onCheckedChange={(v) =>
                                setColsUsuarios((prev) => ({ ...prev, email: !!v }))
                              }
                            />
                            <span>E-mail</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsUsuarios.telefone}
                              onCheckedChange={(v) =>
                                setColsUsuarios((prev) => ({ ...prev, telefone: !!v }))
                              }
                            />
                            <span>Telefone</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsUsuarios.papel}
                              onCheckedChange={(v) =>
                                setColsUsuarios((prev) => ({ ...prev, papel: !!v }))
                              }
                            />
                            <span>Papel</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsUsuarios.status}
                              onCheckedChange={(v) =>
                                setColsUsuarios((prev) => ({ ...prev, status: !!v }))
                              }
                            />
                            <span>Status</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsUsuarios.data_cadastro}
                              onCheckedChange={(v) =>
                                setColsUsuarios((prev) => ({ ...prev, data_cadastro: !!v }))
                              }
                            />
                            <span>Data de Cadastro</span>
                          </label>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportUsuarios}
                    className="gap-1.5"
                  >
                    <Download className="h-4 w-4" />
                    Exportar CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrintUsuarios}
                    className="gap-1.5"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir / PDF
                  </Button>
                </div>
              </div>

              {/* Filtros Usuários */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, email ou telefone..."
                    value={searchUsuarios}
                    onChange={(e) => setSearchUsuarios(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <Select value={roleUsuariosFilter} onValueChange={setRoleUsuariosFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por Papel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Papéis</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="operador">Operador</SelectItem>
                  </SelectContent>
                </Select>

                <div className="text-sm text-muted-foreground flex items-center justify-end">
                  Total de usuários:{' '}
                  <strong className="ml-1 text-foreground">{filteredUsuarios.length}</strong>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {loadingUsuarios ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((n) => (
                    <Skeleton key={n} className="h-14 w-full" />
                  ))}
                </div>
              ) : filteredUsuarios.length === 0 ? (
                <div className="text-center py-12 border rounded-lg border-dashed bg-muted/20">
                  <UsersIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-base font-medium text-foreground">Nenhum usuário encontrado</p>
                  <p className="text-sm text-muted-foreground">
                    Tente alterar os filtros de busca.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-border/80 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Papel</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data de Cadastro</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsuarios.map((userItem) => (
                        <TableRow key={userItem.id} className="hover:bg-muted/30">
                          <TableCell className="font-semibold text-foreground">
                            {userItem.full_name || userItem.nome || 'Sem nome'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{userItem.email || '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>
                                {userItem.phone || userItem.telefone
                                  ? formatPhone(userItem.phone || userItem.telefone)
                                  : '-'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {userItem.role === 'admin' ? (
                              <Badge className="bg-purple-100 text-purple-800 border-purple-200 gap-1">
                                <Shield className="h-3 w-3" />
                                Administrador
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-slate-100 text-slate-800">
                                Operador
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {userItem.status === 'inativo' || userItem.bloqueado ? (
                              <Badge variant="destructive">Inativo</Badge>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                                Ativo
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {formatDate(userItem.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------------- ABA 4: MOVIMENTAÇÕES POR DATA ----------------- */}
        <TabsContent value="movimentacoes" className="space-y-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Relatório de Movimentações por Período
                  </CardTitle>
                  <CardDescription>
                    Filtre empréstimos e reservas pelo intervalo de datas com exibição padronizada
                    (dd/mm/yy).
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <SlidersHorizontal className="h-4 w-4" />
                        Colunas na Impressão
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3" align="end">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-foreground border-b pb-1 flex items-center justify-between">
                          <span>Colunas do Relatório</span>
                          <span className="text-[10px] text-muted-foreground">Impressão/PDF</span>
                        </div>
                        <div className="space-y-1.5 pt-1">
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsMovimentacoes.tipo}
                              onCheckedChange={(v) =>
                                setColsMovimentacoes((prev) => ({ ...prev, tipo: !!v }))
                              }
                            />
                            <span>Tipo de Registro</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsMovimentacoes.data_evento}
                              onCheckedChange={(v) =>
                                setColsMovimentacoes((prev) => ({ ...prev, data_evento: !!v }))
                              }
                            />
                            <span>Data do Evento</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsMovimentacoes.titulo_livro}
                              onCheckedChange={(v) =>
                                setColsMovimentacoes((prev) => ({ ...prev, titulo_livro: !!v }))
                              }
                            />
                            <span>Livro / Título</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsMovimentacoes.acervo}
                              onCheckedChange={(v) =>
                                setColsMovimentacoes((prev) => ({ ...prev, acervo: !!v }))
                              }
                            />
                            <span>Acervo</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsMovimentacoes.exemplar}
                              onCheckedChange={(v) =>
                                setColsMovimentacoes((prev) => ({ ...prev, exemplar: !!v }))
                              }
                            />
                            <span>Exemplar</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsMovimentacoes.leitor}
                              onCheckedChange={(v) =>
                                setColsMovimentacoes((prev) => ({ ...prev, leitor: !!v }))
                              }
                            />
                            <span>Leitor</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsMovimentacoes.status}
                              onCheckedChange={(v) =>
                                setColsMovimentacoes((prev) => ({ ...prev, status: !!v }))
                              }
                            />
                            <span>Status</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground">
                            <Checkbox
                              checked={colsMovimentacoes.detalhes}
                              onCheckedChange={(v) =>
                                setColsMovimentacoes((prev) => ({ ...prev, detalhes: !!v }))
                              }
                            />
                            <span>Detalhes / Previsão</span>
                          </label>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportMovimentacoes}
                    className="gap-1.5"
                  >
                    <Download className="h-4 w-4" />
                    Exportar CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrintMovimentacoes}
                    className="gap-1.5"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir / PDF
                  </Button>
                </div>
              </div>

              {/* Filtros Movimentações */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar livro, leitor ou exemplar..."
                    value={searchMov}
                    onChange={(e) => setSearchMov(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <Select
                  value={colecaoMovFilter}
                  onValueChange={(val: any) => setColecaoMovFilter(val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Acervo: Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Acervo: Todos</SelectItem>
                    <SelectItem value="geral">Acervo Geral</SelectItem>
                    <SelectItem value="diretoria">Acervo Diretoria</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={tipoMovFilter} onValueChange={setTipoMovFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo de Movimentação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="Empréstimo">Apenas Empréstimos</SelectItem>
                    <SelectItem value="Reserva">Apenas Reservas</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium shrink-0">De:</span>
                  <DatePickerBR
                    value={dataInicioMov}
                    onChange={setDataInicioMov}
                    placeholder="dd/mm/aaaa"
                    className="flex-1"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium shrink-0">Até:</span>
                  <DatePickerBR
                    value={dataFimMov}
                    onChange={setDataFimMov}
                    placeholder="dd/mm/aaaa"
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleFilterMovimentacoes}
                    className="h-9 px-3 shrink-0"
                  >
                    Filtrar
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {loadingMovimentacoes ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Skeleton key={n} className="h-14 w-full" />
                  ))}
                </div>
              ) : filteredMovimentacoes.length === 0 ? (
                <div className="text-center py-12 border rounded-lg border-dashed bg-muted/20">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-base font-medium text-foreground">
                    Nenhuma movimentação encontrada
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Selecione outro período de datas ou limpe a pesquisa.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-border/80 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Acervo</TableHead>
                        <TableHead>Data do Evento</TableHead>
                        <TableHead>Livro / Título</TableHead>
                        <TableHead>Exemplar</TableHead>
                        <TableHead>Leitor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Detalhes / Previsão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMovimentacoes.map((item) => {
                        const col = (
                          item.colecao ||
                          (item.id_exemplar?.toUpperCase().startsWith('DIR-')
                            ? 'diretoria'
                            : 'geral')
                        ).toLowerCase()
                        return (
                          <TableRow key={item.id} className="hover:bg-muted/30">
                            <TableCell>
                              {item.tipo_registro === 'Empréstimo' ? (
                                <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                                  Empréstimo
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                                  Reserva
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {col === 'diretoria' ? (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-100 text-amber-900 border-amber-300 font-semibold text-xs"
                                >
                                  Diretoria
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-slate-100 text-slate-700 border-slate-300 font-medium text-xs"
                                >
                                  Geral
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs font-semibold text-foreground">
                              {formatDate(item.data_evento)}
                            </TableCell>
                            <TableCell className="font-medium text-foreground">
                              {item.titulo_livro}
                            </TableCell>
                            <TableCell>
                              {item.id_exemplar ? (
                                <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                                  {item.id_exemplar}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-foreground">{item.leitor_nome}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize text-xs">
                                {item.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {item.detalhes}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Limpeza de Logs */}
      <Dialog open={isCleanModalOpen} onOpenChange={setIsCleanModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Limpar Histórico e Logs
            </DialogTitle>
            <DialogDescription>
              Esta ação removerá permanentemente os registros de auditoria com base nos filtros
              selecionados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Remover registros mais antigos que:</Label>
              <Select value={cleanPeriod} onValueChange={setCleanPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Mais de 7 dias</SelectItem>
                  <SelectItem value="30">Mais de 30 dias</SelectItem>
                  <SelectItem value="60">Mais de 60 dias</SelectItem>
                  <SelectItem value="90">Mais de 90 dias</SelectItem>
                  <SelectItem value="180">Mais de 180 dias (6 meses)</SelectItem>
                  <SelectItem value="365">Mais de 365 dias (1 ano)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de operação:</Label>
              <Select value={cleanType} onValueChange={setCleanType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="Empréstimo">Empréstimo</SelectItem>
                  <SelectItem value="Devolução">Devolução</SelectItem>
                  <SelectItem value="Renovação">Renovação</SelectItem>
                  <SelectItem value="Reserva">Reserva</SelectItem>
                  <SelectItem value="Entrada em Manutenção">Entrada em Manutenção</SelectItem>
                  <SelectItem value="Saída de Manutenção">Saída de Manutenção</SelectItem>
                  <SelectItem value="Baixa / Perdido">Baixa / Perdido</SelectItem>
                  <SelectItem value="Importação CSV Acervo">Importação CSV Acervo</SelectItem>
                </SelectContent>{' '}
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsCleanModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleCleanLogs}
              disabled={isCleaning}
              className="gap-1.5"
            >
              {isCleaning ? 'Limpando...' : 'Confirmar Limpeza'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
