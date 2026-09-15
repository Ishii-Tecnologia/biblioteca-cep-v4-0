import React from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useHeaderCounters } from '@/hooks/use-header-counters'
import { useLocation } from 'react-router-dom'
import {
  BookOpen,
  Users,
  Repeat,
  BookmarkCheck,
  History,
  Settings,
  LayoutDashboard,
  LogOut,
  LogIn,
  Library,
  Shield,
  Menu,
  X,
  BookMarked,
  KeyRound,
  UserCheck,
  Camera,
  Eye,
  EyeOff,
  Sparkles,
  ChevronDown,
  Briefcase,
} from 'lucide-react'
import { ChangeOwnPasswordModal } from '@/components/ChangeOwnPasswordModal'
import { EditOwnPhotoModal } from '@/components/EditOwnPhotoModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface LayoutProps {
  children?: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const {
    user,
    profile,
    isAdmin,
    isOperadorOrAdmin,
    isDiretoriaOrAdmin,
    isRealAdmin,
    isSimulatingReader,
    toggleReaderViewSimulation,
    signOut,
    isPasswordResetRequired,
  } = useAuth()
  const location = useLocation()
  const {
    emprestimosAtivos,
    reservasAtivas,
    hasQueueChangeAlert,
    hasReadyForPickupAlert,
    clearQueueChangeAlert,
  } = useHeaderCounters()
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  const [editPhotoOpen, setEditPhotoOpen] = React.useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = React.useState(false)
  const navigate = useNavigate()

  // Se o usuário precisa definir senha de primeiro acesso e não está em /redefinir-senha,
  // força a ida imediata para /redefinir-senha antes de qualquer uso da aplicação
  React.useEffect(() => {
    if (isPasswordResetRequired && location.pathname !== '/redefinir-senha') {
      navigate('/redefinir-senha', { replace: true })
    }
  }, [isPasswordResetRequired, location.pathname, navigate])

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const navItems = [
    { to: '/', label: 'Início', icon: LayoutDashboard, authRequired: false },
    { to: '/acervo', label: 'Livros', icon: BookOpen, authRequired: false },
    {
      to: '/emprestimos',
      label: 'Empréstimos',
      icon: Repeat,
      authRequired: true,
      badge: emprestimosAtivos > 0 ? `${emprestimosAtivos}` : undefined,
      badgeVariant: 'default' as const,
    },
    {
      to: '/reservas',
      label: 'Reservas',
      icon: BookmarkCheck,
      authRequired: true,
      hasDot: hasQueueChangeAlert || hasReadyForPickupAlert,
      badge: reservasAtivas > 0 ? `${reservasAtivas}` : undefined,
      badgeVariant: 'warning' as const,
    },
    {
      to: '/leitores',
      label: isOperadorOrAdmin ? 'Leitores' : 'Meus Dados',
      icon: isOperadorOrAdmin ? Users : UserCheck,
      authRequired: true,
      operatorOnly: false,
    },
    {
      to: '/historico',
      label: 'Relatórios',
      icon: History,
      authRequired: true,
      operatorOnly: true,
    },
    { to: '/usuarios', label: 'Operador', icon: Shield, authRequired: true, adminOnly: true },
    {
      to: '/configuracoes',
      label: 'Configurações',
      icon: Settings,
      authRequired: true,
      adminOnly: true,
    },
  ]

  const getInitials = (name?: string) => {
    if (!name) return 'U'
    const parts = name.trim().split(' ')
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return name.substring(0, 2).toUpperCase()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Banner de Primeiro Acesso Obrigatório */}
      {isPasswordResetRequired && (
        <aside
          aria-label="Aviso de Primeiro Acesso Obrigatório"
          className="bg-emerald-700 text-white px-4 py-2.5 text-xs font-medium shadow-sm flex items-center justify-between gap-3 sticky top-0 z-50 animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-2 max-w-4xl mx-auto flex-1">
            <KeyRound className="w-4 h-4 shrink-0 text-emerald-200" />
            <div className="leading-tight">
              <span className="font-bold">Primeiro Acesso:</span>{' '}
              <span className="text-emerald-100">
                Por favor, cadastre sua senha definitiva de acesso para desbloquear o uso da
                biblioteca.
              </span>
            </div>
          </div>
          {location.pathname !== '/redefinir-senha' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate('/redefinir-senha')}
              className="h-7 text-xs bg-white text-emerald-900 hover:bg-emerald-50 font-bold shrink-0 shadow-xs"
            >
              Definir Senha
            </Button>
          )}
        </aside>
      )}

      {/* Banner de Modo de Simulação de Visualização do Leitor para Administradores */}
      {isSimulatingReader && (
        <aside
          aria-label="Aviso de Modo Visualização de Leitor"
          className="bg-gradient-to-r from-amber-600 to-amber-700 text-white px-4 py-2 text-xs font-medium shadow-sm flex items-center justify-between gap-3 sticky top-0 z-50 animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-2 max-w-4xl mx-auto flex-1">
            <Eye className="w-4 h-4 shrink-0 text-amber-200" />
            <div className="leading-tight">
              <span className="font-bold">Modo de Visualização de Leitor Ativo:</span>{' '}
              <span className="text-amber-100">
                Você está navegando com as mesmas permissões e restrições de um leitor comum (sem
                botões de cadastro, edição ou relatórios).
              </span>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => toggleReaderViewSimulation(false)}
            className="h-7 text-xs bg-white text-amber-900 hover:bg-amber-50 font-bold shrink-0 shadow-xs gap-1"
          >
            <EyeOff className="w-3.5 h-3.5" />
            Voltar para Visão de Administrador
          </Button>
        </aside>
      )}

      {/* Main Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and Brand */}
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-2.5 group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                  <Library className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 leading-tight tracking-tight flex items-center gap-1.5 text-lg">
                    Biblioteca CEP
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border-emerald-200"
                    >
                      v4.0
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-none">
                    Sistema de Gestão de Acervo & Empréstimos
                  </p>
                </div>
              </Link>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                if (item.authRequired && !user) return null
                if (item.adminOnly && !isAdmin) return null
                if (item.operatorOnly && !isOperadorOrAdmin) return null
                const Icon = item.icon

                // Se for o item "Livros" e o usuário for Diretoria ou Admin, renderiza menu dropdown
                if (item.to === '/acervo' && isDiretoriaOrAdmin) {
                  return (
                    <DropdownMenu key="menu-livros">
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:bg-slate-100"
                        >
                          <Icon className="w-4 h-4" />
                          <span>Livros</span>
                          <ChevronDown className="w-3.5 h-3.5 opacity-60 ml-0.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-64">
                        <DropdownMenuItem asChild>
                          <Link to="/acervo" className="cursor-pointer flex items-start gap-2 py-2">
                            <BookOpen className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-semibold text-slate-900 text-xs sm:text-sm">
                                Acervo Geral
                              </div>
                              <div className="text-[11px] text-slate-500 font-normal">
                                Catálogo & Acervo de Livros geral
                              </div>
                            </div>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link
                            to="/acervo-diretoria"
                            className="cursor-pointer flex items-start gap-2 py-2"
                          >
                            <Briefcase className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-semibold text-amber-900 text-xs sm:text-sm flex items-center gap-1.5">
                                Acervo da Diretoria
                                <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] px-1 py-0">
                                  Restrito
                                </Badge>
                              </div>
                              <div className="text-[11px] text-slate-500 font-normal">
                                Catálogo & Acervo de Livros da Diretoria
                              </div>
                            </div>
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )
                }

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => {
                      if (item.to === '/reservas') clearQueueChangeAlert()
                    }}
                    className={({ isActive }) =>
                      `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-800 font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`
                    }
                  >
                    <div className="relative">
                      <Icon className="w-4 h-4" />
                      {item.hasDot && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
                      )}
                    </div>
                    <span>{item.label}</span>
                    {item.badge && (
                      <span
                        className={`ml-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                          item.hasDot
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : item.badgeVariant === 'warning'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </nav>

            {/* Right actions: User menu or login */}
            <div className="flex items-center gap-3">
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="flex items-center gap-2 px-2 py-1.5 h-auto rounded-lg hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200 max-w-[170px] xs:max-w-[200px] sm:max-w-[240px]"
                      title="Meu Perfil e Configurações de Conta"
                    >
                      <Avatar className="w-8 h-8 border border-slate-200 shadow-2xs shrink-0">
                        {profile?.avatar_url ? (
                          <AvatarImage
                            src={profile.avatar_url}
                            alt={profile.full_name || 'Foto de perfil'}
                            className="object-cover"
                          />
                        ) : null}
                        <AvatarFallback className="bg-emerald-100 text-emerald-800 text-xs font-bold">
                          {getInitials(profile?.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col text-left min-w-0 pr-0.5">
                        <span className="text-xs font-bold text-slate-900 leading-tight truncate">
                          {profile?.full_name ||
                            user.user_metadata?.full_name ||
                            user.user_metadata?.nome ||
                            user.email?.split('@')[0] ||
                            'Usuário'}
                        </span>
                        <span className="text-[10px] text-emerald-700 font-medium leading-tight truncate">
                          {isAdmin ? 'Administrador' : isOperadorOrAdmin ? 'Operador' : 'Leitor'}
                        </span>
                      </div>
                    </Button>
                  </DropdownMenuTrigger>{' '}
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="font-medium text-slate-900">
                        {profile?.full_name || 'Minha Conta'}
                      </div>
                      <div className="text-xs text-slate-500 font-normal truncate">
                        {user.email}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded w-fit">
                        <Shield className="w-3 h-3" />
                        Perfil:{' '}
                        <span className="font-semibold">
                          {isAdmin ? 'Administrador' : isOperadorOrAdmin ? 'Operador' : 'Leitor'}
                        </span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/acervo" className="cursor-pointer">
                        <BookMarked className="w-4 h-4 mr-2" />
                        {isDiretoriaOrAdmin ? 'Acervo Geral' : 'Explorar Acervo'}
                      </Link>
                    </DropdownMenuItem>
                    {isDiretoriaOrAdmin && (
                      <DropdownMenuItem asChild>
                        <Link to="/acervo-diretoria" className="cursor-pointer text-amber-900">
                          <Briefcase className="w-4 h-4 mr-2 text-amber-600" />
                          Acervo da Diretoria
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <Link to="/emprestimos" className="cursor-pointer">
                        <Repeat className="w-4 h-4 mr-2" />
                        Empréstimos ({emprestimosAtivos})
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/reservas" className="cursor-pointer">
                        <BookmarkCheck className="w-4 h-4 mr-2" />
                        Reservas ({reservasAtivas})
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/leitores" className="cursor-pointer">
                        {isOperadorOrAdmin ? (
                          <>
                            <Users className="w-4 h-4 mr-2" />
                            Leitores
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-4 h-4 mr-2 text-emerald-600" />
                            Meus Dados de Cadastro
                          </>
                        )}
                      </Link>
                    </DropdownMenuItem>
                    {isOperadorOrAdmin && (
                      <DropdownMenuItem asChild>
                        <Link to="/historico" className="cursor-pointer">
                          <History className="w-4 h-4 mr-2" />
                          Relatórios
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {isAdmin && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link to="/usuarios" className="cursor-pointer">
                            <Shield className="w-4 h-4 mr-2" />
                            Operador
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/configuracoes" className="cursor-pointer">
                            <Settings className="w-4 h-4 mr-2" />
                            Configurações
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    {isRealAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => toggleReaderViewSimulation(!isSimulatingReader)}
                          className="cursor-pointer text-amber-800 bg-amber-50/70 hover:bg-amber-100/80 font-medium"
                        >
                          <Eye className="w-4 h-4 mr-2 text-amber-600" />
                          {isSimulatingReader
                            ? 'Sair da Visualização de Leitor'
                            : 'Modo Visualização de Leitor'}
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setChangePasswordOpen(true)}
                      className="cursor-pointer text-slate-700 hover:text-slate-900"
                    >
                      <KeyRound className="w-4 h-4 mr-2 text-emerald-600" />
                      Alterar minha senha
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleSignOut}
                      className="text-rose-600 cursor-pointer focus:text-rose-600"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Sair da conta
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    asChild
                    size="sm"
                    variant="default"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
                  >
                    <Link to="/login">
                      <LogIn className="w-4 h-4" />
                      <span>Entrar</span>
                    </Link>
                  </Button>
                </div>
              )}

              {/* Mobile hamburger com ponto indicador de notificação se houver mudança de fila */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-slate-600 relative"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Abrir menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                {(hasQueueChangeAlert || hasReadyForPickupAlert) && !mobileMenuOpen && (
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Panel */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-5 space-y-3 animate-in slide-in-from-top-2 duration-200 shadow-lg">
            {/* User Profile Card inside Mobile Drawer */}
            {user ? (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative group/avatar shrink-0">
                      <Avatar className="w-12 h-12 border-2 border-emerald-500/40 shadow-xs">
                        {profile?.avatar_url ? (
                          <AvatarImage
                            src={profile.avatar_url}
                            alt={profile.full_name || 'Foto de perfil'}
                            className="object-cover"
                          />
                        ) : null}
                        <AvatarFallback className="bg-emerald-100 text-emerald-800 font-bold text-sm">
                          {getInitials(profile?.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false)
                          setEditPhotoOpen(true)
                        }}
                        aria-label="Editar foto de perfil"
                        className="absolute -bottom-1 -right-1 bg-emerald-600 text-white rounded-full p-1 shadow-sm hover:bg-emerald-700 transition-colors"
                        title="Alterar minha foto de perfil"
                      >
                        <Camera className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {profile?.full_name ||
                          user.user_metadata?.full_name ||
                          user.user_metadata?.nome ||
                          user.email?.split('@')[0] ||
                          'Usuário'}
                      </span>
                      <span className="text-xs text-slate-500 truncate">{user.email}</span>
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md w-fit">
                        <Shield className="w-3 h-3" />
                        <span>
                          {isAdmin ? 'Administrador' : isOperadorOrAdmin ? 'Operador' : 'Leitor'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMobileMenuOpen(false)
                      setEditPhotoOpen(true)
                    }}
                    className="text-xs h-7 px-2.5 border-emerald-300 text-emerald-800 hover:bg-emerald-50 shrink-0 gap-1"
                  >
                    <Camera className="w-3 h-3" />
                    <span>Editar Foto</span>
                  </Button>
                </div>

                {/* Atalho Rápido para Reservas Ativas do Leitor com Badge de Notificação de Mudança de Fila */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                  <Link
                    to="/reservas?status=Ativa&minhas=true"
                    onClick={() => {
                      clearQueueChangeAlert()
                      setMobileMenuOpen(false)
                    }}
                    className={`flex items-center justify-between p-2 rounded-lg border transition-colors relative ${
                      hasReadyForPickupAlert
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-950 font-bold animate-pulse'
                        : hasQueueChangeAlert
                          ? 'bg-amber-100 border-amber-300 text-amber-950 font-bold'
                          : 'bg-amber-50 hover:bg-amber-100/80 border-amber-200/80 text-amber-900'
                    }`}
                    title="Ver minhas reservas ativas na fila"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="relative">
                        <BookmarkCheck
                          className={`w-3.5 h-3.5 shrink-0 ${
                            hasReadyForPickupAlert ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        />
                        {(hasQueueChangeAlert || hasReadyForPickupAlert) && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 ring-1 ring-white animate-pulse" />
                        )}
                      </div>
                      <span className="text-xs font-semibold truncate">Minhas Reservas</span>
                    </div>
                    {hasReadyForPickupAlert ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-600 text-white rounded-full shrink-0 shadow-2xs">
                        PRONTO!
                      </span>
                    ) : hasQueueChangeAlert ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-rose-500 text-white rounded-full shrink-0 shadow-2xs">
                        NOVO!
                      </span>
                    ) : reservasAtivas > 0 ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 bg-amber-200/90 text-amber-900 rounded-full shrink-0">
                        {reservasAtivas}
                      </span>
                    ) : null}
                  </Link>

                  <Link
                    to="/leitores"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 text-emerald-900 transition-colors"
                    title="Acessar meus dados cadastrais"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span className="text-xs font-semibold truncate">Meus Dados</span>
                    </div>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">Bem-vindo(a) à Biblioteca CEP</p>
                  <p className="text-[11px] text-slate-500">
                    Faça login para gerenciar empréstimos e reservas
                  </p>
                </div>
                <Button
                  asChild
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm shrink-0"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Link to="/login">
                    <LogIn className="w-4 h-4" />
                    <span>Entrar</span>
                  </Link>
                </Button>
              </div>
            )}

            {/* Links de navegação */}
            <div className="space-y-1">
              {navItems.map((item) => {
                if (item.authRequired && !user) return null
                if (item.adminOnly && !isAdmin) return null
                if (item.operatorOnly && !isOperadorOrAdmin) return null
                const Icon = item.icon

                if (item.to === '/acervo' && isDiretoriaOrAdmin) {
                  return (
                    <div key="mobile-group-livros" className="space-y-1">
                      <NavLink
                        to="/acervo"
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-800 font-semibold'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`
                        }
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="w-4 h-4 text-emerald-600" />
                          <span>Acervo Geral de Livros</span>
                        </div>
                      </NavLink>
                      <NavLink
                        to="/acervo-diretoria"
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium ${
                            isActive
                              ? 'bg-amber-100/70 text-amber-900 font-semibold'
                              : 'text-amber-800 bg-amber-50/50 hover:bg-amber-100/60'
                          }`
                        }
                      >
                        <div className="flex items-center gap-3">
                          <Briefcase className="w-4 h-4 text-amber-600" />
                          <span>Acervo da Diretoria</span>
                        </div>
                        <Badge className="bg-amber-200 text-amber-950 border-amber-300 text-[9px] px-1.5 py-0">
                          Diretoria
                        </Badge>
                      </NavLink>
                    </div>
                  )
                }

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => {
                      if (item.to === '/reservas') clearQueueChangeAlert()
                      setMobileMenuOpen(false)
                    }}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-800 font-semibold'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`
                    }
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Icon className="w-4 h-4" />
                        {item.hasDot && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
                        )}
                      </div>
                      <span>{item.label}</span>
                    </div>
                    {item.hasDot ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-500 text-white rounded-full">
                        Mudança na Fila
                      </span>
                    ) : item.badge ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {item.badge}
                      </Badge>
                    ) : null}
                  </NavLink>
                )
              })}
            </div>

            {/* Ações de Conta no Menu Mobile */}
            {user && (
              <div className="pt-2 border-t border-slate-100 space-y-1">
                {/* Botão de Visualização de Leitor para Administradores no Mobile */}
                {isRealAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false)
                      toggleReaderViewSimulation(!isSimulatingReader)
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left font-semibold transition-colors ${
                      isSimulatingReader
                        ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    <Eye className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      {isSimulatingReader
                        ? 'Desativar Modo Leitor (Voltar Admin)'
                        : 'Modo Visualização de Leitor'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    setEditPhotoOpen(true)
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left font-medium"
                >
                  <Camera className="w-4 h-4 text-emerald-600" />
                  <span>Alterar minha foto de perfil</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    setChangePasswordOpen(true)
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left font-medium"
                >
                  <KeyRound className="w-4 h-4 text-emerald-600" />
                  <span>Alterar minha senha</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    handleSignOut()
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50 transition-colors text-left font-medium"
                >
                  <LogOut className="w-4 h-4 text-rose-600" />
                  <span>Sair da conta</span>
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content View */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">{children}</main>

      {/* Modal de Alteração da Própria Senha */}
      <ChangeOwnPasswordModal open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />

      {/* Modal de Alteração da Própria Foto */}
      <EditOwnPhotoModal open={editPhotoOpen} onOpenChange={setEditPhotoOpen} />

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Library className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold text-slate-700">Biblioteca CEP</span>
            <span>— Sistema Gratuito de Controle de Acervo e Empréstimos</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Versão 4.0</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
