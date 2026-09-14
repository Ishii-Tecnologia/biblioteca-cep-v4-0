import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
  requireOperator?: boolean
  requireDiretoria?: boolean
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requireOperator = false,
  requireDiretoria = false,
}: ProtectedRouteProps) {
  const { user, loading, isAdmin, isOperadorOrAdmin, isDiretoriaOrAdmin } = useAuth()
  const location = useLocation()

  // Tolerante ao carregamento: enquanto loading for verdadeiro OU o estado da sessão for indeterminado,
  // NUNCA redirecionar para /login; renderizar tela amigável de carregamento.
  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-500 min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-xs font-medium">Verificando autenticação...</p>
      </div>
    )
  }

  // Redireciona para o login apenas quando houver certeza absoluta de que não há sessão/usuário
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />
  }

  if (requireOperator && !isOperadorOrAdmin) {
    return <Navigate to="/" replace />
  }

  if (requireDiretoria && !isDiretoriaOrAdmin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
