import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useToast } from '@/hooks/use-toast'
import { ImageOff, RefreshCw, Search, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'
import {
  StorageLimpezaService,
  StorageLimpezaAnalise,
  StorageLimpezaExclusao,
} from '@/services/storage-limpeza'

const BUCKET_CAPAS = 'capas'

function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function StorageLimpezaSpecTab() {
  const { toast } = useToast()
  const [scanning, setScanning] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [analise, setAnalise] = useState<StorageLimpezaAnalise | null>(null)
  const [resultado, setResultado] = useState<StorageLimpezaExclusao | null>(null)
  const [erroVerificacao, setErroVerificacao] = useState<string | null>(null)

  const resumoCapas = analise?.resumo?.[BUCKET_CAPAS]
  const orfasCapas = analise ? analise.orfaos.filter((o) => o.bucket === BUCKET_CAPAS) : []
  const bytesOrfas = orfasCapas.reduce((acc, o) => acc + o.size, 0)

  async function verificar(): Promise<void> {
    setScanning(true)
    setErroVerificacao(null)
    try {
      const data = await StorageLimpezaService.analisar()
      setAnalise(data)
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível verificar o Storage.'
      setErroVerificacao(msg)
      toast({ title: 'Erro ao verificar o Storage', description: msg, variant: 'destructive' })
    } finally {
      setScanning(false)
    }
  }

  async function limparOrfas(): Promise<void> {
    if (orfasCapas.length === 0) return
    setCleaning(true)
    try {
      const itens = orfasCapas.map((o) => ({ bucket: o.bucket, name: o.name }))
      const res = await StorageLimpezaService.excluir(itens)
      setResultado(res)
      setConfirmOpen(false)
      toast({
        title: 'Limpeza concluída',
        description: `${res.removidos} capa(s) removida(s), ${formatarBytes(res.bytes_liberados)} liberados.`,
      })
      setCleaning(false)
      await verificar()
    } catch (err: any) {
      setConfirmOpen(false)
      toast({
        title: 'Erro na limpeza do Storage',
        description: err?.message || 'Não foi possível concluir a limpeza.',
        variant: 'destructive',
      })
    } finally {
      setCleaning(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-white shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ImageOff className="w-5 h-5 text-emerald-600" />
                Limpeza e Organização do Storage
              </CardTitle>
              <CardDescription className="text-xs">
                Localiza capas de livros que não estão mais vinculadas a nenhum título (livros
                excluídos ou versões antigas substituídas no upload). A verificação não apaga nada.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={verificar}
                disabled={scanning || cleaning}
                className="h-9 flex items-center gap-1.5 text-xs"
              >
                {scanning ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Verificar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                disabled={!analise || orfasCapas.length === 0 || scanning || cleaning}
                className="h-9 flex items-center gap-1.5 text-xs"
              >
                <Trash2 className="w-4 h-4" />
                Limpar capas órfãs
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {erroVerificacao && (
            <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{erroVerificacao}</span>
            </div>
          )}

          {resultado && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                Limpeza concluída
              </div>
              <p>
                Capas removidas: <strong>{resultado.removidos}</strong> · Espaço liberado:{' '}
                <strong>{formatarBytes(resultado.bytes_liberados)}</strong>
              </p>
              {resultado.ignorados.length > 0 && (
                <p>
                  {resultado.ignorados.length} item(ns) não foram removidos porque deixaram de ser
                  órfãos (estão em uso) ou já não existem.
                </p>
              )}
              {resultado.erros.length > 0 && (
                <p className="text-rose-700">Erros: {resultado.erros.join('; ')}</p>
              )}
            </div>
          )}

          {!analise ? (
            <div className="p-6 text-center text-xs text-muted-foreground border rounded-lg">
              Clique em "Verificar" para listar as capas órfãs e o espaço que ocupam.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-md border p-3">
                  <p className="text-[11px] text-slate-500">Capas no Storage</p>
                  <p className="text-lg font-bold text-slate-900">{resumoCapas?.total ?? 0}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-[11px] text-slate-500">Capas órfãs encontradas</p>
                  <p className="text-lg font-bold text-slate-900">{orfasCapas.length}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-[11px] text-slate-500">Espaço ocupado pelas órfãs</p>
                  <p className="text-lg font-bold text-slate-900">{formatarBytes(bytesOrfas)}</p>
                </div>
              </div>

              {orfasCapas.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground border rounded-lg">
                  Nenhuma capa órfã encontrada. O Storage está organizado.
                </div>
              ) : (
                <div className="border rounded-md divide-y divide-border max-h-96 overflow-auto">
                  <div className="bg-muted/50 px-4 py-2 text-xs font-semibold grid grid-cols-12 gap-2 text-muted-foreground sticky top-0">
                    <div className="col-span-8">Arquivo</div>
                    <div className="col-span-4 text-right">Tamanho</div>
                  </div>
                  {orfasCapas.map((o) => (
                    <div
                      key={o.name}
                      className="px-4 py-2 text-xs grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-8 truncate font-mono">
                        <Badge variant="outline" className="text-[10px] mr-2">
                          {o.bucket}
                        </Badge>
                        {o.name}
                      </div>
                      <div className="col-span-4 text-right text-muted-foreground">
                        {formatarBytes(o.size)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Limpar capas órfãs?"
        description={`${orfasCapas.length} capa(s) órfã(s), ocupando ${formatarBytes(bytesOrfas)}, serão excluídas do Storage. Esta ação é definitiva e não pode ser desfeita. Capas em uso por algum livro não serão afetadas.`}
        confirmLabel="Sim, limpar capas órfãs"
        cancelLabel="Cancelar"
        variant="destructive"
        onConfirm={limparOrfas}
        loading={cleaning}
      />
    </div>
  )
}
