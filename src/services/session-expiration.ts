import { supabase } from '@/lib/supabase/client'

// Chaves para armazenamento e search param
export const SESSION_EXPIRED_PARAM = 'expirada'
export const SESSION_EXPIRED_MESSAGE = 'Sua sessão expirou. Faça login novamente.'
const SESSION_EXPIRED_STORAGE_KEY = 'cep_session_expired_flag'

// Flag em memória para evitar múltiplos redirecionamentos simultâneos
let isHandlingSessionExpiry = false
let manualSignOutInProgress = false

/**
 * Sinaliza que um signOut manual (iniciado pelo usuário) começou,
 * para evitar que o evento SIGNED_OUT seja confundido com expiração de sessão.
 */
export function setManualSignOutInProgress(value: boolean) {
  manualSignOutInProgress = value
}

export function isManualSignOut(): boolean {
  return manualSignOutInProgress
}

/**
 * Marca que a sessão expirou e deve ser tratada
 */
export function markSessionExpired() {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_STORAGE_KEY, '1')
  } catch {
    // sessionStorage indisponível ou bloqueado
  }
}

/**
 * Verifica se a sessão está com aviso de expiração pendente
 */
export function checkHasSessionExpired(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_EXPIRED_STORAGE_KEY) === '1') {
      return true
    }
  } catch {
    // fallback
  }

  // Verifica na URL caso esteja com ?expirada=1
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    if (params.get(SESSION_EXPIRED_PARAM) === '1') {
      return true
    }
  }

  return false
}

/**
 * Limpa o status de sessão expirada (ex: após login bem-sucedido ou descarte)
 */
export function clearSessionExpired() {
  try {
    sessionStorage.removeItem(SESSION_EXPIRED_STORAGE_KEY)
  } catch {
    // ignore
  }

  // Limpa também parâmetro da URL se presente sem recarregar a página
  if (
    typeof window !== 'undefined' &&
    window.location.search.includes(`${SESSION_EXPIRED_PARAM}=1`)
  ) {
    const url = new URL(window.location.href)
    url.searchParams.delete(SESSION_EXPIRED_PARAM)
    const newSearch = url.searchParams.toString()
    const cleanUrl = url.pathname + (newSearch ? `?${newSearch}` : '') + url.hash
    window.history.replaceState(null, '', cleanUrl)
  }

  isHandlingSessionExpiry = false
}

/**
 * Executa o fluxo de expiração de sessão:
 * 1. Evita múltiplos disparos simultâneos (flag em memória isHandlingSessionExpiry)
 * 2. Limpa o token da sessão local
 * 3. Redireciona de forma limpa para /login (sem banners ou parâmetros de erro)
 */
export async function handleSessionExpired(reason?: string) {
  if (isHandlingSessionExpiry) {
    return
  }

  // Se o usuário clicou voluntariamente em "Sair", não considerar como expiração
  if (manualSignOutInProgress) {
    return
  }

  isHandlingSessionExpiry = true
  console.warn(
    `[Sessão Expirada] Disparado fluxo de logout por expiração. Motivo: ${reason || 'desconhecido'}`,
  )

  try {
    // Tenta deslogar localmente para limpar qualquer token residual
    await supabase.auth.signOut({ scope: 'local' })
  } catch (err) {
    console.warn('[Sessão Expirada] Erro ao executar signOut local:', err)
  }

  // Se já estiver na página de login ou na página inicial "/", encerra sem redirecionar forçadamente para /login
  // A rota raiz "/" é pública e deve permanecer acessível mesmo quando deslogado ou com sessão expirada.
  if (typeof window !== 'undefined') {
    const currentPath = window.location.pathname

    if (currentPath === '/login' || currentPath === '/' || currentPath === '') {
      isHandlingSessionExpiry = false
      return
    }

    // Redirecionamento limpo para /login apenas se estiver em rota restrita
    // Usamos window.location.assign para garantir que todo o estado em memória seja redefinido
    window.location.assign('/login')
  }
}

// Configuração do interceptor global de requisições fetch para capturar 401 e 400 em refresh_token
let isInterceptorInstalled = false

export function setupFetchSessionExpirationInterceptor() {
  if (isInterceptorInstalled || typeof window === 'undefined' || !window.fetch) {
    return
  }

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (...args) => {
    const response = await originalFetch(...args)

    const url =
      typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : ''
    const isSupabaseRequest =
      url.includes('.supabase.co') || url.includes('/auth/v1') || url.includes('/rest/v1')

    if (isSupabaseRequest) {
      // Caso 1: refresh_token falhou com 400 (ex: invalid_grant, refresh token not found/already used)
      if (
        response.status === 400 &&
        url.includes('/token') &&
        url.includes('grant_type=refresh_token')
      ) {
        console.warn('[Auth Interceptor] Falha de refresh token (HTTP 400). Sessão expirada.')
        setTimeout(() => {
          handleSessionExpired('refresh_token_400')
        }, 0)
      }

      // Caso 2: Chamada REST ou Edge Function retornou 401 Unauthorized
      // Evitamos disparar se já for uma chamada para sign in / recover password
      // E não redirecionamos se o usuário já estiver na rota inicial "/" ou no acervo público
      if (response.status === 401 && !url.includes('/token?grant_type=password')) {
        console.warn('[Auth Interceptor] Chamada Supabase retornou 401 Unauthorized.')
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
        if (currentPath !== '/' && currentPath !== '/acervo' && currentPath !== '/login') {
          setTimeout(() => {
            handleSessionExpired('rest_401')
          }, 0)
        }
      }
    }

    return response
  }

  isInterceptorInstalled = true
}
