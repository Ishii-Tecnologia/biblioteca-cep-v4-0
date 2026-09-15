import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, UserRole } from '@/hooks/use-auth'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
  requireOperador?: boolean
  requireOperator?: boolean
  requireDiretoria?: boolean
  allowedRoles?: UserRole[]
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAdmin = false,
  requireOperador = false,
  requireOperator = false,
  requireDiretoria = false,
  allowedRoles,
}) => {
  const needsOperator = requireOperador || requireOperator
  const {
    user,
    role,
    loading,
    isAdmin,
    isOperadorOrAdmin,
    isDiretoriaOrAdmin,
    isPasswordResetRequired,
  } = useAuth()
  const location = useLocation()

  // Se ainda estiver carregando sessão ou permissões, renderiza o spinner institucional
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <span className="text-sm text-slate-500 font-medium">Verificando permissões...</span>
      </div>
    )
  }

  // Redireciona para o login apenas quando houver certeza absoluta de que não há sessão/usuário
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Se o leitor estiver no primeiro acesso ou com reset pendente de definição de senha,
  // bloqueia o acesso a qualquer rota protegida e redireciona obrigatoriamente para /redefinir-senha
  if (isPasswordResetRequired && location.pathname !== '/redefinir-senha') {
    return <Navigate to="/redefinir-senha" replace />
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />
  }

  if (needsOperator && !isOperadorOrAdmin) {
    return <Navigate to="/" replace />
  }

  if (requireDiretoria && !isDiretoriaOrAdmin) {
    return <Navigate to="/" replace />
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
export default ProtectedRoute
