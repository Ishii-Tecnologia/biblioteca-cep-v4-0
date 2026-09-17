import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { PreReservasService } from '@/services/pre-reservas'
import { LeitoresService, Leitor } from '@/services/leitores'
import { Titulo } from '@/services/titulos'
import { BookOpen, User, AlertCircle, CheckCircle2, Clock } from 'lucide-react'

interface PreReservaModalProps {
  isOpen: boolean
  onClose: () => void
  book: Titulo | null
  onSuccess?: () => void
}

export function PreReservaModal({ isOpen, onClose, book, onSuccess }: PreReservaModalProps) {
  const { user, profile } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [readers, setReaders] = useState<Leitor[]>([])
  const [selectedReaderId, setSelectedReaderId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const isStaff = profile?.role === 'admin' || profile?.role === 'operador'

  useEffect(() => {
    if (!isOpen) return

    if (!isStaff && profile?.id_leitor) {
      setSelectedReaderId(profile.id_leitor)
    } else if (isStaff) {
      loadReaders()
    }
  }, [isOpen, isStaff, profile])

  async function loadReaders() {
    try {
      setLoading(true)
      const data = await LeitoresService.getAll()
      // Apenas leitores não bloqueados
      setReaders(
        (data || []).filter(
          (l) => !l.bloqueado && l.status !== 'BLOQUEADO' && l.status !== 'INATIVO',
        ),
      )
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

  const filteredReaders = readers.filter(
    (r) =>
      r.nome_do_leitor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.telefone?.includes(searchTerm),
  )

  const selectedReader = readers.find((r) => r.id_leitor === selectedReaderId)

  async function handleSubmit() {
    if (!book) return
    const leitorId = isStaff ? selectedReaderId : profile?.id_leitor

    if (!leitorId) {
      toast({
        title: 'Selecione o leitor',
        description: 'É necessário indicar qual leitor está solicitando o livro.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSubmitting(true)
      const solicitanteNome = profile?.nome || profile?.email || 'Leitor'
      const res = await PreReservasService.solicitar(leitorId, book.id_titulo, solicitanteNome)

      toast({
        title: 'Solicitação Realizada!',
        description: res.mensagem || 'Pré-reserva enviada para análise do operador.',
      })

      onClose()
      if (onSuccess) onSuccess()
    } catch (err: any) {
      toast({
        title: 'Não foi possível solicitar',
        description: err.message || 'Erro ao criar solicitação.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (!book) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg dark:bg-blue-900/30 dark:text-blue-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">Solicitar Livro (Pré-reserva)</DialogTitle>
              <DialogDescription>
                Conforme o fluxo da biblioteca, sua solicitação entra com status PENDENTE_VALIDACAO
                e é validada pelo operador antes da liberação ou entrada na fila.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Informações da Obra */}
          <div className="p-3 bg-muted/60 rounded-lg flex items-start gap-3 border">
            {book.capa_url ? (
              <img
                src={book.capa_url}
                alt={book.titulo_de_livro}
                className="w-14 h-20 object-cover rounded shadow-sm flex-shrink-0"
              />
            ) : (
              <div className="w-14 h-20 bg-muted-foreground/10 flex items-center justify-center rounded flex-shrink-0">
                <BookOpen className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <Badge variant="outline" className="mb-1 text-xs">
                {book.categoria || 'Geral'} • {book.colecao || 'Cecília Braga'}
              </Badge>
              <h4 className="font-semibold text-sm line-clamp-1">{book.titulo_de_livro}</h4>
              <p className="text-xs text-muted-foreground">{book.autor}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Cód: {book.id_titulo}</p>
            </div>
          </div>

          {/* Seleção do Leitor (Operador/Admin) ou Visualização (Leitor autenticado) */}
          {isStaff ? (
            <div className="space-y-2">
              <Label htmlFor="reader-search" className="text-sm font-medium">
                Selecione o Leitor Solicitante
              </Label>
              <Input
                id="reader-search"
                placeholder="Buscar leitor por nome, e-mail ou telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9"
              />

              <div className="max-h-44 overflow-y-auto border rounded-md divide-y divide-border text-sm">
                {loading ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    Carregando leitores...
                  </div>
                ) : filteredReaders.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    Nenhum leitor ativo encontrado.
                  </div>
                ) : (
                  filteredReaders.map((r) => (
                    <button
                      key={r.id_leitor}
                      type="button"
                      onClick={() => setSelectedReaderId(r.id_leitor)}
                      className={`w-full text-left p-2.5 transition-colors flex items-center justify-between hover:bg-muted/50 ${
                        selectedReaderId === r.id_leitor
                          ? 'bg-primary/10 font-medium text-primary'
                          : ''
                      }`}
                    >
                      <div className="truncate">
                        <div className="truncate">{r.nome_do_leitor}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.email || r.telefone || 'Sem contato'}
                        </div>
                      </div>
                      {selectedReaderId === r.id_leitor && (
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0 ml-2" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-lg border bg-blue-50/40 dark:bg-blue-950/20 text-xs space-y-1">
              <p className="font-medium text-blue-900 dark:text-blue-300">Solicitante:</p>
              <p className="text-muted-foreground">
                {profile?.nome || user?.email} (ID #{profile?.id_leitor || 'Identificado'})
              </p>
            </div>
          )}

          {/* Regras e Prazos em Destaque */}
          <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/30 rounded border">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              Regras do Sistema CEP:
            </p>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              <li>Limite de até 4 empréstimos simultâneos por leitor.</li>
              <li>Limite de até 4 reservas simultâneas por leitor.</li>
              <li>Fila máxima de 2 leitores por livro indisponível.</li>
              <li>
                Prazo para retirada após aprovação: 4 dias úteis (sábado conta, exclui domingo e
                feriados).
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || (isStaff && !selectedReaderId)}
            className="bg-primary text-primary-foreground"
          >
            {submitting ? 'Enviando...' : 'Confirmar Pré-reserva'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
