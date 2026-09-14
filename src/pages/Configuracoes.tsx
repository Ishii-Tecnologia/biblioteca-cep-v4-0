import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import {
  Settings,
  Clock,
  RotateCw,
  Save,
  Loader2,
  Zap,
  Info,
  RotateCcw,
  Building2,
  ShieldCheck,
  Sparkles,
  Tag,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  FileSpreadsheet,
  Download,
  Users2,
  Split,
  GraduationCap,
  AlertTriangle,
  UserCheck,
  Search,
  Mail,
  Send,
  Calendar,
  AlertCircle,
  CheckCircle2,
  History,
  BookmarkCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmModal } from '@/components/ConfirmModal'
import { CategoriasService, Categoria } from '@/services/categorias'
import { CursosService, Curso } from '@/services/cursos'
import { AuthorsService, Author, AuthorType, LinkedBook } from '@/services/authors'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { downloadBookTemplateCsv, downloadBookFullExportCsv } from '@/lib/csv'
import { TitulosService } from '@/services/titulos'
import { AuditoriaJobService, AuditoriaJobConfig } from '@/services/auditoria-job'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

const DEFAULT_PARAMS = {
  nome_biblioteca: {
    defaultValue: 'Biblioteca CEP',
    label: 'Nome da Biblioteca / Instituição',
    description: 'Identificação padrão exibida no cabeçalho, relatórios e comprovantes.',
    type: 'text' as const,
  },
  prazo_emprestimo_dias: {
    defaultValue: '15',
    label: 'Prazo Padrão de Empréstimo (Dias Corridos)',
    description: 'Quantidade de dias corridos para devolução ao criar novos empréstimos.',
    type: 'number' as const,
    min: 1,
    max: 180,
  },
  prazo_renovacao_dias: {
    defaultValue: '15',
    label: 'Prazo de Renovação (Dias Corridos)',
    description: 'Quantidade de dias corridos acrescentados a cada renovação de empréstimo.',
    type: 'number' as const,
    min: 1,
    max: 180,
  },
  max_renovacoes: {
    defaultValue: '1',
    label: 'Limite Máximo de Renovações',
    description: 'Quantidade máxima de vezes que um mesmo empréstimo pode ser renovado.',
    type: 'number' as const,
    min: 0,
    max: 10,
  },
  max_exemplares_por_leitor: {
    defaultValue: '3',
    label: 'Limite de Exemplares Simultâneos por Leitor',
    description: 'Número máximo de livros ativos emprestados simultaneamente por leitor.',
    type: 'number' as const,
    min: 1,
    max: 20,
  },
  prazo_reserva_dias: {
    defaultValue: '5',
    label: 'Prazo de Tolerância de Reserva (Dias Corridos)',
    description: 'Dias em que um exemplar reservado fica retido aguardando retirada pelo leitor.',
    type: 'number' as const,
    min: 1,
    max: 30,
  },
  tempo_reserva_garantida_horas: {
    defaultValue: '24',
    label: 'Tempo de Reserva Garantida (Horas)',
    description:
      'Janela de horas em que o livro fica reservado com exclusividade para o leitor após ser liberado / devolvido.',
    type: 'number' as const,
    min: 1,
    max: 168,
  },
  label_estrutura_espirito_medium: {
    defaultValue: 'Espírito + Médium',
    label: 'Rótulo da Estrutura: Espírito + Médium',
    description:
      'Nome personalizado exibido no seletor de autoria para livros psicografados / mediúnicos.',
    type: 'text' as const,
  },
  label_estrutura_convencional: {
    defaultValue: 'Autor Convencional',
    label: 'Rótulo da Estrutura: Autor Convencional',
    description:
      'Nome personalizado exibido no seletor de autoria para autores encarnados / literatura geral.',
    type: 'text' as const,
  },
  csv_separador: {
    defaultValue: ';',
    label: 'Separador CSV para Exportações e Importações',
    description:
      'Delimitador padrão utilizado na geração e leitura de planilhas CSV (ponto e vírgula ou vírgula).',
    type: 'text' as const,
  },
  prazo_retirada_dias_uteis: {
    defaultValue: '7',
    label: 'Prazo de Retirada da Reserva (Dias Úteis)',
    description:
      'Quantidade de dias úteis que o leitor tem para retirar a obra na biblioteca após receber a notificação.',
    type: 'number' as const,
    min: 1,
    max: 30,
  },
  limite_maximo_fila_espera: {
    defaultValue: '3',
    label: 'Limite Máximo da Fila de Espera',
    description:
      'Quantidade máxima de leitores simultâneos permitidos na fila de espera por título.',
    type: 'number' as const,
    min: 1,
    max: 20,
  },
  email_liberacao_titulo: {
    defaultValue: 'Seu livro reservado já está disponível para retirada na Biblioteca CEP!',
    label: 'Assunto do E-mail de Liberação da Reserva',
    description:
      'Título do e-mail disparado para o leitor quando um exemplar reservado fica pronto para retirada.',
    type: 'text' as const,
  },
  email_liberacao_mensagem: {
    defaultValue:
      'Olá {nome_do_leitor},\n\nTemos uma ótima notícia! O livro "{titulo_do_livro}" que você reservou já está disponível para retirada na Biblioteca CEP.\n\nVocê tem até o dia {data_limite_retirada} ({prazo_retirada_dias_uteis} dias úteis) para comparecer e realizar o empréstimo.\n\nApós esse prazo, a reserva será cancelada e o exemplar será liberado para o próximo leitor da fila.\n\nAtenciosamente,\nEquipe Biblioteca CEP',
    label: 'Mensagem do E-mail de Liberação da Reserva',
    description:
      'Conteúdo textual do e-mail. Variáveis disponíveis: {titulo_do_livro}, {nome_do_leitor}, {prazo_retirada_dias_uteis}, {data_limite_retirada}.',
    type: 'text' as const,
  },
}

export default function Configuracoes() {
  const { isAdmin } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [runningRoutine, setRunningRoutine] = useState(false)
  const [exportingGeralCsv, setExportingGeralCsv] = useState(false)
  const [exportingDiretoriaCsv, setExportingDiretoriaCsv] = useState(false)

  // Cursos CRUD state
  const [cursosList, setCursosList] = useState<Curso[]>([])
  const [loadingCursos, setLoadingCursos] = useState(false)
  const [newCursoNome, setNewCursoNome] = useState('')
  const [addingCurso, setAddingCurso] = useState(false)
  const [editingCursoId, setEditingCursoId] = useState<string | null>(null)
  const [editingCursoNome, setEditingCursoNome] = useState('')
  const [savingCursoEdit, setSavingCursoEdit] = useState(false)
  const [deleteCursoModalOpen, setDeleteCursoModalOpen] = useState(false)
  const [cursoToDelete, setCursoToDelete] = useState<Curso | null>(null)
  const [deletingCurso, setDeletingCurso] = useState(false)

  // Categories CRUD state
  const [categories, setCategories] = useState<Categoria[]>([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [savingCategoryEdit, setSavingCategoryEdit] = useState(false)
  const [deleteCategoryModalOpen, setDeleteCategoryModalOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Categoria | null>(null)
  const [deletingCategory, setDeletingCategory] = useState(false)

  // Authors CRUD state
  const [authorsList, setAuthorsList] = useState<Author[]>([])
  const [loadingAuthors, setLoadingAuthors] = useState(false)
  const [selectedAuthorTab, setSelectedAuthorTab] = useState<
    'ALL' | 'MEDIUM_ENCARNADO' | 'ESPIRITO'
  >('ALL')
  const [authorSearchTerm, setAuthorSearchTerm] = useState('')
  const [newAuthorName, setNewAuthorName] = useState('')
  const [newAuthorType, setNewAuthorType] = useState<AuthorType>('ESPIRITO')
  const [addingAuthor, setAddingAuthor] = useState(false)
  const [editingAuthorId, setEditingAuthorId] = useState<string | null>(null)
  const [editingAuthorName, setEditingAuthorName] = useState('')
  const [savingAuthorEdit, setSavingAuthorEdit] = useState(false)

  // Delete author state & linked books alert
  const [authorToDelete, setAuthorToDelete] = useState<Author | null>(null)
  const [linkedBooksAlert, setLinkedBooksAlert] = useState<LinkedBook[]>([])
  const [checkingLinkedBooks, setCheckingLinkedBooks] = useState(false)
  const [deleteAuthorModalOpen, setDeleteAuthorModalOpen] = useState(false)
  const [deletingAuthor, setDeletingAuthor] = useState(false)

  // State values for parameters
  const [prazoEmprestimoDias, setPrazoEmprestimoDias] = useState(
    DEFAULT_PARAMS.prazo_emprestimo_dias.defaultValue,
  )
  const [prazoRenovacaoDias, setPrazoRenovacaoDias] = useState(
    DEFAULT_PARAMS.prazo_renovacao_dias.defaultValue,
  )
  const [maxRenovacoes, setMaxRenovacoes] = useState(DEFAULT_PARAMS.max_renovacoes.defaultValue)
  const [maxExemplaresPorLeitor, setMaxExemplaresPorLeitor] = useState(
    DEFAULT_PARAMS.max_exemplares_por_leitor.defaultValue,
  )
  const [prazoReservaDias, setPrazoReservaDias] = useState(
    DEFAULT_PARAMS.prazo_reserva_dias.defaultValue,
  )
  const [tempoReservaGarantidaHoras, setTempoReservaGarantidaHoras] = useState(
    DEFAULT_PARAMS.tempo_reserva_garantida_horas.defaultValue,
  )
  const [nomeBiblioteca, setNomeBiblioteca] = useState(DEFAULT_PARAMS.nome_biblioteca.defaultValue)
  const [labelEspiritoMedium, setLabelEspiritoMedium] = useState(
    DEFAULT_PARAMS.label_estrutura_espirito_medium.defaultValue,
  )
  const [labelConvencional, setLabelConvencional] = useState(
    DEFAULT_PARAMS.label_estrutura_convencional.defaultValue,
  )
  const [csvSeparador, setCsvSeparador] = useState<';' | ','>(
    DEFAULT_PARAMS.csv_separador.defaultValue as ';' | ',',
  )

  // Parâmetros de Reservas & Fila de Espera
  const [prazoRetiradaDiasUteis, setPrazoRetiradaDiasUteis] = useState(
    DEFAULT_PARAMS.prazo_retirada_dias_uteis.defaultValue,
  )
  const [limiteMaximoFilaEspera, setLimiteMaximoFilaEspera] = useState(
    DEFAULT_PARAMS.limite_maximo_fila_espera.defaultValue,
  )
  const [emailLiberacaoTitulo, setEmailLiberacaoTitulo] = useState(
    DEFAULT_PARAMS.email_liberacao_titulo.defaultValue,
  )
  const [emailLiberacaoMensagem, setEmailLiberacaoMensagem] = useState(
    DEFAULT_PARAMS.email_liberacao_mensagem.defaultValue,
  )

  // Auditoria Automática & Expurgo States
  const [auditConfig, setAuditConfig] = useState<AuditoriaJobConfig>({
    ativo: false,
    destinatarios: '',
    assunto: 'Relatório de Auditoria — {data_referencia}',
    corpo:
      'Olá,\n\nSegue em anexo o Relatório de Auditoria do sistema Biblioteca CEP referente ao período de {data_inicio} até {data_fim}.\n\nTotal de registros auditados: {total_registros}.\nData de geração: {data_referencia}.\n\nAcesse o sistema para mais detalhes: {link_sistema}',
    remetente: 'sys.biblioteca.cep@email.org',
    diasRetroativos: 30,
    diaEnvio: 1,
    horaEnvio: '08:00',
    diasRetencao: 90,
  })
  const [sendingTestEmail, setSendingTestEmail] = useState(false)
  const [runningAuditJobNow, setRunningAuditJobNow] = useState(false)
  const [latestJobInfo, setLatestJobInfo] = useState<any>(null)

  const loadAuditSettings = async () => {
    try {
      const [config, latest] = await Promise.all([
        AuditoriaJobService.loadConfig(),
        AuditoriaJobService.getLatestExecution(),
      ])
      setAuditConfig(config)
      setLatestJobInfo(latest)
    } catch (err) {
      console.error('Erro ao carregar configurações de auditoria:', err)
    }
  }

  const loadParams = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('parametros').select('*')

      if (error) throw error

      if (data && data.length > 0) {
        const paramMap = new Map<string, string>()
        data.forEach((p) => {
          paramMap.set(p.chave, p.valor)
        })

        if (paramMap.has('prazo_emprestimo_dias')) {
          setPrazoEmprestimoDias(paramMap.get('prazo_emprestimo_dias')!)
        } else if (paramMap.has('prazo_devolucao_dias')) {
          setPrazoEmprestimoDias(paramMap.get('prazo_devolucao_dias')!)
        }

        if (paramMap.has('prazo_renovacao_dias')) {
          setPrazoRenovacaoDias(paramMap.get('prazo_renovacao_dias')!)
        }

        if (paramMap.has('max_renovacoes')) {
          setMaxRenovacoes(paramMap.get('max_renovacoes')!)
        }

        if (paramMap.has('max_exemplares_por_leitor')) {
          setMaxExemplaresPorLeitor(paramMap.get('max_exemplares_por_leitor')!)
        }

        if (paramMap.has('prazo_reserva_dias')) {
          setPrazoReservaDias(paramMap.get('prazo_reserva_dias')!)
        }

        if (paramMap.has('tempo_reserva_garantida_horas')) {
          setTempoReservaGarantidaHoras(paramMap.get('tempo_reserva_garantida_horas')!)
        }

        if (paramMap.has('nome_biblioteca')) {
          setNomeBiblioteca(paramMap.get('nome_biblioteca')!)
        }

        if (paramMap.has('label_estrutura_espirito_medium')) {
          setLabelEspiritoMedium(paramMap.get('label_estrutura_espirito_medium')!)
        }

        if (paramMap.has('label_estrutura_convencional')) {
          setLabelConvencional(paramMap.get('label_estrutura_convencional')!)
        }

        if (paramMap.has('csv_separador')) {
          const sep = paramMap.get('csv_separador')
          setCsvSeparador(sep === ',' ? ',' : ';')
        }

        if (paramMap.has('prazo_retirada_dias_uteis')) {
          setPrazoRetiradaDiasUteis(paramMap.get('prazo_retirada_dias_uteis')!)
        }

        if (paramMap.has('limite_maximo_fila_espera')) {
          setLimiteMaximoFilaEspera(paramMap.get('limite_maximo_fila_espera')!)
        }

        if (paramMap.has('email_liberacao_titulo')) {
          setEmailLiberacaoTitulo(paramMap.get('email_liberacao_titulo')!)
        }

        if (paramMap.has('email_liberacao_mensagem')) {
          setEmailLiberacaoMensagem(paramMap.get('email_liberacao_mensagem')!)
        }
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar parâmetros',
        description: err.message || 'Não foi possível buscar as configurações.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const loadCursos = async () => {
    setLoadingCursos(true)
    try {
      const data = await CursosService.getAll()
      setCursosList(data)
    } catch (err: any) {
      console.error('Erro ao buscar cursos da CEP:', err)
    } finally {
      setLoadingCursos(false)
    }
  }

  const loadCategories = async () => {
    setLoadingCategories(true)
    try {
      const data = await CategoriasService.getAll()
      setCategories(data)
    } catch (err: any) {
      console.error('Erro ao buscar categorias:', err)
    } finally {
      setLoadingCategories(false)
    }
  }

  const loadAuthors = async () => {
    setLoadingAuthors(true)
    try {
      const data = await AuthorsService.getAll()
      setAuthorsList(data)
    } catch (err: any) {
      console.error('Erro ao carregar lista de autores:', err)
    } finally {
      setLoadingAuthors(false)
    }
  }

  useEffect(() => {
    loadParams()
    loadCursos()
    loadCategories()
    loadAuthors()
    loadAuditSettings()
  }, [])

  const handleSendTestAuditEmail = async () => {
    const { valid, invalid } = AuditoriaJobService.validateEmailList(auditConfig.destinatarios)
    if (valid.length === 0) {
      toast({
        title: 'Destinatário obrigatório',
        description: 'Informe ao menos um e-mail válido para realizar o envio manual.',
        variant: 'destructive',
      })
      return
    }

    setSendingTestEmail(true)
    try {
      // Salvar antes de disparar para garantir que a Edge Function use a configuração atual
      await AuditoriaJobService.saveConfig(auditConfig)
      const res = await AuditoriaJobService.sendManualReport()
      if (!res.success) {
        toast({
          title: 'Não foi possível enviar o relatório',
          description:
            res.error || res.message || 'Falha ao processar o envio manual do relatório.',
          variant: 'destructive',
        })
      } else {
        const prov = res.provedor_email || res.provider
        const provTitle =
          prov === 'smtp'
            ? 'Relatório Enviado via SMTP (Gmail)'
            : prov === 'resend'
              ? 'Relatório Enviado via Resend'
              : 'Relatório Processado (Envio Simulado)'

        toast({
          title: provTitle,
          description: res.message,
          className: 'bg-white text-slate-900 border-emerald-200 shadow-md',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Falha no envio manual',
        description: err.message || 'Não foi possível disparar o relatório de auditoria.',
        variant: 'destructive',
      })
    } finally {
      setSendingTestEmail(false)
      loadAuditSettings()
    }
  }

  const handleRunAuditJobNow = async () => {
    const { valid } = AuditoriaJobService.validateEmailList(auditConfig.destinatarios)
    if (valid.length === 0) {
      toast({
        title: 'Destinatário obrigatório',
        description: 'Informe ao menos um e-mail válido para executar o job mensal.',
        variant: 'destructive',
      })
      return
    }

    setRunningAuditJobNow(true)
    try {
      await AuditoriaJobService.saveConfig(auditConfig)
      const res = await AuditoriaJobService.runJobNow(true)
      if (!res.success) {
        toast({
          title: 'Aviso na execução do Job',
          description: res.error || res.message || 'A rotina não pôde ser completada.',
          variant: 'destructive',
        })
      } else {
        const prov = res.provedor_email || res.provider
        const provDetail =
          prov === 'smtp'
            ? ' (via SMTP / Gmail)'
            : prov === 'resend'
              ? ' (via Resend)'
              : ' (Envio simulado — nenhum provedor configurado)'

        toast({
          title: `Job Mensal Executado${provDetail}`,
          description: res.message,
          className: 'bg-white text-slate-900 border-emerald-200 shadow-md',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao executar job mensal',
        description: err.message || 'Não foi possível executar a rotina de auditoria.',
        variant: 'destructive',
      })
    } finally {
      setRunningAuditJobNow(false)
      loadAuditSettings()
    }
  }

  const handleDownloadTemplateCsv = () => {
    downloadBookTemplateCsv('template_importacao_acervo_cep.csv', csvSeparador)

    toast({
      title: 'Download iniciado',
      description: `Template CSV baixado com separador "${csvSeparador === ';' ? 'ponto e vírgula (;)' : 'vírgula (,)'}".`,
    })
  }

  const handleDownloadExportCsv = async (colecao: 'geral' | 'diretoria') => {
    if (colecao === 'geral') {
      setExportingGeralCsv(true)
    } else {
      setExportingDiretoriaCsv(true)
    }

    try {
      const data = await TitulosService.getAllForCsvExport(colecao)
      const nomeColecao = colecao === 'geral' ? 'Acervo Geral' : 'Acervo da Diretoria'
      const filename =
        colecao === 'geral'
          ? 'cadastro_livros_acervo_geral.csv'
          : 'cadastro_livros_acervo_diretoria.csv'

      if (!data || data.length === 0) {
        toast({
          title: 'Acervo vazio',
          description: `Não há títulos cadastrados no ${nomeColecao.toLowerCase()} para exportação.`,
          variant: 'destructive',
        })
      } else {
        downloadBookFullExportCsv(data, filename, csvSeparador)
        toast({
          title: 'Exportação concluída',
          description: `Download de ${nomeColecao} (${data.length} títulos) realizado no arquivo ${filename} com separador "${csvSeparador === ';' ? 'ponto e vírgula (;)' : 'vírgula (,)'}".`,
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro na exportação',
        description:
          err.message ||
          `Não foi possível gerar a exportação do ${colecao === 'geral' ? 'acervo geral' : 'acervo da diretoria'}.`,
        variant: 'destructive',
      })
    } finally {
      if (colecao === 'geral') {
        setExportingGeralCsv(false)
      } else {
        setExportingDiretoriaCsv(false)
      }
    }
  }

  // Handlers de Cursos da CEP
  const handleAddCurso = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCursoNome.trim()) return

    setAddingCurso(true)
    try {
      await CursosService.create(newCursoNome.trim())
      toast({
        title: 'Curso adicionado',
        description: `O curso "${newCursoNome.trim()}" foi criado com sucesso.`,
      })
      setNewCursoNome('')
      await loadCursos()
    } catch (err: any) {
      toast({
        title: 'Erro ao criar curso',
        description: err.message || 'Não foi possível cadastrar o curso.',
        variant: 'destructive',
      })
    } finally {
      setAddingCurso(false)
    }
  }

  const handleStartEditCurso = (c: Curso) => {
    setEditingCursoId(c.id)
    setEditingCursoNome(c.nome)
  }

  const handleCancelEditCurso = () => {
    setEditingCursoId(null)
    setEditingCursoNome('')
  }

  const handleSaveEditCurso = async (c: Curso) => {
    if (!editingCursoNome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'O nome do curso não pode ficar vazio.',
        variant: 'destructive',
      })
      return
    }

    setSavingCursoEdit(true)
    try {
      await CursosService.update(c.id, c.nome, editingCursoNome.trim())
      toast({
        title: 'Curso atualizado',
        description: `O curso "${c.nome}" foi alterado para "${editingCursoNome.trim()}". As alterações foram propagadas aos leitores vinculados.`,
      })
      setEditingCursoId(null)
      setEditingCursoNome('')
      await loadCursos()
    } catch (err: any) {
      toast({
        title: 'Erro ao atualizar curso',
        description: err.message || 'Não foi possível atualizar o curso.',
        variant: 'destructive',
      })
    } finally {
      setSavingCursoEdit(false)
    }
  }

  const handleOpenDeleteCurso = (c: Curso) => {
    setCursoToDelete(c)
    setDeleteCursoModalOpen(true)
  }

  const handleExecuteDeleteCurso = async () => {
    if (!cursoToDelete) return
    setDeletingCurso(true)
    try {
      await CursosService.delete(cursoToDelete.id, cursoToDelete.nome)
      toast({
        title: 'Curso excluído',
        description: `O curso "${cursoToDelete.nome}" foi excluído e desvinculado dos leitores associados.`,
      })
      setDeleteCursoModalOpen(false)
      setCursoToDelete(null)
      await loadCursos()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir curso',
        description: err.message || 'Não foi possível remover o curso.',
        variant: 'destructive',
      })
    } finally {
      setDeletingCurso(false)
    }
  }

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCategoryName.trim()) return

    setAddingCategory(true)
    try {
      await CategoriasService.create(newCategoryName)
      toast({
        title: 'Categoria criada',
        description: `A categoria "${newCategoryName.trim()}" foi adicionada com sucesso.`,
      })
      setNewCategoryName('')
      await loadCategories()
    } catch (err: any) {
      toast({
        title: 'Erro ao criar categoria',
        description: err.message || 'Não foi possível cadastrar a categoria.',
        variant: 'destructive',
      })
    } finally {
      setAddingCategory(false)
    }
  }

  const handleStartEditCategory = (cat: Categoria) => {
    setEditingCategoryId(cat.id)
    setEditingCategoryName(cat.nome)
  }

  const handleCancelEditCategory = () => {
    setEditingCategoryId(null)
    setEditingCategoryName('')
  }

  const handleSaveEditCategory = async (cat: Categoria) => {
    if (!editingCategoryName.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'O nome da categoria não pode ficar vazio.',
        variant: 'destructive',
      })
      return
    }

    setSavingCategoryEdit(true)
    try {
      await CategoriasService.update(cat.id, cat.nome, editingCategoryName)
      toast({
        title: 'Categoria atualizada',
        description: `A categoria "${cat.nome}" foi alterada para "${editingCategoryName.trim()}". Os títulos vinculados foram atualizados.`,
      })
      setEditingCategoryId(null)
      setEditingCategoryName('')
      await loadCategories()
    } catch (err: any) {
      toast({
        title: 'Erro ao atualizar categoria',
        description: err.message || 'Não foi possível atualizar a categoria.',
        variant: 'destructive',
      })
    } finally {
      setSavingCategoryEdit(false)
    }
  }

  const handleOpenDeleteCategory = (cat: Categoria) => {
    setCategoryToDelete(cat)
    setDeleteCategoryModalOpen(true)
  }

  const handleExecuteDeleteCategory = async () => {
    if (!categoryToDelete) return
    setDeletingCategory(true)
    try {
      await CategoriasService.delete(categoryToDelete.id, categoryToDelete.nome)
      toast({
        title: 'Categoria excluída',
        description: `A categoria "${categoryToDelete.nome}" foi removida. Os títulos associados tiveram a categoria desvinculada (em branco).`,
      })
      setDeleteCategoryModalOpen(false)
      setCategoryToDelete(null)
      await loadCategories()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir categoria',
        description: err.message || 'Não foi possível remover a categoria.',
        variant: 'destructive',
      })
    } finally {
      setDeletingCategory(false)
    }
  }

  // Authors handlers
  const handleAddAuthor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAuthorName.trim()) return

    setAddingAuthor(true)
    try {
      await AuthorsService.create(newAuthorName, newAuthorType)
      const typeLabel =
        newAuthorType === 'ESPIRITO'
          ? 'Autor Espiritual'
          : newAuthorType === 'MEDIUM'
            ? 'Médium'
            : 'Autor Convencional'

      toast({
        title: `${typeLabel} adicionado`,
        description: `"${newAuthorName.trim()}" foi cadastrado com sucesso.`,
      })
      setNewAuthorName('')
      await loadAuthors()
    } catch (err: any) {
      toast({
        title: 'Erro ao cadastrar',
        description: err.message || 'Não foi possível salvar o nome.',
        variant: 'destructive',
      })
    } finally {
      setAddingAuthor(false)
    }
  }

  const handleStartEditAuthor = (author: Author) => {
    setEditingAuthorId(author.id)
    setEditingAuthorName(author.name)
  }

  const handleCancelEditAuthor = () => {
    setEditingAuthorId(null)
    setEditingAuthorName('')
  }

  const handleSaveEditAuthor = async (author: Author) => {
    if (!editingAuthorName.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'O nome não pode ficar em branco.',
        variant: 'destructive',
      })
      return
    }

    setSavingAuthorEdit(true)
    try {
      await AuthorsService.update(author.id, editingAuthorName)
      toast({
        title: 'Registro atualizado',
        description: `O nome foi alterado para "${editingAuthorName.trim()}".`,
      })
      setEditingAuthorId(null)
      setEditingAuthorName('')
      await loadAuthors()
    } catch (err: any) {
      toast({
        title: 'Erro ao atualizar',
        description: err.message || 'Não foi possível atualizar o registro.',
        variant: 'destructive',
      })
    } finally {
      setSavingAuthorEdit(false)
    }
  }

  // Abertura do modal de exclusão com checagem de livros vinculados
  const handleOpenDeleteAuthor = async (author: Author) => {
    setAuthorToDelete(author)
    setCheckingLinkedBooks(true)
    setLinkedBooksAlert([])
    setDeleteAuthorModalOpen(true)

    try {
      const books = await AuthorsService.getLinkedBooks(author.name, author.type)
      setLinkedBooksAlert(books)
    } catch (err) {
      console.warn('Erro ao verificar livros vinculados:', err)
    } finally {
      setCheckingLinkedBooks(false)
    }
  }

  const handleExecuteDeleteAuthor = async () => {
    if (!authorToDelete) return
    setDeletingAuthor(true)
    try {
      await AuthorsService.delete(authorToDelete.id)
      toast({
        title: 'Nome removido da lista',
        description: `"${authorToDelete.name}" foi removido da lista gerenciada. O cadastro dos livros existentes foi preservado sem alterações.`,
      })
      setDeleteAuthorModalOpen(false)
      setAuthorToDelete(null)
      setLinkedBooksAlert([])
      await loadAuthors()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir',
        description: err.message || 'Não foi possível remover da lista.',
        variant: 'destructive',
      })
    } finally {
      setDeletingAuthor(false)
    }
  }

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    // Validar destinatários caso ativado
    if (auditConfig.ativo) {
      const { valid, invalid } = AuditoriaJobService.validateEmailList(auditConfig.destinatarios)
      if (valid.length === 0) {
        toast({
          title: 'Configuração inválida',
          description: 'Para ativar o envio automático, informe ao menos 1 e-mail válido.',
          variant: 'destructive',
        })
        return
      }
      if (invalid.length > 0) {
        toast({
          title: 'Aviso sobre e-mails inválidos',
          description: `Os e-mails inválidos serão desconsiderados: ${invalid.join(', ')}.`,
          variant: 'info',
        })
      }
    }

    setSaving(true)

    const payload = [
      {
        chave: 'prazo_emprestimo_dias',
        valor: String(prazoEmprestimoDias || DEFAULT_PARAMS.prazo_emprestimo_dias.defaultValue),
        descricao: DEFAULT_PARAMS.prazo_emprestimo_dias.description,
      },
      {
        chave: 'prazo_renovacao_dias',
        valor: String(prazoRenovacaoDias || DEFAULT_PARAMS.prazo_renovacao_dias.defaultValue),
        descricao: DEFAULT_PARAMS.prazo_renovacao_dias.description,
      },
      {
        chave: 'max_renovacoes',
        valor: String(maxRenovacoes || DEFAULT_PARAMS.max_renovacoes.defaultValue),
        descricao: DEFAULT_PARAMS.max_renovacoes.description,
      },
      {
        chave: 'max_exemplares_por_leitor',
        valor: String(
          maxExemplaresPorLeitor || DEFAULT_PARAMS.max_exemplares_por_leitor.defaultValue,
        ),
        descricao: DEFAULT_PARAMS.max_exemplares_por_leitor.description,
      },
      {
        chave: 'prazo_reserva_dias',
        valor: String(prazoReservaDias || DEFAULT_PARAMS.prazo_reserva_dias.defaultValue),
        descricao: DEFAULT_PARAMS.prazo_reserva_dias.description,
      },
      {
        chave: 'tempo_reserva_garantida_horas',
        valor: String(
          tempoReservaGarantidaHoras || DEFAULT_PARAMS.tempo_reserva_garantida_horas.defaultValue,
        ),
        descricao: DEFAULT_PARAMS.tempo_reserva_garantida_horas.description,
      },
      {
        chave: 'nome_biblioteca',
        valor: String(nomeBiblioteca || DEFAULT_PARAMS.nome_biblioteca.defaultValue).trim(),
        descricao: DEFAULT_PARAMS.nome_biblioteca.description,
      },
      {
        chave: 'label_estrutura_espirito_medium',
        valor: String(
          labelEspiritoMedium || DEFAULT_PARAMS.label_estrutura_espirito_medium.defaultValue,
        ).trim(),
        descricao: DEFAULT_PARAMS.label_estrutura_espirito_medium.description,
      },
      {
        chave: 'label_estrutura_convencional',
        valor: String(
          labelConvencional || DEFAULT_PARAMS.label_estrutura_convencional.defaultValue,
        ).trim(),
        descricao: DEFAULT_PARAMS.label_estrutura_convencional.description,
      },
      {
        chave: 'csv_separador',
        valor: csvSeparador === ',' ? ',' : ';',
        descricao: DEFAULT_PARAMS.csv_separador.description,
      },
      {
        chave: 'prazo_retirada_dias_uteis',
        valor: String(
          prazoRetiradaDiasUteis || DEFAULT_PARAMS.prazo_retirada_dias_uteis.defaultValue,
        ).trim(),
        descricao: DEFAULT_PARAMS.prazo_retirada_dias_uteis.description,
      },
      {
        chave: 'limite_maximo_fila_espera',
        valor: String(
          limiteMaximoFilaEspera || DEFAULT_PARAMS.limite_maximo_fila_espera.defaultValue,
        ).trim(),
        descricao: DEFAULT_PARAMS.limite_maximo_fila_espera.description,
      },
      {
        chave: 'email_liberacao_titulo',
        valor: String(
          emailLiberacaoTitulo || DEFAULT_PARAMS.email_liberacao_titulo.defaultValue,
        ).trim(),
        descricao: DEFAULT_PARAMS.email_liberacao_titulo.description,
      },
      {
        chave: 'email_liberacao_mensagem',
        valor: String(
          emailLiberacaoMensagem || DEFAULT_PARAMS.email_liberacao_mensagem.defaultValue,
        ).trim(),
        descricao: DEFAULT_PARAMS.email_liberacao_mensagem.description,
      },
    ]

    try {
      const { error } = await supabase.from('parametros').upsert(payload, {
        onConflict: 'chave',
      })

      if (error) throw error

      toast({
        title: 'Configurações salvas com sucesso!',
        description: 'Todos os parâmetros operacionais e rótulos de autoria foram gravados.',
      })

      // Gravar também as configurações do job de auditoria
      await AuditoriaJobService.saveConfig(auditConfig)

      await loadParams()
      await loadAuditSettings()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar configurações',
        description: err.message || 'Não foi possível atualizar os parâmetros no banco.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleRestoreDefaults = () => {
    setPrazoEmprestimoDias(DEFAULT_PARAMS.prazo_emprestimo_dias.defaultValue)
    setPrazoRenovacaoDias(DEFAULT_PARAMS.prazo_renovacao_dias.defaultValue)
    setMaxRenovacoes(DEFAULT_PARAMS.max_renovacoes.defaultValue)
    setMaxExemplaresPorLeitor(DEFAULT_PARAMS.max_exemplares_por_leitor.defaultValue)
    setPrazoReservaDias(DEFAULT_PARAMS.prazo_reserva_dias.defaultValue)
    setTempoReservaGarantidaHoras(DEFAULT_PARAMS.tempo_reserva_garantida_horas.defaultValue)
    setNomeBiblioteca(DEFAULT_PARAMS.nome_biblioteca.defaultValue)
    setLabelEspiritoMedium(DEFAULT_PARAMS.label_estrutura_espirito_medium.defaultValue)
    setLabelConvencional(DEFAULT_PARAMS.label_estrutura_convencional.defaultValue)
    setCsvSeparador(DEFAULT_PARAMS.csv_separador.defaultValue as ';' | ',')
    setPrazoRetiradaDiasUteis(DEFAULT_PARAMS.prazo_retirada_dias_uteis.defaultValue)
    setLimiteMaximoFilaEspera(DEFAULT_PARAMS.limite_maximo_fila_espera.defaultValue)
    setEmailLiberacaoTitulo(DEFAULT_PARAMS.email_liberacao_titulo.defaultValue)
    setEmailLiberacaoMensagem(DEFAULT_PARAMS.email_liberacao_mensagem.defaultValue)

    toast({
      title: 'Valores padrão restaurados no formulário',
      description: 'Clique em "Salvar Configurações" para gravar as alterações no sistema.',
      variant: 'info',
    })
  }

  const handleRunOverdueCheck = async () => {
    setRunningRoutine(true)
    try {
      const { data, error } = await supabase.rpc('verificar_atrasos_geral')
      if (error) throw error

      toast({
        title: 'Rotina executada',
        description: `Verificação de atrasos concluída (${data ?? 0} registros avaliados/atualizados).`,
        className: 'bg-white text-slate-900 border-slate-200 shadow-lg',
      })
    } catch (err: any) {
      toast({
        title: 'Erro na rotina',
        description: err.message || 'Falha ao executar verificar_atrasos_geral.',
        variant: 'destructive',
      })
    } finally {
      setRunningRoutine(false)
    }
  }

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-emerald-600" />
            Configurações do Sistema
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Gerencie os parâmetros operacionais, prazos, estruturas de autoria, modelo CSV e rotinas
            da biblioteca.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs py-1 px-2.5 gap-1"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {isAdmin ? 'Modo Administrador' : 'Modo Visualização'}
          </Badge>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="text-xs text-slate-500 font-medium">Carregando configurações...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Card 1: Identificação Institucional */}
          <Card className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                Identificação da Unidade
              </CardTitle>
              <CardDescription className="text-xs">
                Informações visíveis aos usuários e nas emissões do sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="nome_biblioteca" className="text-xs font-semibold text-slate-700">
                    {DEFAULT_PARAMS.nome_biblioteca.label}
                  </Label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    chave: nome_biblioteca
                  </span>
                </div>
                <Input
                  id="nome_biblioteca"
                  type="text"
                  value={nomeBiblioteca}
                  onChange={(e) => setNomeBiblioteca(e.target.value)}
                  disabled={!isAdmin || saving}
                  placeholder="Biblioteca CEP"
                  className="text-sm font-medium"
                />
                <p className="text-[11px] text-slate-500">
                  {DEFAULT_PARAMS.nome_biblioteca.description}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card: Rótulos e Estrutura de Autoria */}
          <Card className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users2 className="w-5 h-5 text-emerald-600" />
                Estruturas & Rótulos de Autoria
              </CardTitle>
              <CardDescription className="text-xs">
                Personalize os títulos e rótulos exibidos nos formulários de cadastro de livros e
                seletores de autoria.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="label_espirito_medium"
                      className="text-xs font-semibold text-slate-700"
                    >
                      {DEFAULT_PARAMS.label_estrutura_espirito_medium.label}
                    </Label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      chave: label_estrutura_espirito_medium
                    </span>
                  </div>
                  <Input
                    id="label_espirito_medium"
                    type="text"
                    value={labelEspiritoMedium}
                    onChange={(e) => setLabelEspiritoMedium(e.target.value)}
                    disabled={!isAdmin || saving}
                    placeholder="Espírito + Médium"
                    className="text-sm font-medium"
                  />
                  <p className="text-[11px] text-slate-500">
                    {DEFAULT_PARAMS.label_estrutura_espirito_medium.description}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="label_convencional"
                      className="text-xs font-semibold text-slate-700"
                    >
                      {DEFAULT_PARAMS.label_estrutura_convencional.label}
                    </Label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      chave: label_estrutura_convencional
                    </span>
                  </div>
                  <Input
                    id="label_convencional"
                    type="text"
                    value={labelConvencional}
                    onChange={(e) => setLabelConvencional(e.target.value)}
                    disabled={!isAdmin || saving}
                    placeholder="Autor Convencional"
                    className="text-sm font-medium"
                  />
                  <p className="text-[11px] text-slate-500">
                    {DEFAULT_PARAMS.label_estrutura_convencional.description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Configuração do Formato CSV e Template de Importação */}
          <Card className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                Arquivos CSV & Modelo de Importação
              </CardTitle>
              <CardDescription className="text-xs">
                Configure o delimitador padrão das exportações/importações e baixe o modelo oficial
                formatado para importação em lote de livros.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Seletor de Separador CSV */}
              <div className="space-y-2 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="csv_separador"
                    className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                  >
                    <Split className="w-3.5 h-3.5 text-emerald-600" />
                    Separador de Campos CSV (Exportação e Importação)
                  </Label>
                  <span className="text-[11px] text-slate-400 font-mono">chave: csv_separador</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <Select
                    value={csvSeparador}
                    onValueChange={(val: ';' | ',') => setCsvSeparador(val)}
                    disabled={!isAdmin || saving}
                  >
                    <SelectTrigger id="csv_separador" className="text-xs bg-white h-9 font-medium">
                      <SelectValue placeholder="Selecione o separador" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=";" className="text-xs">
                        <span className="font-semibold">Ponto e vírgula (;)</span> — Padrão Excel
                        pt-BR / Brasil
                      </SelectItem>
                      <SelectItem value="," className="text-xs">
                        <span className="font-semibold">Vírgula (,)</span> — Padrão Internacional /
                        RFC 4180
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center text-[11px] text-slate-500 leading-tight">
                    {csvSeparador === ';' ? (
                      <span>
                        Ponto e vírgula (<strong>;</strong>) é recomendado para computadores
                        configurados no Brasil, evitando que números decimais se dividam em colunas
                        no Excel.
                      </span>
                    ) : (
                      <span>
                        Vírgula (<strong>,</strong>) é o padrão internacional de CSV (valores que
                        contenham vírgula são automaticamente envolvidos em aspas).
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Downloads: Arquivo Modelo e Base Completa de Livros */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3.5">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-900">
                    Arquivos CSV de Importação e Exportação do Acervo
                  </p>
                  <p className="text-[11px] text-slate-500 leading-relaxed max-w-2xl">
                    Utilizam o separador configurado ({' '}
                    <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[10px] font-mono">
                      {csvSeparador === ';' ? 'ponto e vírgula (;)' : 'vírgula (,)'}
                    </code>{' '}
                    ) e codificação UTF-8 com BOM (\uFEFF) para compatibilidade nativa com Excel e
                    LibreOffice pt-BR. Ambos possuem exatamente a mesma estrutura de colunas aceita
                    pelo importador do sistema.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Opção 1: Arquivo Modelo de Importação */}
                  <div className="p-3 rounded-lg bg-white border border-slate-200 flex flex-col justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Arquivo Modelo de Importação</span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono">
                        template_importacao_acervo_cep.csv
                      </p>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        Planilha modelo com exemplos ilustrativos para preenchimento de novas obras.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={handleDownloadTemplateCsv}
                      variant="outline"
                      size="sm"
                      className="w-full bg-white hover:bg-emerald-50 border-emerald-600/40 text-emerald-700 hover:text-emerald-800 text-xs font-medium gap-2 shadow-2xs h-8"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar Modelo CSV ({csvSeparador === ';' ? ';' : ','})
                    </Button>
                  </div>

                  {/* Opção 2: Tabela com a base cadastrada separada por acervo */}
                  <div className="p-3 rounded-lg bg-white border border-slate-200 flex flex-col justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Exportação da Base Cadastrada por Acervo</span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono">
                        cadastro_livros_acervo_geral.csv / cadastro_livros_acervo_diretoria.csv
                      </p>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        Baixe os dados do Acervo Geral ou do Acervo da Diretoria separadamente no
                        formato oficial do modelo CSV.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Button
                        type="button"
                        onClick={() => handleDownloadExportCsv('geral')}
                        disabled={exportingGeralCsv || exportingDiretoriaCsv}
                        variant="outline"
                        size="sm"
                        className="w-full bg-white hover:bg-emerald-50 border-emerald-600/40 text-emerald-700 hover:text-emerald-800 text-xs font-medium gap-1.5 shadow-2xs h-8"
                      >
                        {exportingGeralCsv ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        {exportingGeralCsv ? 'Exportando...' : 'Acervo Geral'}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleDownloadExportCsv('diretoria')}
                        disabled={exportingGeralCsv || exportingDiretoriaCsv}
                        variant="outline"
                        size="sm"
                        className="w-full bg-white hover:bg-emerald-50 border-emerald-600/40 text-emerald-700 hover:text-emerald-800 text-xs font-medium gap-1.5 shadow-2xs h-8"
                      >
                        {exportingDiretoriaCsv ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        {exportingDiretoriaCsv ? 'Exportando...' : 'Acervo da Diretoria'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Políticas de Empréstimos & Renovações */}
          <Card className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                Políticas de Circulação & Prazos
              </CardTitle>
              <CardDescription className="text-xs">
                Defina os prazos padrão para cálculo automático da data prevista e tolerâncias de
                devolução.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Prazo de Empréstimo */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="prazo_emprestimo_dias"
                      className="text-xs font-semibold text-slate-700"
                    >
                      {DEFAULT_PARAMS.prazo_emprestimo_dias.label}
                    </Label>
                  </div>
                  <Input
                    id="prazo_emprestimo_dias"
                    type="number"
                    min={DEFAULT_PARAMS.prazo_emprestimo_dias.min}
                    max={DEFAULT_PARAMS.prazo_emprestimo_dias.max}
                    value={prazoEmprestimoDias}
                    onChange={(e) => setPrazoEmprestimoDias(e.target.value)}
                    disabled={!isAdmin || saving}
                    className="text-sm font-medium font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Padrão: <span className="font-semibold text-slate-700">15 dias</span> corridos.
                  </p>
                </div>

                {/* Prazo de Renovação */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="prazo_renovacao_dias"
                      className="text-xs font-semibold text-slate-700"
                    >
                      {DEFAULT_PARAMS.prazo_renovacao_dias.label}
                    </Label>
                  </div>
                  <Input
                    id="prazo_renovacao_dias"
                    type="number"
                    min={DEFAULT_PARAMS.prazo_renovacao_dias.min}
                    max={DEFAULT_PARAMS.prazo_renovacao_dias.max}
                    value={prazoRenovacaoDias}
                    onChange={(e) => setPrazoRenovacaoDias(e.target.value)}
                    disabled={!isAdmin || saving}
                    className="text-sm font-medium font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    {DEFAULT_PARAMS.prazo_renovacao_dias.description}
                  </p>
                </div>

                {/* Limite Máximo de Renovações */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="max_renovacoes"
                      className="text-xs font-semibold text-slate-700"
                    >
                      {DEFAULT_PARAMS.max_renovacoes.label}
                    </Label>
                  </div>
                  <Input
                    id="max_renovacoes"
                    type="number"
                    min={DEFAULT_PARAMS.max_renovacoes.min}
                    max={DEFAULT_PARAMS.max_renovacoes.max}
                    value={maxRenovacoes}
                    onChange={(e) => setMaxRenovacoes(e.target.value)}
                    disabled={!isAdmin || saving}
                    className="text-sm font-medium font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Padrão: <span className="font-semibold text-slate-700">1 renovação</span> por
                    empréstimo.
                  </p>
                </div>

                {/* Limite de Exemplares por Leitor */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="max_exemplares_por_leitor"
                      className="text-xs font-semibold text-slate-700"
                    >
                      {DEFAULT_PARAMS.max_exemplares_por_leitor.label}
                    </Label>
                  </div>
                  <Input
                    id="max_exemplares_por_leitor"
                    type="number"
                    min={DEFAULT_PARAMS.max_exemplares_por_leitor.min}
                    max={DEFAULT_PARAMS.max_exemplares_por_leitor.max}
                    value={maxExemplaresPorLeitor}
                    onChange={(e) => setMaxExemplaresPorLeitor(e.target.value)}
                    disabled={!isAdmin || saving}
                    className="text-sm font-medium font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Padrão: <span className="font-semibold text-slate-700">3 exemplares</span>{' '}
                    simultâneos.
                  </p>
                </div>

                {/* Prazo de Reserva */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="prazo_reserva_dias"
                      className="text-xs font-semibold text-slate-700"
                    >
                      {DEFAULT_PARAMS.prazo_reserva_dias.label}
                    </Label>
                  </div>
                  <Input
                    id="prazo_reserva_dias"
                    type="number"
                    min={DEFAULT_PARAMS.prazo_reserva_dias.min}
                    max={DEFAULT_PARAMS.prazo_reserva_dias.max}
                    value={prazoReservaDias}
                    onChange={(e) => setPrazoReservaDias(e.target.value)}
                    disabled={!isAdmin || saving}
                    className="text-sm font-medium font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Padrão: <span className="font-semibold text-slate-700">5 dias</span> de
                    tolerância.
                  </p>
                </div>

                {/* Tempo de Reserva Garantida (Horas) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="tempo_reserva_garantida_horas"
                      className="text-xs font-semibold text-slate-700"
                    >
                      {DEFAULT_PARAMS.tempo_reserva_garantida_horas.label}
                    </Label>
                  </div>
                  <Input
                    id="tempo_reserva_garantida_horas"
                    type="number"
                    min={DEFAULT_PARAMS.tempo_reserva_garantida_horas.min}
                    max={DEFAULT_PARAMS.tempo_reserva_garantida_horas.max}
                    value={tempoReservaGarantidaHoras}
                    onChange={(e) => setTempoReservaGarantidaHoras(e.target.value)}
                    disabled={!isAdmin || saving}
                    className="text-sm font-medium font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Padrão: <span className="font-semibold text-slate-700">24 horas</span>{' '}
                    garantidas após notificação de disponibilidade para retirada na biblioteca.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card Novo: Reservas & Fila de Espera */}
          <Card className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BookmarkCheck className="w-5 h-5 text-emerald-600" />
                Reservas & Fila de Espera
              </CardTitle>
              <CardDescription className="text-xs">
                Configure os parâmetros operacionais da fila de espera e personalize os templates de
                e-mail disparados aos leitores.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Parâmetros numéricos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
                {/* Prazo de Retirada (Dias Úteis) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="prazo_retirada_dias_uteis"
                      className="text-xs font-semibold text-slate-700"
                    >
                      {DEFAULT_PARAMS.prazo_retirada_dias_uteis.label}
                    </Label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      chave: prazo_retirada_dias_uteis
                    </span>
                  </div>
                  <Input
                    id="prazo_retirada_dias_uteis"
                    type="number"
                    min={DEFAULT_PARAMS.prazo_retirada_dias_uteis.min}
                    max={DEFAULT_PARAMS.prazo_retirada_dias_uteis.max}
                    value={prazoRetiradaDiasUteis}
                    onChange={(e) => setPrazoRetiradaDiasUteis(e.target.value)}
                    disabled={!isAdmin || saving}
                    className="text-sm font-medium font-mono bg-white"
                  />
                  <p className="text-[11px] text-slate-500">
                    Padrão: <span className="font-semibold text-slate-700">7 dias úteis</span>{' '}
                    (exclui sábados e domingos no cálculo da data limite).
                  </p>
                </div>

                {/* Limite Máximo da Fila de Espera */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="limite_maximo_fila_espera"
                      className="text-xs font-semibold text-slate-700"
                    >
                      {DEFAULT_PARAMS.limite_maximo_fila_espera.label}
                    </Label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      chave: limite_maximo_fila_espera
                    </span>
                  </div>
                  <Input
                    id="limite_maximo_fila_espera"
                    type="number"
                    min={DEFAULT_PARAMS.limite_maximo_fila_espera.min}
                    max={DEFAULT_PARAMS.limite_maximo_fila_espera.max}
                    value={limiteMaximoFilaEspera}
                    onChange={(e) => setLimiteMaximoFilaEspera(e.target.value)}
                    disabled={!isAdmin || saving}
                    className="text-sm font-medium font-mono bg-white"
                  />
                  <p className="text-[11px] text-slate-500">
                    Padrão: <span className="font-semibold text-slate-700">3 leitores</span> na fila
                    simultaneamente por obra.
                  </p>
                </div>
              </div>

              {/* Template de E-mail de Liberação da Reserva */}
              <div className="space-y-4 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-emerald-600" />
                    Template do E-mail de Liberação da Reserva (Notificação para Retirada)
                  </Label>
                  <p className="text-[11px] text-slate-500">
                    Disparado automaticamente ao leitor quando o livro reservado é devolvido ou
                    disponibilizado pela equipe.
                  </p>
                </div>

                {/* Assunto do E-mail */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="email_liberacao_titulo"
                      className="text-xs font-semibold text-slate-700"
                    >
                      {DEFAULT_PARAMS.email_liberacao_titulo.label}
                    </Label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      chave: email_liberacao_titulo
                    </span>
                  </div>
                  <Input
                    id="email_liberacao_titulo"
                    type="text"
                    value={emailLiberacaoTitulo}
                    onChange={(e) => setEmailLiberacaoTitulo(e.target.value)}
                    disabled={!isAdmin || saving}
                    placeholder="Seu livro reservado já está disponível para retirada na Biblioteca CEP!"
                    className="text-xs"
                  />
                  <p className="text-[11px] text-slate-500">
                    Padrão: <code>Livro {'{titulo_do_livro}'} liberado para empréstimo.</code>{' '}
                    (variáveis: <code>{'{titulo_do_livro}'}</code>,{' '}
                    <code>{'{nome_do_leitor}'}</code>).
                  </p>
                </div>

                {/* Mensagem / Corpo do E-mail */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="email_liberacao_mensagem"
                      className="text-xs font-semibold text-slate-700"
                    >
                      {DEFAULT_PARAMS.email_liberacao_mensagem.label}
                    </Label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      chave: email_liberacao_mensagem
                    </span>
                  </div>
                  <Textarea
                    id="email_liberacao_mensagem"
                    rows={6}
                    value={emailLiberacaoMensagem}
                    onChange={(e) => setEmailLiberacaoMensagem(e.target.value)}
                    disabled={!isAdmin || saving}
                    className="text-xs font-sans leading-relaxed"
                  />
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-[11px] text-emerald-900 space-y-2">
                    <p className="font-semibold text-emerald-950">
                      Variáveis disponíveis no template (assunto e mensagem):
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[10px] text-emerald-800">
                      <div className="bg-white px-2 py-1 rounded border border-emerald-200">
                        <span className="font-bold">{'{titulo_do_livro}'}</span> — Título da obra
                      </div>
                      <div className="bg-white px-2 py-1 rounded border border-emerald-200">
                        <span className="font-bold">{'{nome_do_leitor}'}</span> — Nome do leitor
                      </div>
                      <div className="bg-white px-2 py-1 rounded border border-emerald-200">
                        <span className="font-bold">{'{prazo_retirada_dias_uteis}'}</span> — Prazo
                        em dias úteis (ex: 7)
                      </div>
                      <div className="bg-white px-2 py-1 rounded border border-emerald-200">
                        <span className="font-bold">{'{data_limite_retirada}'}</span> — Data limite
                        formatada (DD/MM/AAAA)
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-600 font-sans">
                      Texto padrão da mensagem:{' '}
                      <em>
                        "O livro {'{titulo_do_livro}'} está liberado para empréstimo. Você tem o
                        prazo de {'{prazo_retirada_dias_uteis}'} dias para a retirada. Procure a
                        Biblioteca para realizar o empréstimo. Obrigado! CEP"
                      </em>
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Envio Automático do Relatório de Auditoria (Logs) & Expurgo */}
          <Card className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Mail className="w-5 h-5 text-emerald-600" />
                    Envio Automático do Relatório de Auditoria & Expurgo Mensal
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Configure o agendamento mensal que gera o Histórico Geral em PDF, envia por
                    e-mail e realiza a rotina de expurgo em lotes.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-xs py-0.5 px-2.5 font-medium ${
                      auditConfig.ativo
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    {auditConfig.ativo ? 'Agendamento Ativo' : 'Agendamento Inativo'}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Toggle de ativação */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="space-y-0.5">
                  <Label
                    htmlFor="auditoria_ativo"
                    className="text-xs font-bold text-slate-900 cursor-pointer"
                  >
                    Habilitar Envio Mensal Automático & Rotina de Expurgo
                  </Label>
                  <p className="text-[11px] text-slate-500">
                    O job roda diariamente. Se o dia atual coincidir com o configurado, executa na
                    ordem obrigatória: <strong>Gerar PDF → Enviar E-mail → Expurgar Base</strong>.
                  </p>
                </div>
                <Switch
                  id="auditoria_ativo"
                  checked={auditConfig.ativo}
                  onCheckedChange={(checked) =>
                    setAuditConfig((prev) => ({ ...prev, ativo: checked }))
                  }
                  disabled={!isAdmin || saving}
                />
              </div>

              {/* Grid de Destinatários e Remetente */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="auditoria_destinatarios"
                      className="text-xs font-semibold text-slate-700"
                    >
                      Destinatários (separados por vírgula) *
                    </Label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      chave: auditoria_destinatarios
                    </span>
                  </div>
                  <Input
                    id="auditoria_destinatarios"
                    type="text"
                    value={auditConfig.destinatarios}
                    onChange={(e) =>
                      setAuditConfig((prev) => ({ ...prev, destinatarios: e.target.value }))
                    }
                    disabled={!isAdmin || saving}
                    placeholder="auditoria@instituicao.org, diretoria@instituicao.org"
                    className="text-xs font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Ao menos 1 e-mail válido é obrigatório para ativar. E-mails inválidos serão
                    ignorados e auditados.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="auditoria_remetente"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Remetente Exibido
                  </Label>
                  <Input
                    id="auditoria_remetente"
                    type="text"
                    value={auditConfig.remetente}
                    onChange={(e) =>
                      setAuditConfig((prev) => ({ ...prev, remetente: e.target.value }))
                    }
                    disabled={!isAdmin || saving}
                    className="text-xs font-mono"
                  />
                  <p className="text-[11px] text-slate-500">Padrão institucional do sistema.</p>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="auditoria_assunto"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Assunto do E-mail
                  </Label>
                  <Input
                    id="auditoria_assunto"
                    type="text"
                    value={auditConfig.assunto}
                    onChange={(e) =>
                      setAuditConfig((prev) => ({ ...prev, assunto: e.target.value }))
                    }
                    disabled={!isAdmin || saving}
                    className="text-xs"
                  />
                  <p className="text-[11px] text-slate-500">
                    Variável disponível: <code>{'{data_referencia}'}</code>
                  </p>
                </div>
              </div>

              {/* Corpo do E-mail */}
              <div className="space-y-1.5">
                <Label htmlFor="auditoria_corpo" className="text-xs font-semibold text-slate-700">
                  Corpo da Mensagem
                </Label>
                <Textarea
                  id="auditoria_corpo"
                  rows={4}
                  value={auditConfig.corpo}
                  onChange={(e) => setAuditConfig((prev) => ({ ...prev, corpo: e.target.value }))}
                  disabled={!isAdmin || saving}
                  className="text-xs font-sans leading-relaxed"
                />
                <p className="text-[11px] text-slate-500">
                  Variáveis: <code>{'{data_inicio}'}</code>, <code>{'{data_fim}'}</code>,{' '}
                  <code>{'{data_referencia}'}</code>, <code>{'{total_registros}'}</code>,{' '}
                  <code>{'{link_sistema}'}</code>.
                </p>
              </div>

              {/* Parâmetros de Filtro N, Agendamento e Expurgo */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="space-y-1">
                  <Label
                    htmlFor="dias_retroativos"
                    className="text-xs font-semibold text-slate-700 flex items-center gap-1"
                  >
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    Período do Relatório (N)
                  </Label>
                  <Input
                    id="dias_retroativos"
                    type="number"
                    min={1}
                    max={365}
                    value={auditConfig.diasRetroativos}
                    onChange={(e) =>
                      setAuditConfig((prev) => ({
                        ...prev,
                        diasRetroativos: Math.max(1, Math.min(365, parseInt(e.target.value) || 1)),
                      }))
                    }
                    disabled={!isAdmin || saving}
                    className="text-xs bg-white font-mono h-9"
                  />
                  <p className="text-[10px] text-slate-500">Últimos N dias no PDF (1-365).</p>
                </div>

                <div className="space-y-1">
                  <Label
                    htmlFor="dia_envio"
                    className="text-xs font-semibold text-slate-700 flex items-center gap-1"
                  >
                    <Clock className="w-3.5 h-3.5 text-emerald-600" />
                    Dia do Mês de Envio
                  </Label>
                  <Input
                    id="dia_envio"
                    type="number"
                    min={1}
                    max={31}
                    value={auditConfig.diaEnvio}
                    onChange={(e) =>
                      setAuditConfig((prev) => ({
                        ...prev,
                        diaEnvio: Math.max(1, Math.min(31, parseInt(e.target.value) || 1)),
                      }))
                    }
                    disabled={!isAdmin || saving}
                    className="text-xs bg-white font-mono h-9"
                  />
                  <p className="text-[10px] text-slate-500">
                    Dia 1 a 31 (último dia em meses curtos).
                  </p>
                </div>

                <div className="space-y-1">
                  <Label
                    htmlFor="hora_envio"
                    className="text-xs font-semibold text-slate-700 flex items-center gap-1"
                  >
                    <Clock className="w-3.5 h-3.5 text-emerald-600" />
                    Horário Referência
                  </Label>
                  <Input
                    id="hora_envio"
                    type="time"
                    value={auditConfig.horaEnvio}
                    onChange={(e) =>
                      setAuditConfig((prev) => ({ ...prev, horaEnvio: e.target.value }))
                    }
                    disabled={!isAdmin || saving}
                    className="text-xs bg-white font-mono h-9"
                  />
                  <p className="text-[10px] text-slate-500">Fuso: America/Sao_Paulo.</p>
                </div>

                <div className="space-y-1">
                  <Label
                    htmlFor="dias_retencao"
                    className="text-xs font-semibold text-rose-800 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    Retenção de Expurgo
                  </Label>
                  <Input
                    id="dias_retencao"
                    type="number"
                    min={1}
                    max={3650}
                    value={auditConfig.diasRetencao}
                    onChange={(e) =>
                      setAuditConfig((prev) => ({
                        ...prev,
                        diasRetencao: Math.max(1, parseInt(e.target.value) || 1),
                      }))
                    }
                    disabled={!isAdmin || saving}
                    className="text-xs bg-white font-mono h-9 border-rose-200"
                  />
                  <p className="text-[10px] text-rose-600">Apaga registros com mais de N dias.</p>
                </div>
              </div>

              {/* Status da última execução */}
              {latestJobInfo && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-500 shrink-0" />
                    <div>
                      <span className="font-semibold text-slate-800">
                        Última Execução Registrada:{' '}
                      </span>
                      <span className="font-mono text-[11px] text-slate-600">
                        {latestJobInfo.ano_mes}
                      </span>
                      <Badge
                        variant="outline"
                        className={`ml-2 text-[10px] py-0 px-1.5 ${
                          latestJobInfo.status === 'sucesso'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-rose-200 bg-rose-50 text-rose-700'
                        }`}
                      >
                        {latestJobInfo.status.toUpperCase()}
                      </Badge>
                      <p className="text-[11px] text-slate-500 mt-0.5">{latestJobInfo.mensagem}</p>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono shrink-0">
                    {new Date(latestJobInfo.data_execucao).toLocaleString('pt-BR')}
                  </span>
                </div>
              )}

              {/* Ações de Teste e Disparo Imediato */}
              {isAdmin && (
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSendTestAuditEmail}
                    disabled={sendingTestEmail || runningAuditJobNow}
                    className="w-full sm:w-auto text-xs font-medium gap-2 border-slate-300 hover:bg-slate-50"
                  >
                    {sendingTestEmail ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    Enviar Relatório Agora (PDF completo)
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRunAuditJobNow}
                    disabled={sendingTestEmail || runningAuditJobNow}
                    className="w-full sm:w-auto text-xs font-medium gap-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                  >
                    {runningAuditJobNow ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    Disparar Job Mensal Imediatamente (PDF + E-mail + Expurgo)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Bar (Salvar / Restaurar) */}
          {isAdmin && (
            <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRestoreDefaults}
                disabled={saving}
                className="w-full sm:w-auto text-xs font-medium gap-1.5 text-slate-600 hover:text-slate-900"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restaurar Padrões
              </Button>

              <Button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1.5 shadow-sm px-5"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Salvar Configurações
              </Button>
            </div>
          )}

          {/* Seção 3. Manutenção de Autores/Médiuns e Autor Espiritual */}
          <Card className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Users2 className="w-5 h-5 text-emerald-600" />
                    Manutenção de Autores, Médiuns & Autores Espirituais
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Gerencie a lista oficial de Autores/Médiuns e Autores Espirituais utilizada nos
                    formulários do acervo. A exclusão remove o nome da lista ativa sem apagar os
                    dados dos livros já cadastrados.
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="w-fit text-xs font-medium text-slate-600 bg-slate-50 border-slate-200"
                >
                  {authorsList.length} cadastrados
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Abas de visualização / filtro por tipo */}
              <Tabs
                value={selectedAuthorTab}
                onValueChange={(val: any) => setSelectedAuthorTab(val)}
                className="w-full"
              >
                <TabsList className="grid grid-cols-3 bg-slate-100 p-1 w-full sm:w-auto">
                  <TabsTrigger value="ALL" className="text-xs">
                    Todos ({authorsList.length})
                  </TabsTrigger>
                  <TabsTrigger value="ESPIRITO" className="text-xs">
                    <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-500" />
                    Espíritos ({authorsList.filter((a) => a.type === 'ESPIRITO').length})
                  </TabsTrigger>
                  <TabsTrigger value="MEDIUM_ENCARNADO" className="text-xs">
                    <UserCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                    Autores & Médiuns (
                    {
                      authorsList.filter(
                        (a) => a.type === 'MEDIUM' || a.type === 'ENCARNADO' || a.type === 'OUTRO',
                      ).length
                    }
                    )
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Formulário de Adicionar Autor / Médium / Espírito */}
              {isAdmin && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                  <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-emerald-600" />
                    Cadastrar Novo Nome na Lista
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-4">
                      <Select
                        value={newAuthorType}
                        onValueChange={(val: AuthorType) => setNewAuthorType(val)}
                      >
                        <SelectTrigger className="text-xs bg-white h-9">
                          <SelectValue placeholder="Tipo de Autoria" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ESPIRITO" className="text-xs">
                            <span className="flex items-center gap-1.5 font-medium text-amber-700">
                              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                              Autor Espiritual (Espírito)
                            </span>
                          </SelectItem>
                          <SelectItem value="MEDIUM" className="text-xs">
                            <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                              Médium / Psicografia
                            </span>
                          </SelectItem>
                          <SelectItem value="ENCARNADO" className="text-xs">
                            <span className="flex items-center gap-1.5 font-medium text-slate-700">
                              <Users2 className="w-3.5 h-3.5 text-slate-500" />
                              Autor Convencional
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="sm:col-span-6">
                      <Input
                        type="text"
                        placeholder={
                          newAuthorType === 'ESPIRITO'
                            ? 'Ex: Emmanuel, André Luiz, Joanna de Ângelis...'
                            : newAuthorType === 'MEDIUM'
                              ? 'Ex: Chico Xavier, Divaldo Franco...'
                              : 'Ex: Allan Kardec, Léon Denis...'
                        }
                        value={newAuthorName}
                        onChange={(e) => setNewAuthorName(e.target.value)}
                        disabled={addingAuthor}
                        className="text-xs bg-white h-9"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddAuthor(e)
                          }
                        }}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <Button
                        type="button"
                        onClick={handleAddAuthor}
                        disabled={addingAuthor || !newAuthorName.trim()}
                        size="sm"
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium gap-1 h-9"
                      >
                        {addingAuthor ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        Adicionar
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Busca Rápida na Lista */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Pesquisar autor, médium ou espírito por nome..."
                  value={authorSearchTerm}
                  onChange={(e) => setAuthorSearchTerm(e.target.value)}
                  className="pl-9 text-xs bg-white h-8"
                />
                {authorSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setAuthorSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Lista Filtrada de Autores */}
              {loadingAuthors ? (
                <div className="py-8 text-center flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  Carregando lista de autores e espíritos...
                </div>
              ) : (
                (() => {
                  const filtered = authorsList.filter((a) => {
                    // Filtro de aba
                    if (selectedAuthorTab === 'ESPIRITO' && a.type !== 'ESPIRITO') return false
                    if (
                      selectedAuthorTab === 'MEDIUM_ENCARNADO' &&
                      a.type !== 'MEDIUM' &&
                      a.type !== 'ENCARNADO' &&
                      a.type !== 'OUTRO'
                    ) {
                      return false
                    }
                    // Filtro de busca
                    if (authorSearchTerm.trim()) {
                      return a.name.toLowerCase().includes(authorSearchTerm.trim().toLowerCase())
                    }
                    return true
                  })

                  if (filtered.length === 0) {
                    return (
                      <div className="py-8 text-center text-xs text-slate-400 border border-dashed rounded-lg">
                        {authorSearchTerm
                          ? 'Nenhum resultado encontrado para a pesquisa.'
                          : 'Nenhum autor/espírito cadastrado nesta categoria.'}
                      </div>
                    )
                  }

                  return (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white max-h-96 overflow-y-auto">
                      {filtered.map((author) => {
                        const isEditing = editingAuthorId === author.id
                        const isSpirit = author.type === 'ESPIRITO'
                        const isMedium = author.type === 'MEDIUM'

                        return (
                          <div
                            key={author.id}
                            className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/70 transition-colors"
                          >
                            {isEditing ? (
                              <div className="flex items-center gap-2 flex-1">
                                <Input
                                  type="text"
                                  value={editingAuthorName}
                                  onChange={(e) => setEditingAuthorName(e.target.value)}
                                  disabled={savingAuthorEdit}
                                  className="text-xs h-8 bg-white"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      handleSaveEditAuthor(author)
                                    } else if (e.key === 'Escape') {
                                      handleCancelEditAuthor()
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleSaveEditAuthor(author)}
                                  disabled={savingAuthorEdit || !editingAuthorName.trim()}
                                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5"
                                  title="Salvar alterações"
                                >
                                  {savingAuthorEdit ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={handleCancelEditAuthor}
                                  disabled={savingAuthorEdit}
                                  className="h-8 text-xs text-slate-500 hover:text-slate-800 px-2"
                                  title="Cancelar edição"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2.5 min-w-0">
                                {isSpirit ? (
                                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                                ) : isMedium ? (
                                  <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                                ) : (
                                  <Users2 className="w-4 h-4 text-slate-400 shrink-0" />
                                )}
                                <span className="font-semibold text-xs text-slate-900 truncate">
                                  {author.name}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] py-0 px-1.5 font-normal ${
                                    isSpirit
                                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                                      : isMedium
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                        : 'border-slate-200 bg-slate-50 text-slate-600'
                                  }`}
                                >
                                  {isSpirit
                                    ? 'Espírito'
                                    : isMedium
                                      ? 'Médium'
                                      : 'Autor Convencional'}
                                </Badge>
                              </div>
                            )}

                            {!isEditing && isAdmin && (
                              <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleStartEditAuthor(author)}
                                  className="h-7 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 gap-1 px-2"
                                  title="Editar nome"
                                >
                                  <Edit2 className="w-3 h-3 text-slate-500" />
                                  Editar
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenDeleteAuthor(author)}
                                  className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 gap-1 px-2"
                                  title="Excluir da lista"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Excluir
                                </Button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()
              )}
            </CardContent>
          </Card>

          {/* Seção CRUD de Cursos da CEP */}
          <Card className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-emerald-600" />
                    Cursos da CEP
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Gerencie a lista de cursos frequentados pelos leitores da Casa Espírita. A
                    edição do nome do curso é refletida automaticamente nos leitores vinculados.
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="w-fit text-xs font-medium text-slate-600 bg-slate-50 border-slate-200"
                >
                  {cursosList.length} {cursosList.length === 1 ? 'curso' : 'cursos'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Formulário para Adicionar Novo Curso */}
              {isAdmin && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-emerald-600" />
                    Novo Curso da CEP
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="text"
                      placeholder="Ex: ESDE I, O Que é o Espiritismo, Evangelho no Lar..."
                      value={newCursoNome}
                      onChange={(e) => setNewCursoNome(e.target.value)}
                      disabled={addingCurso}
                      className="text-xs bg-white flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddCurso(e)
                        }
                      }}
                    />
                    <Button
                      type="button"
                      onClick={handleAddCurso}
                      disabled={addingCurso || !newCursoNome.trim()}
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium gap-1 shrink-0"
                    >
                      {addingCurso ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      Adicionar Curso
                    </Button>
                  </div>
                </div>
              )}

              {/* Lista de Cursos */}
              {loadingCursos ? (
                <div className="py-8 text-center flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  Carregando cursos da CEP...
                </div>
              ) : cursosList.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 border border-dashed rounded-lg">
                  Nenhum curso cadastrado no momento.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
                  {cursosList.map((c) => {
                    const isEditing = editingCursoId === c.id
                    return (
                      <div
                        key={c.id}
                        className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/70 transition-colors"
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-1">
                            <Input
                              type="text"
                              value={editingCursoNome}
                              onChange={(e) => setEditingCursoNome(e.target.value)}
                              disabled={savingCursoEdit}
                              className="text-xs h-8 bg-white"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleSaveEditCurso(c)
                                } else if (e.key === 'Escape') {
                                  handleCancelEditCurso()
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleSaveEditCurso(c)}
                              disabled={savingCursoEdit || !editingCursoNome.trim()}
                              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5"
                              title="Salvar alterações"
                            >
                              {savingCursoEdit ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={handleCancelEditCurso}
                              disabled={savingCursoEdit}
                              className="h-8 text-xs text-slate-500 hover:text-slate-800 px-2"
                              title="Cancelar edição"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5 min-w-0">
                            <GraduationCap className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="font-semibold text-xs text-slate-800 truncate">
                              {c.nome}
                            </span>
                          </div>
                        )}

                        {!isEditing && isAdmin && (
                          <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleStartEditCurso(c)}
                              className="h-7 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 gap-1 px-2"
                              title="Editar nome do curso"
                            >
                              <Edit2 className="w-3 h-3 text-slate-500" />
                              Editar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenDeleteCurso(c)}
                              className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 gap-1 px-2"
                              title="Excluir curso"
                            >
                              <Trash2 className="w-3 h-3" />
                              Excluir
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Seção CRUD de Categorias */}
          <Card className="border-slate-200 bg-white shadow-xs">
            {' '}
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Tag className="w-5 h-5 text-emerald-600" />
                    Categorias & Gêneros Literários
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Gerencie a lista oficial de categorias do acervo. A edição atualiza todos os
                    livros vinculados em cascata, e a exclusão desvincula a categoria dos livros sem
                    excluí-los.
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="w-fit text-xs font-medium text-slate-600 bg-slate-50 border-slate-200"
                >
                  {categories.length} {categories.length === 1 ? 'categoria' : 'categorias'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Formulário de Adicionar Categoria */}
              {isAdmin && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-emerald-600" />
                    Nova Categoria
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="text"
                      placeholder="Ex: Romance Espírita, Filosofia, Estudo..."
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      disabled={addingCategory}
                      className="text-xs bg-white flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddCategory(e)
                        }
                      }}
                    />
                    <Button
                      type="button"
                      onClick={handleAddCategory}
                      disabled={addingCategory || !newCategoryName.trim()}
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium gap-1 shrink-0"
                    >
                      {addingCategory ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      Adicionar Categoria
                    </Button>
                  </div>
                </div>
              )}

              {/* Lista de Categorias */}
              {loadingCategories ? (
                <div className="py-8 text-center flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  Carregando categorias...
                </div>
              ) : categories.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 border border-dashed rounded-lg">
                  Nenhuma categoria cadastrada no momento.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
                  {categories.map((cat) => {
                    const isEditing = editingCategoryId === cat.id
                    return (
                      <div
                        key={cat.id}
                        className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/70 transition-colors"
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-1">
                            <Input
                              type="text"
                              value={editingCategoryName}
                              onChange={(e) => setEditingCategoryName(e.target.value)}
                              disabled={savingCategoryEdit}
                              className="text-xs h-8 bg-white"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleSaveEditCategory(cat)
                                } else if (e.key === 'Escape') {
                                  handleCancelEditCategory()
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleSaveEditCategory(cat)}
                              disabled={savingCategoryEdit || !editingCategoryName.trim()}
                              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5"
                              title="Salvar alterações"
                            >
                              {savingCategoryEdit ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={handleCancelEditCategory}
                              disabled={savingCategoryEdit}
                              className="h-8 text-xs text-slate-500 hover:text-slate-800 px-2"
                              title="Cancelar edição"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-xs text-slate-800 truncate">
                              {cat.nome}
                            </span>
                          </div>
                        )}

                        {!isEditing && isAdmin && (
                          <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleStartEditCategory(cat)}
                              className="h-7 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 gap-1 px-2"
                              title="Editar nome da categoria"
                            >
                              <Edit2 className="w-3 h-3 text-slate-500" />
                              Editar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenDeleteCategory(cat)}
                              className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 gap-1 px-2"
                              title="Excluir categoria"
                            >
                              <Trash2 className="w-3 h-3" />
                              Excluir
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Maintenance & Integrity Routine */}
          <Card className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                Rotinas de Integridade & Verificação de Atrasos
              </CardTitle>
              <CardDescription className="text-xs">
                Dispare rotinas no banco de dados para recalcular atrasos e sincronizar o status dos
                empréstimos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    Recalcular Atrasos Imediatamente
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Executa a função{' '}
                    <code className="bg-slate-200 px-1 rounded font-mono text-[10px]">
                      verificar_atrasos_geral()
                    </code>{' '}
                    no Supabase.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleRunOverdueCheck}
                  disabled={runningRoutine || !isAdmin}
                  className="bg-gray-500 hover:bg-gray-600 text-white text-xs font-medium shrink-0"
                >
                  {runningRoutine ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  ) : (
                    <RotateCw className="w-3.5 h-3.5 mr-1" />
                  )}
                  Executar Verificação
                </Button>
              </div>

              <div className="bg-emerald-50/60 p-3.5 rounded-lg border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-[11px] leading-relaxed">
                  <p className="font-semibold text-emerald-950">Operação Institucional Gratuita</p>
                  <p>
                    A Biblioteca CEP não aplica multas financeiras. As configurações aqui
                    cadastradas regulam a rotatividade justa e o controle de devoluções.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </form>
      )}

      {/* Modal de Confirmação de Exclusão de Curso */}
      <ConfirmModal
        open={deleteCursoModalOpen}
        onOpenChange={setDeleteCursoModalOpen}
        title="Excluir Curso da CEP"
        description={
          cursoToDelete ? (
            <span>
              Tem certeza que deseja excluir o curso{' '}
              <strong className="text-rose-600 font-bold">"{cursoToDelete.nome}"</strong>? Ele será
              desvinculado dos leitores que atualmente o frequentam, mas os cadastros dos leitores
              serão mantidos intactos.
            </span>
          ) : (
            'Tem certeza que deseja excluir este curso?'
          )
        }
        confirmLabel="Sim, Excluir Curso"
        cancelLabel="Cancelar"
        variant="destructive"
        loading={deletingCurso}
        onConfirm={handleExecuteDeleteCurso}
      />

      {/* Modal de Confirmação de Exclusão de Categoria */}
      <ConfirmModal
        open={deleteCategoryModalOpen}
        onOpenChange={setDeleteCategoryModalOpen}
        title="Excluir Categoria"
        description={
          categoryToDelete ? (
            <span>
              Tem certeza que deseja excluir a categoria{' '}
              <strong className="text-rose-600 font-bold">"{categoryToDelete.nome}"</strong>? Os
              títulos vinculados a ela não serão apagados, mas ficarão com a categoria em
              branco/desvinculada.
            </span>
          ) : (
            'Tem certeza que deseja excluir esta categoria?'
          )
        }
        confirmLabel="Sim, Excluir Categoria"
        cancelLabel="Cancelar"
        variant="destructive"
        loading={deletingCategory}
        onConfirm={handleExecuteDeleteCategory}
      />

      {/* Modal de Confirmação e Alerta de Livros Vinculados ao Excluir Autor/Médium/Espírito */}
      <ConfirmModal
        open={deleteAuthorModalOpen}
        onOpenChange={setDeleteAuthorModalOpen}
        title="Excluir da Lista de Autores"
        description={
          authorToDelete ? (
            <div className="space-y-3">
              <p>
                Tem certeza que deseja remover{' '}
                <strong className="text-rose-600 font-bold">"{authorToDelete.name}"</strong> da
                lista de {authorToDelete.type === 'ESPIRITO' ? 'espíritos' : 'autores/médiuns'}?
              </p>

              {checkingLinkedBooks ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando livros vinculados no
                  acervo...
                </div>
              ) : linkedBooksAlert.length > 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-amber-950">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Atenção: Este nome está sendo utilizado em {linkedBooksAlert.length} livro(s)
                      cadastrado(s):
                    </span>
                  </div>
                  <div className="max-h-36 overflow-y-auto divide-y divide-amber-200/60 bg-white/80 p-2 rounded border border-amber-200/80">
                    {linkedBooksAlert.map((book) => (
                      <div
                        key={book.id_titulo}
                        className="py-1 text-[11px] flex items-center justify-between gap-2"
                      >
                        <span className="font-medium text-slate-900 truncate">
                          • {book.titulo_de_livro}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500 shrink-0">
                          [{book.id_titulo}]
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-amber-800 leading-tight">
                    <strong>Nota:</strong> A exclusão removerá o nome da lista ativa de sugestões. O
                    cadastro dos livros existentes <u>NÃO</u> será apagado. Caso um desses livros
                    seja editado futuramente, o sistema solicitará a escolha de um nome válido da
                    lista.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Nenhum livro no acervo está vinculado diretamente a este nome no momento.
                </p>
              )}
            </div>
          ) : (
            'Tem certeza que deseja excluir?'
          )
        }
        confirmLabel="Sim, Excluir da Lista"
        cancelLabel="Cancelar"
        variant="destructive"
        loading={deletingAuthor}
        onConfirm={handleExecuteDeleteAuthor}
      />
    </div>
  )
}
