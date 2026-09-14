import React, { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Library, LogIn, Loader2, Lock } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function Login() {
  const { signIn, user, profile } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const from = (location.state as any)?.from?.pathname || '/'

  const [loading, setLoading] = useState(false)

  // Sign in form
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // If already logged in, redirect
  React.useEffect(() => {
    if (user) {
      // Se a rota de origem for o próprio /login, redireciona para a raiz /
      const targetPath = from === '/login' ? '/' : from
      navigate(targetPath, { replace: true })
    }
  }, [user, navigate, from])

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast({
        title: 'Atenção',
        description: 'Preencha seu e-mail e senha.',
        variant: 'destructive',
      })
      return
    }
    setLoading(true)
    try {
      const { data, error } = await signIn(email, password)
      if (error) {
        toast({
          title: 'Falha no login',
          description: error.message || 'Credenciais inválidas.',
          variant: 'destructive',
        })
      } else {
        const loggedUser = data?.user || user
        let displayName =
          profile?.full_name ||
          loggedUser?.user_metadata?.full_name ||
          loggedUser?.user_metadata?.nome ||
          loggedUser?.email?.split('@')[0] ||
          ''

        // Fallback rápido se ainda não veio no profile/user_metadata
        if (!displayName && loggedUser?.id) {
          try {
            const { data: pRow } = await (
              await import('@/lib/supabase/client')
            ).supabase
              .from('profiles')
              .select('nome, full_name')
              .eq('id', loggedUser.id)
              .maybeSingle()
            if (pRow?.nome || pRow?.full_name) {
              displayName = pRow.nome || pRow.full_name
            }
          } catch {
            // fallback silencioso
          }
        }

        const welcomeTitle = displayName ? `Bem-vindo, ${displayName}!` : 'Bem-vindo!'
        toast({
          title: welcomeTitle,
          description: 'Login realizado com sucesso. Acesso liberado ao sistema.',
        })
        const targetPath = from === '/login' ? '/' : from
        navigate(targetPath, { replace: true })
      }
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

        {/* Auth Card */}
        <Card className="border-slate-200 shadow-md bg-white">
          <CardHeader className="pb-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 py-1.5 px-3 rounded-full mx-auto w-fit border border-emerald-100 mb-2">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Acesso para usuários cadastrados</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">Entrar na Conta</h2>
            <p className="text-xs text-slate-500">
              Digite seu e-mail e senha para acessar o painel
            </p>
          </CardHeader>

          <form onSubmit={handleSignIn}>
            <CardContent className="space-y-3.5 pt-1">
              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                  E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="seu.email@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
                  Senha
                </Label>
                <Input
                  id="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="text-xs"
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2 pb-6">
              <Button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs h-9 gap-1.5"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                Entrar no Sistema
              </Button>

              <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                O cadastro de usuários é realizado internamente pela administração da biblioteca.
              </p>
            </CardFooter>
          </form>
        </Card>

        <div className="text-center">
          <Link
            to="/"
            className="text-xs text-slate-500 hover:text-emerald-700 underline font-medium"
          >
            Voltar para a página inicial
          </Link>
        </div>
      </div>
    </div>
  )
}
