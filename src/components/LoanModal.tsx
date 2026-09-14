import React, { useState, useEffect } from 'react'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmprestimosService } from '@/services/emprestimos'
import { ExemplaresService, ExemplarWithTitulo } from '@/services/exemplares'
import { LeitoresService, Leitor } from '@/services/leitores'
import { getPrazoEmprestimoDias, getPrazoRenovacaoDias } from '@/services/parametros'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import { Repeat, Loader2, Book, UserCheck, AlertCircle, Calendar } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface LoanModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preSelectedExemplarId?: string
  preSelectedLeitorId?: number
  onSuccess: () => void
}

export function LoanModal({
  open,
  onOpenChange,
  preSelectedExemplarId,
  preSelectedLeitorId,
  onSuccess,
}: LoanModalProps) {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(false)

  const [availableExemplares, setAvailableExemplares] = useState<ExemplarWithTitulo[]>([])
  const [activeReaders, setActiveReaders] = useState<Leitor[]>([])

  const [selectedExemplar, setSelectedExemplar] = useState<string>('')
  const [selectedLeitor, setSelectedLeitor] = useState<string>('')
  const [searchCopy, setSearchCopy] = useState('')
  const [searchReader, setSearchReader] = useState('')
  const [prazoDias, setPrazoDias] = useState<number>(15)
  const [prazoRenovacaoDias, setPrazoRenovacaoDias] = useState<number>(15)

  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open])

  useEffect(() => {
    if (preSelectedExemplarId) {
      setSelectedExemplar(preSelectedExemplarId)
    }
    if (preSelectedLeitorId) {
      setSelectedLeitor(String(preSelectedLeitorId))
    }
  }, [preSelectedExemplarId, preSelectedLeitorId, open])

  const loadData = async () => {
    setLoadingData(true)
    try {
      const [copies, readers, prazo, prazoRenov] = await Promise.all([
        ExemplaresService.getAll('Disponivel'),
        LeitoresService.getAll(),
        getPrazoEmprestimoDias(),
        getPrazoRenovacaoDias(),
      ])
      setAvailableExemplares(copies)
      setActiveReaders(readers.filter((r) => !r.bloqueado))
      setPrazoDias(prazo)
      setPrazoRenovacaoDias(prazoRenov)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar dados',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoadingData(false)
    }
  }

  const selectedCopyObj = availableExemplares.find((e) => e.id_exemplar === selectedExemplar)
  const selectedReaderObj = activeReaders.find((r) => String(r.id_leitor) === selectedLeitor)

  // Validação de acesso à Diretoria
  const isCopyDiretoria =
    selectedCopyObj?.titulo?.colecao === 'diretoria' ||
    (selectedCopyObj as any)?.colecao === 'diretoria'
  const readerHasDiretoriaAccess = Boolean(selectedReaderObj?.acesso_diretoria)
  const isDiretoriaBlocked = isCopyDiretoria && !readerHasDiretoriaAccess

  const filteredCopies = availableExemplares.filter((copy) => {
    if (!searchCopy.trim()) return true
    const q = searchCopy.toLowerCase()
    const copyId = copy.id_exemplar.toLowerCase()
    const title = copy.titulo?.titulo_de_livro?.toLowerCase() || ''
    const author = copy.titulo?.autor?.toLowerCase() || ''
    return copyId.includes(q) || title.includes(q) || author.includes(q)
  })

  const filteredReaders = activeReaders.filter((reader) => {
    if (!searchReader.trim()) return true
    const q = searchReader.toLowerCase()
    const name = reader.nome_do_leitor.toLowerCase()
    const email = reader.email.toLowerCase()
    const cpf = (reader.cpf || '').toLowerCase()
    return name.includes(q) || email.includes(q) || cpf.includes(q)
  })

  const expectedDate = new Date()
  expectedDate.setDate(expectedDate.getDate() + prazoDias)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedExemplar || !selectedLeitor) {
      toast({
        title: 'Seleção incompleta',
        description: 'Selecione um exemplar disponível e um leitor cadastrado.',
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

    setLoading(true)
    try {
      const operatorName = profile?.full_name || 'Operador'
      await EmprestimosService.createLoan(selectedExemplar, Number(selectedLeitor), operatorName)

      toast({
        title: 'Empréstimo registrado!',
        description: `Exemplar ${selectedExemplar} emprestado para ${selectedReaderObj?.nome_do_leitor || 'Leitor'}. Devolução em ${prazoDias} dias.`,
      })

      // Reset selection state
      setSelectedExemplar('')
      setSelectedLeitor('')
      setSearchCopy('')
      setSearchReader('')

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      toast({
        title: 'Falha no empréstimo',
        description: err.message || 'Não foi possível registrar o empréstimo.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Repeat className="w-5 h-5 text-emerald-600" />
              Registrar Novo Empréstimo
            </DialogTitle>
            <DialogDescription>
              Selecione o exemplar físico e o leitor. O prazo padrão é de {prazoDias} dias corridos
              sem custo.
            </DialogDescription>
          </DialogHeader>

          {loadingData ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <span className="text-xs">Carregando exemplares e leitores...</span>
            </div>
          ) : (
            <div className="grid gap-4 py-4">
              {/* Exemplar Selection */}
              <div>
                <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Book className="w-3.5 h-3.5 text-emerald-600" />
                    Exemplar Disponível *
                  </span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    {availableExemplares.length} exemplares disponíveis
                  </span>
                </Label>

                <div className="mt-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Input
                      placeholder="Filtrar livro por título, autor ou código..."
                      value={searchCopy}
                      onChange={(e) => setSearchCopy(e.target.value)}
                      className="w-2/3 text-xs h-8"
                    />
                    {searchCopy.trim() && (
                      <span className="text-[11px] font-medium text-slate-500">
                        {filteredCopies.length === 0
                          ? 'Nenhum exemplar encontrado'
                          : filteredCopies.length === 1
                            ? '1 exemplar encontrado'
                            : `${filteredCopies.length} exemplares encontrados`}
                      </span>
                    )}
                  </div>
                  <Select value={selectedExemplar} onValueChange={setSelectedExemplar}>
                    <SelectTrigger className="w-full text-xs rounded-none bg-slate-100 hover:bg-slate-200/80 border-slate-300 text-slate-800 transition-colors">
                      <SelectValue placeholder="Digite no filtro acima e clique aqui para buscar..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 rounded-none bg-white border-slate-300 shadow-md">
                      {filteredCopies.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-500">
                          {searchCopy.trim()
                            ? 'Nenhum exemplar disponível encontrado para a busca.'
                            : 'Digite no filtro acima e clique aqui para buscar...'}
                        </div>
                      ) : (
                        filteredCopies.map((copy) => (
                          <SelectItem
                            key={copy.id_exemplar}
                            value={copy.id_exemplar}
                            className="text-xs"
                          >
                            <span className="font-mono font-semibold text-emerald-700 mr-2">
                              [{copy.id_exemplar}]
                            </span>
                            <span className="font-medium text-slate-800">
                              {copy.titulo?.titulo_de_livro}
                            </span>
                            <span className="text-slate-500 ml-1">({copy.titulo?.autor})</span>
                            {copy.localizacao && (
                              <span className="text-[10px] text-slate-400 block sm:inline sm:ml-2">
                                • {copy.localizacao}
                              </span>
                            )}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Reader Selection */}
              <div>
                <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Leitor / Usuário *
                  </span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    {activeReaders.length} leitores ativos
                  </span>
                </Label>

                <div className="mt-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Input
                      placeholder="Filtrar por nome, email ou CPF..."
                      value={searchReader}
                      onChange={(e) => setSearchReader(e.target.value)}
                      className="w-2/3 text-xs h-8"
                    />
                    {searchReader.trim() && (
                      <span className="text-[11px] font-medium text-slate-500">
                        {filteredReaders.length === 0
                          ? 'Nenhum leitor encontrado'
                          : filteredReaders.length === 1
                            ? '1 leitor encontrado'
                            : `${filteredReaders.length} leitores encontrados`}
                      </span>
                    )}
                  </div>
                  <Select value={selectedLeitor} onValueChange={setSelectedLeitor}>
                    <SelectTrigger className="w-full text-xs rounded-none bg-slate-100 hover:bg-slate-200/80 border-slate-300 text-slate-800 transition-colors">
                      <SelectValue placeholder="Digite no filtro acima e clique aqui para buscar..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 rounded-none bg-white border-slate-300 shadow-md">
                      {filteredReaders.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-500">
                          {searchReader.trim()
                            ? 'Nenhum leitor ativo encontrado para a busca.'
                            : 'Digite no filtro acima e clique aqui para buscar...'}
                        </div>
                      ) : (
                        filteredReaders.map((reader) => (
                          <SelectItem
                            key={reader.id_leitor}
                            value={String(reader.id_leitor)}
                            className="text-xs"
                          >
                            <span className="font-semibold text-slate-800">
                              {reader.nome_do_leitor}
                            </span>
                            <span className="text-slate-500 ml-2">({reader.email})</span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Loan terms preview */}
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-2">
                <div className="flex items-center justify-between text-slate-700 font-medium">
                  <span className="flex items-center gap-1 text-slate-600">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    Data de Empréstimo:
                  </span>
                  <span>{formatDate(new Date())}</span>
                </div>
                <div className="flex items-center justify-between text-emerald-800 font-semibold">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    Devolução Prevista ({prazoDias} dias):
                  </span>
                  <span className="bg-emerald-100 px-2 py-0.5 rounded text-emerald-900">
                    {formatDate(expectedDate)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                  Regra do sistema: Permitida renovação de {prazoRenovacaoDias} dias caso não haja
                  reservas ativas.
                </div>
              </div>

              {selectedReaderObj?.bloqueado && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription className="text-xs">
                    Atenção: Este leitor está com cadastro bloqueado por pendências anteriores.
                  </AlertDescription>
                </Alert>
              )}

              {/* Bloqueio de livros da Diretoria */}
              {isDiretoriaBlocked && (
                <Alert
                  variant="destructive"
                  className="py-2 bg-rose-50 border-rose-300 text-rose-900"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  <AlertDescription className="text-xs font-semibold">
                    O leitor selecionado não possui permissão para retirar livros da Diretoria.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={
                loading || loadingData || !selectedExemplar || !selectedLeitor || isDiretoriaBlocked
              }
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar Empréstimo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
