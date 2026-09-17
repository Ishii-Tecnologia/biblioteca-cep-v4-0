import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { TitulosService, TituloWithStats, Titulo, TotaisAcervo } from '@/services/titulos'
import { ExemplaresService } from '@/services/exemplares'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BookOpen,
  Search,
  PlusCircle,
  Layers,
  Edit2,
  Trash2,
  BookmarkCheck,
  Repeat,
  Loader2,
  Filter,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  UploadCloud,
  ZoomIn,
  Wrench,
  Library,
  Layers2,
  Sparkles,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { useIsMobile } from '@/hooks/use-mobile'
import { BookFormModal } from '@/components/BookFormModal'
import { CopiesModal } from '@/components/CopiesModal'
import { LoanModal } from '@/components/LoanModal'
import { ReserveModal } from '@/components/ReserveModal'
import { CsvImportModal } from '@/components/CsvImportModal'
import { BookCoverLightboxModal } from '@/components/BookCoverLightboxModal'
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Barcode, Camera } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useHeaderCounters } from '@/hooks/use-header-counters'

interface BookSinopseProps {
  sinopse: string
}

function BookSinopse({ sinopse }: BookSinopseProps) {
  const isMobile = useIsMobile()
  const [expanded, setExpanded] = useState(false)

  if (isMobile) {
    return (
      <div className="space-y-1">
        <p
          onClick={() => setExpanded(!expanded)}
          className={`text-xs text-slate-600 leading-relaxed bg-slate-50/50 p-2 rounded border border-slate-100 italic select-none cursor-pointer transition-colors hover:bg-slate-100/70 ${
            expanded ? '' : 'line-clamp-3'
          }`}
        >
          {sinopse}
        </p>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] font-medium text-[#136b77] hover:underline flex items-center gap-0.5 px-0.5"
        >
          {expanded ? (
            <>
              Ler menos <ChevronUp className="w-3 h-3" />
            </>
          ) : (
            <>
              Ler mais <ChevronDown className="w-3 h-3" />
            </>
          )}
        </button>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed bg-slate-50/50 p-2 rounded border border-slate-100 italic cursor-default">
            {sinopse}
          </p>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          className="max-w-xs sm:max-w-md bg-[#136b77] text-white border-none p-3 text-xs leading-relaxed shadow-xl rounded-lg font-normal break-words z-50"
        >
          {sinopse}
          <TooltipPrimitive.Arrow className="fill-[#136b77] w-3 h-1.5" />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export interface AcervoProps {
  colecao?: 'geral' | 'diretoria'
}

export default function Acervo({ colecao = 'geral' }: AcervoProps) {
  const isDiretoria = colecao === 'diretoria'
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') || ''
  const initialStatus = searchParams.get('status') || 'all'

  const { isOperadorOrAdmin, isDiretoriaOrAdmin, isAdmin, user, profile } = useAuth()
  const canManage = isDiretoria ? isDiretoriaOrAdmin : isOperadorOrAdmin
  const { toast } = useToast()
  const { refreshCounters } = useHeaderCounters()

  const [books, setBooks] = useState<TituloWithStats[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [totais, setTotais] = useState<TotaisAcervo | null>(null)
  const [loading, setLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>(initialStatus)

  // Modals state
  const [bookModalOpen, setBookModalOpen] = useState(false)
  const [bookToEdit, setBookToEdit] = useState<Titulo | null>(null)
  const [barcodeSearchOpen, setBarcodeSearchOpen] = useState(false)
  const [csvImportModalOpen, setCsvImportModalOpen] = useState(false)

  // Lightbox Zoom modal state (F-05)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxBook, setLightboxBook] = useState<{
    title: string
    author?: string
    coverUrl?: string | null
  } | null>(null)

  const [copiesModalOpen, setCopiesModalOpen] = useState(false)
  const [selectedBookForCopies, setSelectedBookForCopies] = useState<TituloWithStats | null>(null)

  const [loanModalOpen, setLoanModalOpen] = useState(false)
  const [preSelectedExemplar, setPreSelectedExemplar] = useState<string>('')

  const [reserveModalOpen, setReserveModalOpen] = useState(false)
  const [preSelectedTitulo, setPreSelectedTitulo] = useState<string>('')

  // Delete confirm modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [bookToDelete, setBookToDelete] = useState<{
    id_titulo: string
    title: string
    total_exemplares?: number
    exemplares_disponiveis?: number
  } | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const loadBooks = async () => {
    setLoading(true)
    try {
      const [booksData, catsData, totaisData] = await Promise.all([
        TitulosService.getAll(searchQuery, selectedCategory, true, selectedStatus, colecao),
        TitulosService.getCategories(),
        TitulosService.getTotais(colecao),
      ])
      setBooks(booksData)
      setCategories(catsData)
      setTotais(totaisData)
      refreshCounters()
    } catch (err: any) {
      toast({
        title: isDiretoria ? 'Erro ao carregar acervo da diretoria' : 'Erro ao carregar acervo',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // Sincronizar parâmetros de URL com os estados se mudarem externamente
  useEffect(() => {
    const q = searchParams.get('q') || ''
    const s = searchParams.get('status') || 'all'
    setSearchQuery(q)
    setSelectedStatus(s)
  }, [searchParams])

  useEffect(() => {
    loadBooks()
  }, [selectedCategory, selectedStatus, colecao])

  const updateFiltersUrl = (newQuery?: string, newCategory?: string, newStatus?: string) => {
    const nextParams: Record<string, string> = {}
    const finalQ = newQuery !== undefined ? newQuery : searchQuery
    const finalS = newStatus !== undefined ? newStatus : selectedStatus

    if (finalQ.trim()) nextParams.q = finalQ.trim()
    if (finalS && finalS !== 'all') nextParams.status = finalS

    setSearchParams(nextParams)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateFiltersUrl(searchQuery, selectedCategory, selectedStatus)
    loadBooks()
  }

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status)
    updateFiltersUrl(undefined, undefined, status)
  }

  const handleClearFilters = () => {
    setSearchQuery('')
    setSelectedCategory('all')
    setSelectedStatus('all')
    setSearchParams({})
  }

  const handleEditBook = (book: TituloWithStats) => {
    setBookToEdit(book)
    setBookModalOpen(true)
  }

  const handleNewBook = () => {
    setBookToEdit(null)
    setBookModalOpen(true)
  }

  const handleOpenCopies = (book: TituloWithStats) => {
    setSelectedBookForCopies(book)
    setCopiesModalOpen(true)
  }

  const handleOpenLoan = async (book: TituloWithStats) => {
    try {
      const copies = await ExemplaresService.getByTitulo(book.id_titulo)
      const availableCopy = copies.find((c: any) => c.status === 'Disponivel')
      if (availableCopy) {
        setPreSelectedExemplar(availableCopy.id_exemplar)
      } else {
        setPreSelectedExemplar('')
      }
    } catch {
      setPreSelectedExemplar('')
    }
    setLoanModalOpen(true)
  }

  const handleOpenLightbox = (book: TituloWithStats) => {
    setLightboxBook({
      title: book.titulo_de_livro,
      author: book.autor_formatado || book.autor,
      coverUrl: book.capa_url,
    })
    setLightboxOpen(true)
  }

  const handleDeleteBook = (book: TituloWithStats) => {
    // Validação preventiva: todos os exemplares precisam estar disponíveis
    if (book.total_exemplares > 0 && book.exemplares_disponiveis !== book.total_exemplares) {
      toast({
        title: 'Não é possível excluir este título',
        description: `O livro possui exemplares emprestados ou em manutenção (${book.exemplares_disponiveis} de ${book.total_exemplares} disponíveis). Todos os exemplares devem estar disponíveis.`,
        variant: 'destructive',
      })
      return
    }

    setBookToDelete({
      id_titulo: book.id_titulo,
      title: book.titulo_de_livro,
      total_exemplares: book.total_exemplares,
      exemplares_disponiveis: book.exemplares_disponiveis,
    })
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDeleteBook = async () => {
    if (!bookToDelete) return
    setDeleteLoading(true)
    try {
      const operadorInfo = {
        nome: profile?.nome || profile?.full_name || profile?.email || user?.email || 'Operador',
        id: user?.id || profile?.id,
      }
      await TitulosService.delete(bookToDelete.id_titulo, operadorInfo)
      toast({
        title: 'Livro excluído com sucesso',
        description: `O título "${bookToDelete.title}" (${bookToDelete.id_titulo}) e seus exemplares foram removidos do acervo.`,
      })
      setDeleteConfirmOpen(false)
      setBookToDelete(null)
      await loadBooks()
    } catch (err: any) {
      let friendlyMessage =
        err?.message || 'Verifique se não há empréstimos ou reservas ativas vinculadas.'
      if (friendlyMessage.includes('violates foreign key constraint "exemplar_id_titulo_fkey"')) {
        friendlyMessage =
          'Não foi possível excluir os exemplares vinculados a este livro. Verifique dependências.'
      }
      toast({
        title: 'Não foi possível excluir',
        description: friendlyMessage,
        variant: 'destructive',
      })
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleDirectReserve = (id_titulo: string) => {
    setPreSelectedTitulo(id_titulo)
    setReserveModalOpen(true)
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <BookOpen
                className={`w-6 h-6 ${isDiretoria ? 'text-amber-600' : 'text-emerald-600'}`}
              />
              {isDiretoria ? 'Biblioteca Rino Curti' : 'Biblioteca Cecíclia Braga'}
            </h1>
            {isDiretoria && (
              <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-semibold text-xs">
                Coleção Rino Curti
              </Badge>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {isDiretoria
              ? 'Acervo exclusivo da diretoria: obras, apostilas e documentos internos com controle de exemplares.'
              : 'Consulte a disponibilidade de exemplares, gerencie cópias físicas e realize empréstimos.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botão de Leitura de Código de Barras / Câmera */}
          <Button
            onClick={() => setBarcodeSearchOpen(true)}
            variant="outline"
            className="border-slate-300 text-slate-700 hover:bg-slate-50 font-medium gap-1.5 shadow-xs text-xs sm:text-sm"
            title="Escanear código de barras pela câmera do celular para localizar ou cadastrar livro"
          >
            <Barcode className="w-4 h-4 text-slate-600" />
            <span className="hidden xs:inline">Escanear</span> Código de Barras
          </Button>

          {canManage && (
            <>
              <Button
                onClick={() => setCsvImportModalOpen(true)}
                variant="outline"
                className="border-primary/40 text-primary hover:bg-primary/10 font-medium gap-2 shadow-xs text-xs sm:text-sm"
              >
                <UploadCloud className="w-4 h-4" />
                <span className="hidden sm:inline">Importar CSV</span>
                <span className="sm:hidden">CSV</span>
              </Button>
              <Button
                onClick={handleNewBook}
                className={`${isDiretoria ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'} text-white font-medium gap-2 shadow-sm text-xs sm:text-sm`}
              >
                <PlusCircle className="w-4 h-4" />
                <span>{isDiretoria ? 'Novo Livro / Doc' : 'Novo Livro'}</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Painel de Totais (F-10) */}
      {totais && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Card className="border-slate-200 shadow-2xs bg-white">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                <Library className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  Títulos Únicos
                </p>
                <p className="text-xl font-bold text-slate-900">{totais.totalTitulos}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-2xs bg-white">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                <Layers2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  Total de Exemplares
                </p>
                <p className="text-xl font-bold text-slate-900">{totais.totalExemplares}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-2xs bg-white">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  Disponíveis
                </p>
                <p className="text-xl font-bold text-emerald-600">{totais.totalDisponiveis}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-2xs bg-white">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
                <Repeat className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  Emprestados
                </p>
                <p className="text-xl font-bold text-amber-600">{totais.totalEmprestados}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-2xs bg-white col-span-2 sm:col-span-1">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  Em Manutenção
                </p>
                <p className="text-xl font-bold text-rose-600">{totais.totalManutencao}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter and Search Bar */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar por título, autor, espírito, médium, ISBN ou código (Ex: MC-001)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs sm:text-sm"
              />
            </div>

            <div className="w-full sm:w-48">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="text-xs">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Filter className="w-3.5 h-3.5 text-emerald-600" />
                    <SelectValue placeholder="Todas as categorias" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Categorias</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full sm:w-48">
              <Select value={selectedStatus} onValueChange={handleStatusChange}>
                <SelectTrigger className="text-xs">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Wrench className="w-3.5 h-3.5 text-rose-600" />
                    <SelectValue placeholder="Todos os Status" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="Manutencao">Em Manutenção</SelectItem>
                  <SelectItem value="Disponivel">Disponíveis</SelectItem>
                  <SelectItem value="Emprestado">Emprestados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-5"
              >
                Pesquisar
              </Button>

              {(searchQuery || selectedCategory !== 'all' || selectedStatus !== 'all') && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClearFilters}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  Limpar
                </Button>
              )}
            </div>
          </form>

          {/* Active filter tags/pills */}
          {(selectedStatus !== 'all' || selectedCategory !== 'all' || searchQuery) && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
              <span className="text-slate-500 font-medium text-[11px]">Filtros ativos:</span>
              {selectedStatus !== 'all' && (
                <Badge
                  variant="outline"
                  className="bg-rose-50 text-rose-700 border-rose-200 gap-1 font-medium cursor-pointer"
                  onClick={() => handleStatusChange('all')}
                >
                  <Wrench className="w-3 h-3" />
                  {selectedStatus === 'Manutencao' || selectedStatus === 'manutencao'
                    ? 'Status: Em Manutenção'
                    : `Status: ${selectedStatus}`}
                  <span className="ml-1 text-rose-400 font-bold hover:text-rose-900">×</span>
                </Badge>
              )}
              {selectedCategory !== 'all' && (
                <Badge
                  variant="outline"
                  className="bg-slate-100 text-slate-700 border-slate-200 gap-1 font-medium cursor-pointer"
                  onClick={() => setSelectedCategory('all')}
                >
                  Categoria: {selectedCategory}
                  <span className="ml-1 text-slate-400 font-bold hover:text-slate-900">×</span>
                </Badge>
              )}
              {searchQuery && (
                <Badge
                  variant="outline"
                  className="bg-slate-100 text-slate-700 border-slate-200 gap-1 font-medium cursor-pointer"
                  onClick={() => {
                    setSearchQuery('')
                    updateFiltersUrl('', undefined, undefined)
                  }}
                >
                  Busca: "{searchQuery}"
                  <span className="ml-1 text-slate-400 font-bold hover:text-slate-900">×</span>
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results view */}
      {loading ? (
        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="text-xs text-slate-500 font-medium">
            Buscando títulos no banco de dados...
          </p>
        </div>
      ) : books.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 p-12 text-center bg-slate-50/50">
          <div className="max-w-md mx-auto space-y-3">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-semibold text-slate-800">Nenhum livro encontrado</h3>
            <p className="text-xs text-slate-500">
              Não encontramos nenhum título correspondente à sua pesquisa. Tente usar outros termos
              ou limpe o filtro.
            </p>
            {canManage && (
              <Button
                onClick={handleNewBook}
                size="sm"
                className={`${isDiretoria ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'} text-white text-xs mt-2`}
              >
                {isDiretoria ? 'Cadastrar na Diretoria Agora' : 'Cadastrar este Livro Agora'}
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {books.map((book) => {
            const hasAvailable = book.exemplares_disponiveis > 0
            const hasCover = !!book.capa_url

            return (
              <Card
                key={book.id_titulo}
                className="overflow-hidden border-slate-200 hover:border-slate-300 hover:shadow-md transition-all flex flex-col justify-between group bg-white"
              >
                <div className="p-5 space-y-3">
                  {/* Top Bar: Code & Category */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-200">
                      {book.id_titulo}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[11px] font-normal bg-slate-100 text-slate-600"
                    >
                      {book.categoria || 'Geral'}
                    </Badge>
                  </div>

                  {/* Book Body: Cover with Zoom + Title & Author (F-04 e F-05) */}
                  <div className="flex items-start gap-3">
                    <div
                      onClick={() => handleOpenLightbox(book)}
                      className={`w-14 h-20 rounded border overflow-hidden shrink-0 shadow-2xs relative group/cover cursor-pointer transition-transform hover:scale-105 ${
                        hasCover
                          ? 'bg-slate-100 border-slate-200'
                          : 'bg-slate-100 border-slate-200 flex items-center justify-center text-slate-400'
                      }`}
                      title="Clique para ampliar a foto da capa"
                    >
                      {hasCover ? (
                        <img
                          src={book.capa_url!}
                          alt={book.titulo_de_livro}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <BookOpen className="w-6 h-6 stroke-[1.2]" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cover:opacity-100 flex items-center justify-center text-white transition-opacity">
                        <ZoomIn className="w-4 h-4" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-1.5">
                        {isAdmin && (
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50 shrink-0 -mt-0.5"
                                    disabled={
                                      book.total_exemplares > 0 &&
                                      book.exemplares_disponiveis !== book.total_exemplares
                                    }
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDeleteBook(book)
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {book.total_exemplares > 0 &&
                                book.exemplares_disponiveis !== book.total_exemplares
                                  ? 'Só é possível excluir quando todos os exemplares estiverem disponíveis'
                                  : `Excluir "${book.titulo_de_livro}" do acervo`}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <h2 className="font-bold text-slate-900 text-base leading-snug group-hover:text-emerald-700 transition-colors line-clamp-2">
                          {book.titulo_de_livro}
                        </h2>
                      </div>

                      {/* Exibição formatada do Autor / Espírito / Médium (F-04) */}
                      <p className="text-xs font-semibold text-slate-700 mt-1 flex items-center gap-1 flex-wrap">
                        {book.autor_espiritual && (
                          <Sparkles className="w-3 h-3 text-amber-500 shrink-0 inline" />
                        )}
                        <span>{book.autor_formatado || book.autor}</span>
                      </p>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 mt-2">
                        {book.editora && <span>Ed: {book.editora}</span>}
                        {book.ano_publicacao && <span>Ano: {book.ano_publicacao}</span>}
                        {book.isbn && <span className="font-mono">ISBN: {book.isbn}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Sinopse */}
                  {book.sinopse && book.sinopse.trim() !== '' && (
                    <BookSinopse sinopse={book.sinopse} />
                  )}

                  {/* Stock Status Pill (F-03) */}
                  <div className="pt-2">
                    <div
                      className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                        hasAvailable
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                          : book.exemplares_manutencao > 0 &&
                              book.total_exemplares === book.exemplares_manutencao
                            ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                            : 'bg-amber-50/70 border-amber-200 text-amber-900'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-medium">
                        {hasAvailable ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>{book.exemplares_disponiveis} exemplar(es) disponível(is)</span>
                          </>
                        ) : book.exemplares_manutencao > 0 &&
                          book.total_exemplares === book.exemplares_manutencao ? (
                          <>
                            <Wrench className="w-4 h-4 text-rose-600" />
                            <span>Exemplar(es) em manutenção</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-amber-600" />
                            <span>Todos os exemplares emprestados</span>
                          </>
                        )}
                      </div>
                      <span className="text-[11px] font-semibold opacity-75">
                        Total: {book.total_exemplares}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions Bar (F-08: Ícone de Reserva ao lado de Emprestar) */}
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs font-medium text-slate-700 hover:bg-slate-200/70 gap-1.5"
                      onClick={() => handleOpenCopies(book)}
                    >
                      <Layers className="w-3.5 h-3.5 text-emerald-600" />
                      Exemplares ({book.total_exemplares})
                    </Button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {hasAvailable ? (
                      canManage ? (
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1"
                          onClick={() => handleOpenLoan(book)}
                        >
                          <Repeat className="w-3.5 h-3.5" />
                          Emprestar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs border-emerald-300 bg-emerald-50/50 text-emerald-800 hover:bg-emerald-50/50 hover:text-emerald-800 gap-1 cursor-default"
                          onClick={() => {
                            toast({
                              title: isDiretoria
                                ? 'Disponível na Diretoria'
                                : 'Disponível na Biblioteca',
                              description: `Solicite a retirada física da obra "${book.titulo_de_livro}" (${book.id_titulo}) junto à administração/diretoria.`,
                            })
                          }}
                        >
                          Disponível
                        </Button>
                      )
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 font-medium gap-1.5 shadow-2xs"
                        onClick={() => handleDirectReserve(book.id_titulo)}
                        title="Reservar obra quando todos os exemplares estiverem ocupados"
                      >
                        <BookmarkCheck className="w-3.5 h-3.5 text-amber-700" />
                        Reservar
                      </Button>
                    )}

                    {canManage && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-slate-500 hover:text-slate-900"
                        onClick={() => handleEditBook(book)}
                        title="Editar livro"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modals */}
      <BookFormModal
        isOpen={bookModalOpen}
        onClose={() => {
          setBookModalOpen(false)
          setBookToEdit(null)
        }}
        bookToEdit={bookToEdit}
        onSuccess={loadBooks}
        categories={categories}
        colecao={colecao}
      />

      <BarcodeScannerModal
        open={barcodeSearchOpen}
        onOpenChange={setBarcodeSearchOpen}
        onBookFound={(book) => {
          // Quando encontrado, preenche busca ou se operador abre cadastro
          setSearchQuery(book.isbn || book.titulo_de_livro)
          updateFiltersUrl(book.isbn || book.titulo_de_livro, undefined, undefined)
          loadBooks()
          toast({
            title: 'ISBN Localizado',
            description: `Buscando "${book.titulo_de_livro}" no acervo...`,
          })
        }}
      />

      <CsvImportModal
        isOpen={csvImportModalOpen}
        onClose={() => setCsvImportModalOpen(false)}
        onSuccess={loadBooks}
        operatorName={user?.user_metadata?.name || user?.email || 'Administrador'}
        colecao={colecao}
      />

      <BookCoverLightboxModal
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        title={lightboxBook?.title || ''}
        author={lightboxBook?.author}
        coverUrl={lightboxBook?.coverUrl}
      />

      <CopiesModal
        isOpen={copiesModalOpen}
        onClose={() => setCopiesModalOpen(false)}
        book={selectedBookForCopies}
        onUpdate={loadBooks}
      />

      <LoanModal
        open={loanModalOpen}
        onOpenChange={setLoanModalOpen}
        preSelectedExemplarId={preSelectedExemplar}
        onSuccess={loadBooks}
      />

      <ReserveModal
        open={reserveModalOpen}
        onOpenChange={setReserveModalOpen}
        preSelectedTituloId={preSelectedTitulo}
        onSuccess={loadBooks}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Remover Livro do Acervo"
        description={
          <div className="space-y-2 text-xs sm:text-sm">
            <p>Deseja realmente remover a obra:</p>
            <p className="text-rose-600 font-semibold break-words">
              "{bookToDelete?.title}" ({bookToDelete?.id_titulo})
            </p>
            {bookToDelete?.total_exemplares !== undefined && bookToDelete.total_exemplares > 0 && (
              <p className="text-slate-600 bg-amber-50 p-2 rounded border border-amber-200">
                Atenção: todos os{' '}
                <span className="font-semibold">{bookToDelete.total_exemplares} exemplar(es)</span>{' '}
                vinculados a esta obra também serão excluídos definitivamente do acervo.
              </p>
            )}
            <p className="text-slate-500">Esta ação não pode ser desfeita.</p>
          </div>
        }
        confirmLabel="Sim, Remover Livro"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleConfirmDeleteBook}
      />
    </div>
  )
}
