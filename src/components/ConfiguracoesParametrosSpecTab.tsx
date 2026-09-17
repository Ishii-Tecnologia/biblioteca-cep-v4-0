import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { ConfiguracoesSpecService, ConfiguracaoParam } from '@/services/configuracao-spec'
import { Settings, Save, RefreshCw, AlertCircle, ShieldAlert } from 'lucide-react'

export function ConfiguracoesParametrosSpecTab() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Estados dos parâmetros da Seção 7
  const [prazoRetirada, setPrazoRetirada] = useState('4')
  const [limiteFila, setLimiteFila] = useState('2')
  const [limiteEmprestimos, setLimiteEmprestimos] = useState('4')
  const [limiteReservas, setLimiteReservas] = useState('4')
  const [prazoEmprestimoDias, setPrazoEmprestimoDias] = useState('15')
  const [diasNaoUteis, setDiasNaoUteis] = useState('[0]') // default: [0] = domingo
  const [notificarEmail, setNotificarEmail] = useState(true)
  const [notificarSms, setNotificarSms] = useState(true)

  useEffect(() => {
    loadParams()
  }, [])

  async function loadParams() {
    try {
      setLoading(true)
      const map = await ConfiguracoesSpecService.getMap()

      if (map['PRAZO_RETIRADA_DIAS_UTEIS']) setPrazoRetirada(map['PRAZO_RETIRADA_DIAS_UTEIS'])
      if (map['LIMITE_FILA_RESERVAS']) setLimiteFila(map['LIMITE_FILA_RESERVAS'])
      if (map['LIMITE_EMPRESTIMOS_LEITOR']) setLimiteEmprestimos(map['LIMITE_EMPRESTIMOS_LEITOR'])
      if (map['LIMITE_RESERVAS_LEITOR']) setLimiteReservas(map['LIMITE_RESERVAS_LEITOR'])
      if (map['PRAZO_EMPRESTIMO_DIAS']) setPrazoEmprestimoDias(map['PRAZO_EMPRESTIMO_DIAS'])
      if (map['DIAS_NAO_UTEIS']) setDiasNaoUteis(map['DIAS_NAO_UTEIS'])
      if (map['NOTIFICAR_EMAIL'] !== undefined) setNotificarEmail(map['NOTIFICAR_EMAIL'] === 'true')
      if (map['NOTIFICAR_SMS'] !== undefined) setNotificarSms(map['NOTIFICAR_SMS'] === 'true')
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar configurações',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    try {
      setSaving(true)

      const payload: Record<string, string> = {
        PRAZO_RETIRADA_DIAS_UTEIS: prazoRetirada.trim(),
        LIMITE_FILA_RESERVAS: limiteFila.trim(),
        LIMITE_EMPRESTIMOS_LEITOR: limiteEmprestimos.trim(),
        LIMITE_RESERVAS_LEITOR: limiteReservas.trim(),
        PRAZO_EMPRESTIMO_DIAS: prazoEmprestimoDias.trim(),
        DIAS_NAO_UTEIS: diasNaoUteis.trim(),
        NOTIFICAR_EMAIL: String(notificarEmail),
        NOTIFICAR_SMS: String(notificarSms),
      }

      await ConfiguracoesSpecService.setBatch(payload)

      toast({
        title: 'Parâmetros Salvos!',
        description: 'As regras de negócio foram atualizadas com sucesso.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" />
                Parâmetros Rígidos da Biblioteca (Seção 7)
              </CardTitle>
              <CardDescription>
                Configure os limites transacionais, filas de espera, dias úteis e canais de
                notificação.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadParams}
              disabled={loading || saving}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Recarregar
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* PRAZO_RETIRADA_DIAS_UTEIS */}
            <div className="space-y-2 border p-4 rounded-lg bg-card">
              <Label className="text-sm font-semibold flex items-center justify-between">
                <span>Prazo de Retirada (Dias Úteis)</span>
                <span className="text-xs text-muted-foreground">PRAZO_RETIRADA_DIAS_UTEIS</span>
              </Label>
              <Input
                type="number"
                min="1"
                max="30"
                value={prazoRetirada}
                onChange={(e) => setPrazoRetirada(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Prazo em dias úteis para o leitor retirar o exemplar após confirmação de empréstimo
                ou contemplação de reserva (padrão: 4). Sábado conta; exclui domingo e feriados.
              </p>
            </div>

            {/* LIMITE_FILA_RESERVAS */}
            <div className="space-y-2 border p-4 rounded-lg bg-card">
              <Label className="text-sm font-semibold flex items-center justify-between">
                <span>Limite da Fila de Reservas</span>
                <span className="text-xs text-muted-foreground">LIMITE_FILA_RESERVAS</span>
              </Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={limiteFila}
                onChange={(e) => setLimiteFila(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Máximo de leitores na fila por livro indisponível (padrão: 2). Ao tentar um 3º
                leitor, o sistema rejeita com "Não há disponibilidade para mais reservas."
              </p>
            </div>

            {/* LIMITE_EMPRESTIMOS_LEITOR */}
            <div className="space-y-2 border p-4 rounded-lg bg-card">
              <Label className="text-sm font-semibold flex items-center justify-between">
                <span>Limite de Empréstimos por Leitor</span>
                <span className="text-xs text-muted-foreground">LIMITE_EMPRESTIMOS_LEITOR</span>
              </Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={limiteEmprestimos}
                onChange={(e) => setLimiteEmprestimos(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Máximo de livros distintos emprestados simultaneamente por leitor (padrão: 4).
                Validação por livro_id.
              </p>
            </div>

            {/* LIMITE_RESERVAS_LEITOR */}
            <div className="space-y-2 border p-4 rounded-lg bg-card">
              <Label className="text-sm font-semibold flex items-center justify-between">
                <span>Limite de Reservas por Leitor</span>
                <span className="text-xs text-muted-foreground">LIMITE_RESERVAS_LEITOR</span>
              </Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={limiteReservas}
                onChange={(e) => setLimiteReservas(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Máximo de reservas de exemplares distintos que não estejam em posse do leitor
                (padrão: 4).
              </p>
            </div>

            {/* PRAZO_EMPRESTIMO_DIAS */}
            <div className="space-y-2 border p-4 rounded-lg bg-card">
              <Label className="text-sm font-semibold flex items-center justify-between">
                <span>Prazo Regular de Empréstimo (Dias Corridos)</span>
                <span className="text-xs text-muted-foreground">PRAZO_EMPRESTIMO_DIAS</span>
              </Label>
              <Input
                type="number"
                min="1"
                max="60"
                value={prazoEmprestimoDias}
                onChange={(e) => setPrazoEmprestimoDias(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Prazo total do empréstimo após a retirada física confirmada pelo leitor (padrão: 15
                dias).
              </p>
            </div>

            {/* DIAS_NAO_UTEIS */}
            <div className="space-y-2 border p-4 rounded-lg bg-card">
              <Label className="text-sm font-semibold flex items-center justify-between">
                <span>Dias Não Úteis da Semana (JSON)</span>
                <span className="text-xs text-muted-foreground">DIAS_NAO_UTEIS</span>
              </Label>
              <Input
                value={diasNaoUteis}
                onChange={(e) => setDiasNaoUteis(e.target.value)}
                placeholder="[0]"
              />
              <p className="text-xs text-muted-foreground">
                Índices dos dias da semana excluídos do cálculo útil (0 = Domingo, 6 = Sábado).
                Padrão da spec: [0] (sábado é considerado dia útil).
              </p>
            </div>
          </div>

          {/* Canais de Notificação */}
          <div className="border p-4 rounded-lg space-y-4 bg-muted/20">
            <h4 className="font-semibold text-sm">Canais de Notificação</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 border rounded-md bg-card">
                <div>
                  <Label htmlFor="notify-email" className="font-medium cursor-pointer">
                    Notificações por E-mail
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Envia avisos automáticos de disponibilidade e expiração via SMTP.
                  </p>
                </div>
                <Switch
                  id="notify-email"
                  checked={notificarEmail}
                  onCheckedChange={setNotificarEmail}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-md bg-card">
                <div>
                  <Label htmlFor="notify-sms" className="font-medium cursor-pointer">
                    Notificações por SMS
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Habilita canal de SMS (auditado no log de transições).
                  </p>
                </div>
                <Switch id="notify-sms" checked={notificarSms} onCheckedChange={setNotificarSms} />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6">
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar Parâmetros'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
