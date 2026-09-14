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
import { KeyRound, Eye, EyeOff, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react'
import { adminResetPassword } from '@/services/auth-passwords'
import { ProfileRecord } from '@/pages/Usuarios'

interface AdminResetPasswordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: ProfileRecord | null
  onSuccess?: () => void
}

export function AdminResetPasswordModal({
  open,
  onOpenChange,
  user,
  onSuccess,
}: AdminResetPasswordModalProps) {
  const { toast } = useToast()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setPassword('')
      setConfirmPassword('')
      setShowPassword(false)
      setShowConfirmPassword(false)
      setErrorMsg(null)
    }
  }, [open])

  const displayName = user?.nome || user?.full_name || user?.email || 'Usuário'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!user) return

    if (!password) {
      setErrorMsg('Por favor, digite a nova senha.')
      return
    }

    if (password.length < 6) {
      setErrorMsg('A nova senha deve ter no mínimo 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMsg('A confirmação de senha não coincide com a nova senha digitada.')
      return
    }

    setLoading(true)
    try {
      const result = await adminResetPassword({
        userId: user.id,
        newPassword: password,
      })

      if (!result.success) {
        throw new Error(result.error || 'Não foi possível redefinir a senha do usuário.')
      }

      toast({
        title: `Senha redefinida com sucesso!`,
        description: `A nova senha para ${displayName} foi definida com sucesso.`,
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao redefinir a senha.')
      toast({
        title: 'Erro ao redefinir senha',
        description: err.message || 'Falha ao redefinir a senha do usuário.',
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
                <KeyRound className="w-4 h-4" />
              </div>
              <span>Alterar Senha do Usuário</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              Defina uma nova senha de acesso para{' '}
              <strong className="text-slate-700">{displayName}</strong> ({user?.email}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {errorMsg && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-700 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Campo Nova Senha */}
            <div className="space-y-1.5">
              <Label htmlFor="admin-new-password" className="text-xs font-semibold text-slate-700">
                Nova Senha * (mínimo 6 caracteres)
              </Label>
              <div className="relative">
                <Input
                  id="admin-new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Digite a nova senha"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (errorMsg) setErrorMsg(null)
                  }}
                  minLength={6}
                  required
                  disabled={loading}
                  className="pr-10 text-sm"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Campo Confirmar Nova Senha */}
            <div className="space-y-1.5">
              <Label
                htmlFor="admin-confirm-password"
                className="text-xs font-semibold text-slate-700"
              >
                Confirmar Nova Senha *
              </Label>
              <div className="relative">
                <Input
                  id="admin-confirm-password"
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

            {/* Requisitos / Feedback rápido */}
            <div className="text-[11px] text-slate-500 space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div className="flex items-center gap-1.5">
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${
                    password.length >= 6 ? 'text-emerald-600' : 'text-slate-300'
                  }`}
                />
                <span className={password.length >= 6 ? 'text-emerald-700 font-medium' : ''}>
                  Pelo menos 6 caracteres
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${
                    password && password === confirmPassword ? 'text-emerald-600' : 'text-slate-300'
                  }`}
                />
                <span
                  className={
                    password && password === confirmPassword ? 'text-emerald-700 font-medium' : ''
                  }
                >
                  Senhas coincidentes
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
              disabled={loading || password.length < 6 || password !== confirmPassword}
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
