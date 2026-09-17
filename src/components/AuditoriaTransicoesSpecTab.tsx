import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { AuditoriaTransicoesService, AuditoriaTransicao } from '@/services/auditoria-transicoes'
import { formatDateBR } from '@/lib/utils'
import { ShieldCheck, RefreshCw, ArrowRight, User, Clock, Filter } from 'lucide-react'

export function AuditoriaTransicoesSpecTab() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<AuditoriaTransicao[]>([])
  const [selectedEntidade, setSelectedEntidade] = useState<string>('all')

  useEffect(() => {
    loadLogs()
  }, [selectedEntidade])

  async function loadLogs() {
    try {
      setLoading(true)
      const data = await AuditoriaTransicoesService.getAll(
        selectedEntidade === 'all' ? undefined : selectedEntidade,
        undefined,
        150,
      )
      setLogs(data)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar auditoria',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-xl flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Auditoria de Transições de Estado (Seção 8)
              </CardTitle>
              <CardDescription>
                Registro determinístico de quem, quando, de/para qual estado ocorreu cada
                movimentação de exemplar, empréstimo, reserva e pré-reserva.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Select value={selectedEntidade} onValueChange={setSelectedEntidade}>
                <SelectTrigger className="w-[180px] h-9 text-xs">
                  <SelectValue placeholder="Filtrar entidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Entidades</SelectItem>
                  <SelectItem value="emprestimo">Empréstimos</SelectItem>
                  <SelectItem value="reserva">Reservas</SelectItem>
                  <SelectItem value="pre_reserva">Pré-reservas</SelectItem>
                  <SelectItem value="exemplar">Exemplares</SelectItem>
                  <SelectItem value="notificacao_sms">SMS / Notificações</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={loadLogs}
                disabled={loading}
                className="h-9 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Carregando registros de transição...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg">
              Nenhuma transição de estado registrada até o momento.
            </div>
          ) : (
            <div className="border rounded-md divide-y divide-border overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 text-xs font-semibold grid grid-cols-12 gap-2 text-muted-foreground">
                <div className="col-span-3 sm:col-span-2">Data/Hora</div>
                <div className="col-span-3 sm:col-span-2">Entidade & ID</div>
                <div className="col-span-4 sm:col-span-4">Transição (De → Para)</div>
                <div className="col-span-2 sm:col-span-2">Operador</div>
                <div className="hidden sm:block sm:col-span-2">Motivo/Detalhes</div>
              </div>

              {logs.map((log) => (
                <div
                  key={log.id}
                  className="px-4 py-3 text-xs sm:text-sm grid grid-cols-12 gap-2 items-center hover:bg-muted/30 transition-colors"
                >
                  {/* Data */}
                  <div className="col-span-3 sm:col-span-2 text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>{formatDateBR(log.created_at)}</span>
                  </div>

                  {/* Entidade */}
                  <div className="col-span-3 sm:col-span-2">
                    <Badge variant="outline" className="text-[11px] font-mono">
                      {log.entidade} #{log.registro_id}
                    </Badge>
                  </div>

                  {/* Transição */}
                  <div className="col-span-4 sm:col-span-4 flex items-center gap-1.5 flex-wrap">
                    {log.estado_anterior ? (
                      <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {log.estado_anterior}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">[início]</span>
                    )}

                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

                    <span className="font-mono text-[11px] bg-primary/10 font-medium px-1.5 py-0.5 rounded text-primary">
                      {log.estado_novo}
                    </span>
                  </div>

                  {/* Operador */}
                  <div className="col-span-2 sm:col-span-2 truncate flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="w-3 h-3 shrink-0" />
                    <span className="truncate">{log.operador_nome || 'Sistema'}</span>
                  </div>

                  {/* Motivo */}
                  <div className="hidden sm:block sm:col-span-2 text-xs text-muted-foreground truncate">
                    {log.motivo || JSON.stringify(log.payload) || '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
