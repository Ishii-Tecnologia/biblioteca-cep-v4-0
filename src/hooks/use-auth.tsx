import { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import {
  handleSessionExpired,
  setManualSignOutInProgress,
  isManualSignOut,
  setupFetchSessionExpirationInterceptor,
} from '@/services/session-expiration'

export type UserRole = 'admin' | 'operador' | 'operador_diretoria' | 'leitor' | 'guest'

export interface UserProfile {
  id: string
  email: string
  full_name: string
  nome?: string
  role: UserRole
  avatar_url?: string
  id_leitor?: number
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  role: UserRole
  isAdmin: boolean
  isOperadorOrAdmin: boolean
  isOperadorDiretoria: boolean
  isDiretoriaOrAdmin: boolean
  isRealAdmin: boolean
  isSimulatingReader: boolean
  toggleReaderViewSimulation: (enable?: boolean) => void
  signUp: (
    email: string,
    password: string,
    fullName?: string,
    role?: UserRole,
    autoSignIn?: boolean,
  ) => Promise<{ error: any; data?: any }>
  signIn: (email: string, password: string) => Promise<{ error: any; data?: any }>
  signOut: () => Promise<{ error: any }>
  quickLoginAs: (role: 'admin' | 'leitor') => Promise<{ error: any }>
  checkEmailInUse: (email: string, excludeUserId?: string) => Promise<boolean>
  loading: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const hadSessionRef = useRef(false)

  // Inicializa o interceptor fetch global uma vez
  useEffect(() => {
    setupFetchSessionExpirationInterceptor()
  }, [])

  const fetchProfile = async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null)
      return
    }

    try {
      const userMeta = currentUser.user_metadata || {}
      let role: UserRole = (userMeta.app_role || userMeta.role || 'leitor') as UserRole
      if (currentUser.email === 'admin@cep.edu.br' || currentUser.email === 'ishii7883@gmail.com') {
        role = 'admin'
      }

      // Check if there is a leitor record linked
      const { data: leitorData } = await supabase
        .from('leitor')
        .select('id_leitor, nome_do_leitor')
        .or(`id_auth.eq.${currentUser.id},email.eq.${currentUser.email}`)
        .maybeSingle()

      // Fetch public.profiles to get real-time avatar_url and latest name/papel
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('nome, full_name, role, papel, avatar_url, telefone')
        .eq('id', currentUser.id)
        .maybeSingle()
      const fullName =
        profileRow?.nome ||
        profileRow?.full_name ||
        leitorData?.nome_do_leitor ||
        userMeta.full_name ||
        currentUser.email?.split('@')[0] ||
        'Usuário'

      const avatarUrl = profileRow?.avatar_url || userMeta.avatar_url || undefined

      setProfile({
        id: currentUser.id,
        email: currentUser.email || '',
        full_name: fullName,
        nome: profileRow?.nome || fullName,
        role: (profileRow?.papel || profileRow?.role || role) as UserRole,
        avatar_url: avatarUrl,
        id_leitor: leitorData?.id_leitor,
      })
    } catch (e) {
      console.error('Error loading profile:', e)
      setProfile({
        id: currentUser.id,
        email: currentUser.email || '',
        full_name: currentUser.email?.split('@')[0] || 'Usuário',
        nome: currentUser.email?.split('@')[0] || 'Usuário',
        role: currentUser.email?.includes('admin') ? 'admin' : 'leitor',
      })
    }
  }

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      // FORBIDDEN: no async/await inside this callback — sync only
      const prevHadSession = hadSessionRef.current
      setSession(newSession)
      setUser(newSession?.user ?? null)
      setLoading(false)

      if (newSession?.user) {
        hadSessionRef.current = true
      } else {
        hadSessionRef.current = false
      }

      // Detecção de sessão expirada via onAuthStateChange:
      // Se havia uma sessão ativa e agora ocorreu SIGNED_OUT ou newSession é nulo sem que tenha sido
      // um logout voluntário pelo usuário (isManualSignOut() === false), disparar expiração apenas se em rota autenticada.
      if (prevHadSession && !newSession && event === 'SIGNED_OUT' && !isManualSignOut()) {
        const curPath = typeof window !== 'undefined' ? window.location.pathname : ''
        if (curPath !== '/' && curPath !== '/acervo' && curPath !== '/login') {
          setTimeout(() => {
            handleSessionExpired('onAuthStateChange_SIGNED_OUT')
          }, 0)
        }
      }
    })

    supabase.auth.getSession().then(({ data: { session: initialSession }, error }) => {
      if (error) {
        console.warn('Erro ao obter sessão inicial:', error)
      }
      setSession(initialSession)
      setUser(initialSession?.user ?? null)
      if (initialSession?.user) {
        hadSessionRef.current = true
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) {
      fetchProfile(user)
    } else {
      setProfile(null)
    }
  }, [user])

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user)
    }
  }

  const checkEmailInUse = async (email: string, excludeUserId?: string): Promise<boolean> => {
    const normalized = email.trim().toLowerCase()
    if (!normalized) return false

    try {
      const { data: exists, error } = await (supabase.rpc as any)('check_email_exists', {
        check_email: normalized,
        exclude_user_id: excludeUserId || null,
      })
      if (!error && typeof exists === 'boolean') {
        return exists
      }
    } catch (e) {
      console.warn('RPC check_email_exists error:', e)
    }

    // Fallback checks
    try {
      const { data: p } = await supabase.from('profiles').select('id').ilike('email', normalized)
      if (p && p.length > 0) {
        if (excludeUserId && p.some((x) => x.id === excludeUserId)) {
          // It's the excluded user
        } else {
          return true
        }
      }

      const { data: l } = await supabase
        .from('leitor')
        .select('id_leitor, id_auth')
        .ilike('email', normalized)
      if (l && l.length > 0) {
        if (excludeUserId && l.some((x) => x.id_auth === excludeUserId)) {
          // It's the excluded user
        } else {
          return true
        }
      }
    } catch (e) {
      console.warn('Fallback email check error:', e)
    }

    return false
  }

  const signUp = async (
    email: string,
    password: string,
    fullName?: string,
    role: UserRole = 'leitor',
    autoSignIn: boolean = true,
  ) => {
    const cleanEmail = email.trim().toLowerCase()
    const cleanName = (fullName || email.split('@')[0]).trim()

    // 1. Pré-validação de e-mail duplicado
    const emailExists = await checkEmailInUse(cleanEmail)
    if (emailExists) {
      return {
        error: {
          message: `O e-mail "${cleanEmail}" já está cadastrado no sistema. Por favor, utilize outro endereço ou faça login com suas credenciais.`,
          isDuplicateEmail: true,
        },
      }
    }

    // 2. Realizar cadastro no Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          full_name: cleanName,
          nome: cleanName,
          role: role,
          papel: role,
          app_role: role,
        },
      },
    })

    if (error) {
      // Caso o Supabase retorne erro de duplicidade
      const msg = error.message?.toLowerCase() || ''
      if (
        msg.includes('already registered') ||
        msg.includes('user already exists') ||
        msg.includes('already been registered')
      ) {
        return {
          error: {
            message: `O e-mail "${cleanEmail}" já está cadastrado no sistema. Por favor, utilize outro endereço ou faça login.`,
            isDuplicateEmail: true,
          },
        }
      }
      return { error }
    }

    if (data.user) {
      // Auto confirm email via RPC for immediate login
      try {
        await (supabase.rpc as any)('confirm_user_email', { user_id: data.user.id })
      } catch (rpcErr) {
        console.warn('Could not auto-confirm reader email via RPC:', rpcErr)
      }

      // Ensure profile row exists
      try {
        await supabase.from('profiles').upsert(
          {
            id: data.user.id,
            email: cleanEmail,
            nome: cleanName,
            full_name: cleanName,
            papel: role,
            role: role,
            bloqueado: false,
          },
          { onConflict: 'id' },
        )
      } catch (profileErr) {
        console.warn('Could not upsert profile:', profileErr)
      }

      // Auto create reader entry if role is leitor
      if (role === 'leitor') {
        try {
          // Check if a leitor row already exists with this email or id_auth
          const { data: existingLeitor } = await supabase
            .from('leitor')
            .select('id_leitor')
            .or(`id_auth.eq.${data.user.id},email.eq.${cleanEmail}`)
            .maybeSingle()

          if (!existingLeitor) {
            await supabase.from('leitor').insert({
              id_auth: data.user.id,
              nome_do_leitor: cleanName,
              email: cleanEmail,
              data_cadastro: new Date().toISOString().split('T')[0],
              bloqueado: false,
            })
          } else {
            await supabase
              .from('leitor')
              .update({ id_auth: data.user.id, nome_do_leitor: cleanName })
              .eq('id_leitor', existingLeitor.id_leitor)
          }
        } catch (err) {
          console.warn('Could not auto-insert/update reader:', err)
        }
      }

      // Login automático imediato caso autoSignIn seja true e ainda não esteja com sessão
      if (autoSignIn && !data.session) {
        try {
          const signInRes = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          })
          if (signInRes.data?.session) {
            setSession(signInRes.data.session)
            setUser(signInRes.data.user)
            await fetchProfile(signInRes.data.user)
          }
        } catch (autoLoginErr) {
          console.warn('Auto sign in error after sign up:', autoLoginErr)
        }
      }
    }

    return { error: null, data }
  }

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (!error && data?.user) {
      setUser(data.user)
      setSession(data.session)
      await fetchProfile(data.user)
    }
    return { data, error }
  }

  const quickLoginAs = async (targetRole: 'admin' | 'leitor') => {
    const email = targetRole === 'admin' ? 'admin@cep.edu.br' : 'leitor@cep.edu.br'
    const password = 'Skip@Pass'
    return await signIn(email, password)
  }

  const signOut = async () => {
    setManualSignOutInProgress(true)
    try {
      const { error } = await supabase.auth.signOut()
      setProfile(null)
      return { error }
    } finally {
      setTimeout(() => {
        setManualSignOutInProgress(false)
      }, 1000)
    }
  }

  // Modo de visualização de leitor para administradores (simulação de permissões)
  const [readerViewSimulation, setReaderViewSimulation] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cep_admin_reader_simulation') === 'true'
    } catch {
      return false
    }
  })

  const realRole: UserRole = profile?.role || (user ? 'leitor' : 'guest')
  const isRealAdmin =
    realRole === 'admin' ||
    user?.email === 'ishii7883@gmail.com' ||
    user?.email === 'admin@cep.edu.br'

  const isSimulatingReader = isRealAdmin && readerViewSimulation

  const toggleReaderViewSimulation = (enable?: boolean) => {
    const nextState = enable !== undefined ? enable : !readerViewSimulation
    setReaderViewSimulation(nextState)
    try {
      localStorage.setItem('cep_admin_reader_simulation', String(nextState))
    } catch {
      /* intentionally ignored */
    }
  }

  const effectiveRole: UserRole = isSimulatingReader ? 'leitor' : realRole
  const isAdmin = isSimulatingReader ? false : isRealAdmin
  const isOperadorDiretoria = isSimulatingReader ? false : effectiveRole === 'operador_diretoria'
  const isDiretoriaOrAdmin = isSimulatingReader ? false : isRealAdmin || isOperadorDiretoria
  const isOperadorOrAdmin = isSimulatingReader
    ? false
    : isRealAdmin || effectiveRole === 'operador' || isOperadorDiretoria

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role: effectiveRole,
        isAdmin,
        isOperadorOrAdmin,
        isOperadorDiretoria,
        isDiretoriaOrAdmin,
        isRealAdmin,
        isSimulatingReader,
        toggleReaderViewSimulation,
        signUp,
        signIn,
        signOut,
        quickLoginAs,
        checkEmailInUse,
        loading,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
