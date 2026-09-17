import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { FeriadosService, Feriado } from '@/services/feriados'
import { formatDateBR } from '@/lib/utils'
import { Calendar, Plus, Trash2, Edit2, RefreshCw, CalendarDays } from 'lucide-react'

export function FeriadosSpecTab() {
  const { toast } = useToast()
  const currentYear = new Date().getFullYear()

  const [loading, setLoading] = useState(false)
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [feriados, setFeriados] = useState<Feriado[]>([])

  // Modal de Criação / Edição
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [dataFeriado, setDataFeriado] = useState('')
  const [descricaoFeriado, setDescricaoFeriado] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadFeriados()
  }, [selectedYear])

  async function loadFeriados() {
    try {
      setLoading(true)
      const data = await FeriadosService.getAll(selectedYear)
      setFeriados(data)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar feriados',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleSeedYear() {
    try {
      setLoading(true)
      const count = await FeriadosService.seedYearDefaults(selectedYear)
      toast({
        title: 'Feriados Nacionais Importados',
        description: `${count} feriados cadastrados/verificados para o ano ${selectedYear}.`,
      })
      loadFeriados()
    } catch (err: any) {
      toast({
        title: 'Erro ao semear feriados',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  function handleOpenCreate() {
    setEditingId(null)
    setDataFeriado(`${selectedYear}-01-01`)
    setDescricaoFeriado('')
    setModalOpen(true)
  }

  function handleOpenEdit(item: Feriado) {
    setEditingId(item.id)
    setDataFeriado(item.data)
    setDescricaoFeriado(item.descricao)
    setModalOpen(true)
  }

  async function handleDelete(id: number) {
    if (!confirm('Deseja realmente remover este feriado?')) return
    try {
      await FeriadosService.delete(id)
      toast({ title: 'Feriado removido com sucesso' })
      loadFeriados()
    } catch (err: any) {
      toast({
        title: 'Erro ao remover feriado',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  async function handleSaveFeriado() {
    if (!dataFeriado || !descricaoFeriado.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe a data e a descrição do feriado.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSubmitting(true)
      if (editingId) {
        await FeriadosService.update(editingId, {
          data: dataFeriado,
          descricao: descricaoFeriado,
        })
        toast({ title: 'Feriado atualizado com sucesso' })
      } else {
        await FeriadosService.create({
          data: dataFeriado,
          descricao: descricaoFeriado,
        })
        toast({ title: 'Feriado cadastrado com sucesso' })
      }
      setModalOpen(false)
      loadFeriados()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar feriado',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-xl flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-primary" />
                Gestão de Feriados (Cálculo de Dias Úteis)
              </CardTitle>
              <CardDescription>
                Base de feriados utilizada para calcular o prazo de retirada de 4 dias úteis (sábado
                conta, exclui domingo e feriados).
              </CardDescription>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Seletor de Ano */}
              <div className="flex items-center gap-1.5 border rounded-md p-1 bg-muted/40">
                {[currentYear - 1, currentYear, currentYear + 1].map((year) => (
                  <Button
                    key={year}
                    variant={selectedYear === year ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setSelectedYear(year)}
                  >
                    {year}
                  </Button>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleSeedYear}
                disabled={loading}
                className="h-8 text-xs flex items-center gap-1"
              >
                Semear Padrões ({selectedYear})
              </Button>

              <Button
                size="sm"
                onClick={handleOpenCreate}
                className="h-8 text-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo Feriado
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Carregando feriados...
            </div>
          ) : feriados.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg">
              Nenhum feriado cadastrado para o ano {selectedYear}. Clique em "Semear Padrões" para
              carregar feriados nacionais.
            </div>
          ) : (
            <div className="border rounded-md divide-y divide-border overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 text-xs font-semibold grid grid-cols-12 gap-2 text-muted-foreground">
                <div className="col-span-3 sm:col-span-2">Data</div>
                <div className="col-span-6 sm:col-span-8">Descrição</div>
                <div className="col-span-3 sm:col-span-2 text-right">Ações</div>
              </div>

              {feriados.map((f) => (
                <div
                  key={f.id}
                  className="px-4 py-3 text-sm grid grid-cols-12 gap-2 items-center hover:bg-muted/30 transition-colors"
                >
                  <div className="col-span-3 sm:col-span-2 font-medium flex items-center gap-1.5 text-xs sm:text-sm">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    {formatDateBR(f.data)}
                  </div>
                  <div className="col-span-6 sm:col-span-8 truncate font-normal">{f.descricao}</div>
                  <div className="col-span-3 sm:col-span-2 flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => handleOpenEdit(f)}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      onClick={() => handleDelete(f.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Criar/Editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Feriado' : 'Novo Feriado'}</DialogTitle>
            <DialogDescription>
              Feriados são excluídos da contagem de dias úteis para retirada de livros.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="feriado-data">Data do Feriado</Label>
              <Input
                id="feriado-data"
                type="date"
                value={dataFeriado}
                onChange={(e) => setDataFeriado(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feriado-desc">Descrição / Nome do Feriado</Label>
              <Input
                id="feriado-desc"
                placeholder="Ex.: Carnaval, Tiradentes, Feriado Municipal..."
                value={descricaoFeriado}
                onChange={(e) => setDescricaoFeriado(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSaveFeriado} disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar Feriado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
