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
import { useToast } from '@/hooks/use-toast'
import { KeyRound, Eye, EyeOff, Loader2, CheckCircle2, ShieldAlert, Lock } from 'lucide-react'
import { changeOwnPassword } from '@/services/auth-passwords'
import { useAuth } from '@/hooks/use-auth'

interface ChangeOwnPasswordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function ChangeOwnPasswordModal({
  open,
  onOpenChange,
  onSuccess,
}: ChangeOwnPasswordModalProps) {
  const { user } = useAuth()
  const { toast } = useToast()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowCurrentPassword(false)
      setShowNewPassword(false)
      setShowConfirmPassword(false)
      setErrorMsg(null)
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!user?.email) {
      setErrorMsg('Usuário não identificado. Faça login novamente.')
      return
    }

    if (!currentPassword) {
      setErrorMsg('Por favor, informe a sua senha atual.')
      return
    }

    if (!newPassword) {
      setErrorMsg('Por favor, informe a nova senha.')
      return
    }

    if (newPassword.length < 6) {
      setErrorMsg('A nova senha deve ter no mínimo 6 caracteres.')
      return
    }

    if (newPassword === currentPassword) {
      setErrorMsg('A nova senha não pode ser idêntica à senha atual.')
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('A confirmação de senha não coincide com a nova senha digitada.')
      return
    }

    setLoading(true)
    try {
      const result = await changeOwnPassword({
        currentPassword,
        newPassword,
        userEmail: user.email,
      })

      if (!result.success) {
        throw new Error(result.error || 'Não foi possível alterar sua senha.')
      }

      toast({
        title: 'Senha alterada com sucesso!',
        description: 'Sua senha foi atualizada. Utilize-a em seu próximo acesso.',
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao alterar a senha.')
      toast({
        title: 'Erro ao alterar senha',
        description: err.message || 'Não foi possível alterar sua senha.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                <Lock className="w-4 h-4" />
              </div>
              <span>Alterar Minha Senha</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              Confirme sua senha atual e digite a nova senha desejada para a sua conta (
              <strong className="text-slate-700">{user?.email}</strong>).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {errorMsg && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-700 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Campo Senha Atual */}
            <div className="space-y-1.5">
              <Label
                htmlFor="own-current-password"
                className="text-xs font-semibold text-slate-700"
              >
                Senha Atual *
              </Label>
              <div className="relative">
                <Input
                  id="own-current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  placeholder="Digite sua senha atual"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value)
                    if (errorMsg) setErrorMsg(null)
                  }}
                  required
                  disabled={loading}
                  className="pr-10 text-sm"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  aria-label={showCurrentPassword ? 'Ocultar senha' : 'Exibir senha'}
                  tabIndex={-1}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-4">
              {/* Campo Nova Senha */}
              <div className="space-y-1.5">
                <Label htmlFor="own-new-password" className="text-xs font-semibold text-slate-700">
                  Nova Senha * (mínimo 6 caracteres)
                </Label>
                <div className="relative">
                  <Input
                    id="own-new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="Digite a nova senha"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value)
                      if (errorMsg) setErrorMsg(null)
                    }}
                    minLength={6}
                    required
                    disabled={loading}
                    className="pr-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label={showNewPassword ? 'Ocultar senha' : 'Exibir senha'}
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Campo Confirmar Nova Senha */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="own-confirm-password"
                  className="text-xs font-semibold text-slate-700"
                >
                  Confirmar Nova Senha *
                </Label>
                <div className="relative">
                  <Input
                    id="own-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirme a nova senha"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      if (errorMsg) setErrorMsg(null)
                    }}
                    minLength={6}
                    required
                    disabled={loading}
                    className="pr-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label={showConfirmPassword ? 'Ocultar senha' : 'Exibir senha'}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Requisitos / Feedback rápido */}
            <div className="text-[11px] text-slate-500 space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div className="flex items-center gap-1.5">
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${
                    newPassword.length >= 6 ? 'text-emerald-600' : 'text-slate-300'
                  }`}
                />
                <span className={newPassword.length >= 6 ? 'text-emerald-700 font-medium' : ''}>
                  Mínimo de 6 caracteres na nova senha
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${
                    newPassword && newPassword === confirmPassword
                      ? 'text-emerald-600'
                      : 'text-slate-300'
                  }`}
                />
                <span
                  className={
                    newPassword && newPassword === confirmPassword
                      ? 'text-emerald-700 font-medium'
                      : ''
                  }
                >
                  Nova senha e confirmação coincidem
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                loading ||
                !currentPassword ||
                newPassword.length < 6 ||
                newPassword !== confirmPassword
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs shadow-xs"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <KeyRound className="w-3.5 h-3.5" />
                  Salvar Nova Senha
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
