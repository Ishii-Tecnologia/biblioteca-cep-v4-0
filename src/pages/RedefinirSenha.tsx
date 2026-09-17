import React, { useState, useEffect } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import {
  Library,
  KeyRound,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { isRateLimitError, getFriendlyAuthErrorMessage } from '@/lib/auth-errors'

export default function RedefinirSenha() {
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const { user, profile, markPasswordResetCompleted, isPasswordResetRequired } = useAuth()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasValidSession, setHasValidSession] = useState(false)
  const [targetEmail, setTargetEmail] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    // Trata fragmentos do hash (#access_token=... ou ?code=...)
    const checkRecoverySession = async () => {
      try {
        // Verifica se há parâmetros de erro na URL do GoTrue (ex: link expirado ou otp_expired)
        if (typeof window !== 'undefined') {
          const rawHash = window.location.hash.replace(/^#/, '')
          const hashParams = new URLSearchParams(rawHash)
          const searchParams = new URLSearchParams(window.location.search)

          const errCode = hashParams.get('error_code') || searchParams.get('error_code')
          const errDesc =
            hashParams.get('error_description') || searchParams.get('error_description')

          if (errCode || errDesc) {
            const friendlyDesc =
              errCode === 'otp_expired' || errDesc?.toLowerCase().includes('expired')
                ? 'Este link de acesso expirou. Solicite um novo link ao operador da biblioteca.'
                : errDesc || 'Link inválido ou expirado.'
            if (isMounted) {
              setErrorMsg(friendlyDesc)
            }
          }
        }

        // Verifica se já temos sessão ativa
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session && session.user) {
          if (isMounted) {
            setHasValidSession(true)
            setTargetEmail(session.user.email || null)
            setCheckingSession(false)
          }
          return
        }

        // Se ainda não tiver sessão, aguardar evento onAuthStateChange do Supabase
        const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
          if (!isMounted) return
          if (event === 'PASSWORD_RECOVERY' || newSession?.user) {
            setHasValidSession(true)
            if (newSession?.user?.email) {
              setTargetEmail(newSession.user.email)
            }
            setCheckingSession(false)
          }
        })

        setTimeout(() => {
          if (isMounted) {
            setCheckingSession(false)
          }
          authListener.subscription.unsubscribe()
        }, 1500)
      } catch (err) {
        console.warn('Erro ao verificar sessão de recuperação:', err)
        if (isMounted) {
          setCheckingSession(false)
        }
      }
    }

    checkRecoverySession()

    return () => {
      isMounted = false
    }
  }, [location])

  // Se o usuário logado tiver email, preenche targetEmail
  useEffect(() => {
    if (user?.email) {
      setTargetEmail(user.email)
      setHasValidSession(true)
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

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
      // 1. Checar se a sessão atual pertence a um usuário cujo leitor ainda esteja com cadastro pendente
      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser()
        if (currentUser?.email) {
          const { data: leitorRow } = await supabase
            .from('leitor')
            .select('status_cadastro')
            .ilike('email', currentUser.email)
            .maybeSingle()
          if (leitorRow && (leitorRow as any).status_cadastro === 'pendente') {
            setErrorMsg(
              'Seu cadastro de leitor ainda está pendente de validação pela equipe da Biblioteca da CEP. Aguarde a confirmação para definir sua senha.',
            )
            toast({
              title: 'Cadastro pendente de validação',
              description:
                'Aguarde a aprovação do seu cadastro pela equipe da Biblioteca para definir sua senha de acesso.',
              variant: 'destructive',
            })
            return
          }
        }
      } catch (checkErr) {
        console.warn('Erro ao verificar status do leitor em RedefinirSenha:', checkErr)
      }

      const { error } = await supabase.auth.updateUser({
        password,
      })

      if (error) {
        throw error
      }

      // Conclui o primeiro acesso no banco via RPC e limpa flags
      try {
        await markPasswordResetCompleted()
      } catch (rpcErr) {
        console.warn('Aviso ao marcar redefinição concluída:', rpcErr)
      }

      // Limpar hash da URL para evitar que re-renderizações detectem fragmento recovery
      if (typeof window !== 'undefined' && window.location.hash) {
        try {
          window.history.replaceState(null, '', window.location.pathname)
        } catch {
          /* intentionally ignored */
        }
      }

      setSuccess(true)
      toast({
        title: 'Senha definida com sucesso!',
        description: 'Sua senha definitiva foi salva. Seja bem-vindo à Biblioteca CEP!',
      })

      setTimeout(() => {
        navigate('/', { replace: true })
      }, 1500)
    } catch (err: any) {
      const isRate = isRateLimitError(err)
      const friendlyMsg = getFriendlyAuthErrorMessage(
        err,
        'Não foi possível redefinir sua senha. O link pode ter expirado.',
      )
      setErrorMsg(friendlyMsg)
      toast({
        title: isRate ? 'Limite de tentativas excedido' : 'Falha ao redefinir senha',
        description: friendlyMsg,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex flex-col justify-center items-center py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 mx-auto flex items-center justify-center text-white shadow-lg shadow-emerald-600/20">
            <Library className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Biblioteca CEP</h1>
          <p className="text-xs text-slate-500">Sistema de Gestão de Acervo e Empréstimos</p>
        </div>

        {/* Card */}
        <Card className="border-slate-200 shadow-md bg-white">
          <CardHeader className="pb-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 py-1.5 px-3 rounded-full mx-auto w-fit border border-emerald-100 mb-2">
              <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
              <span>Definição de Senha de Acesso</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              {success
                ? 'Senha Cadastrada com Sucesso!'
                : isPasswordResetRequired
                  ? 'Primeiro Acesso — Defina sua Senha'
                  : 'Defina sua Nova Senha'}
            </h2>
            <p className="text-xs text-slate-500">
              {success
                ? 'Sua nova senha foi gravada com sucesso.'
                : targetEmail
                  ? `Definindo senha para a conta: ${targetEmail}`
                  : 'Cadastre sua senha de acesso para utilizar os serviços da biblioteca'}
            </p>
          </CardHeader>

          {checkingSession ? (
            <CardContent className="py-10 text-center flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <p className="text-xs text-slate-500">Validando link de acesso seguro...</p>
            </CardContent>
          ) : success ? (
            <CardContent className="space-y-4 pt-2 text-center pb-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-sm text-slate-700">
                Sua senha foi redefinida com sucesso! Você está autenticado e será redirecionado
                para o sistema em instantes.
              </p>
              <Button
                onClick={() => navigate('/', { replace: true })}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs w-full"
              >
                Ir para o Sistema Agora
              </Button>
            </CardContent>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-3.5 pt-1">
                {errorMsg && (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-700 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {!hasValidSession && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-800 leading-relaxed">
                    Aviso: Se você acabou de abrir o link do e-mail, insira sua nova senha abaixo.
                    Caso o link tenha expirado, solicite um novo envio ao operador da biblioteca.
                  </div>
                )}

                {isPasswordResetRequired && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-[11px] text-emerald-900 leading-relaxed flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Este é o seu primeiro acesso. Por segurança, é obrigatório cadastrar sua senha
                      definitiva antes de navegar pelo acervo e serviços da biblioteca.
                    </span>
                  </div>
                )}

                <div className="space-y-1">
                  <Label htmlFor="new-password" className="text-xs font-semibold text-slate-700">
                    Nova Senha * (mínimo 6 caracteres)
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (errorMsg) setErrorMsg(null)
                      }}
                      className="text-xs pr-10"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label
                    htmlFor="confirm-password"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Confirmar Nova Senha *
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value)
                        if (errorMsg) setErrorMsg(null)
                      }}
                      className="text-xs pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
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

                {/* Validação visual simples */}
                <div className="text-[11px] text-slate-500 space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${
                        password.length >= 6 ? 'text-emerald-600' : 'text-slate-300'
                      }`}
                    />
                    <span className={password.length >= 6 ? 'text-emerald-700 font-medium' : ''}>
                      Mínimo de 6 caracteres
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${
                        password && password === confirmPassword
                          ? 'text-emerald-600'
                          : 'text-slate-300'
                      }`}
                    />
                    <span
                      className={
                        password && password === confirmPassword
                          ? 'text-emerald-700 font-medium'
                          : ''
                      }
                    >
                      Senhas coincidentes
                    </span>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-3 pt-2 pb-6">
                <Button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs h-9 gap-1.5"
                  disabled={loading || password.length < 6 || password !== confirmPassword}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gravando Nova Senha...
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      Salvar Senha e Entrar
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>

        <div className="text-center">
          <Link
            to="/login"
            className="text-xs text-slate-500 hover:text-emerald-700 underline font-medium"
          >
            Voltar para o Login
          </Link>
        </div>
      </div>
    </div>
  )
}
