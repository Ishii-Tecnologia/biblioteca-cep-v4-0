import { createClient, type User } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from './cors.ts'

export interface CallerAuthContext {
  user: User
  userId: string
  email: string
  papel: 'admin' | 'operador' | 'operador_diretoria' | 'leitor'
  nome: string
  isStaff: boolean
  isAdmin: boolean
  canAccessDiretoria: boolean
  token: string
}

export interface AuthGuardOptions {
  /**
   * Se true, exige papel de staff ('admin', 'operador' ou 'operador_diretoria').
   * Se false, aceita qualquer usuário autenticado válido.
   * Default: true
   */
  requireStaff?: boolean
  /**
   * Se true, exige exclusivamente papel 'admin'.
   * Default: false
   */
  requireAdmin?: boolean
}

/**
 * Valida o JWT do chamador extraído do header Authorization (Bearer <token>).
 * Valida via gotrue / supabase.auth.getUser(token) usando a chave de API pública/anon ou service_role,
 * consulta o papel do perfil em public.profiles (e fallback em user_metadata) e valida as regras de papel.
 * Retorna CallerAuthContext em caso de sucesso ou Response (401/403) em caso de erro.
 */
export async function authenticateCaller(
  req: Request,
  options: AuthGuardOptions = { requireStaff: true, requireAdmin: false },
): Promise<{ caller: CallerAuthContext } | { response: Response }> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''

  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  const token = match ? match[1].trim() : ''

  if (!token) {
    return {
      response: new Response(
        JSON.stringify({
          error:
            'Acesso não autorizado: token de autenticação (JWT) ausente no cabeçalho Authorization.',
          code: 'UNAUTHORIZED_MISSING_TOKEN',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      ),
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

  if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
    return {
      response: new Response(
        JSON.stringify({
          error: 'Configuração interna do servidor ausente (SUPABASE_URL / KEYS).',
          code: 'SERVER_MISCONFIGURED',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      ),
    }
  }

  // 1. Validar token com o cliente Supabase usando o próprio token recebido
  const authClient = createClient(supabaseUrl, anonKey || serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })

  const { data: userData, error: userError } = await authClient.auth.getUser(token)

  if (userError || !userData?.user) {
    return {
      response: new Response(
        JSON.stringify({
          error: 'Sessão inválida ou expirada. Efetue login novamente para continuar.',
          code: 'UNAUTHORIZED_INVALID_TOKEN',
          details: userError?.message,
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      ),
    }
  }

  const user = userData.user
  const userId = user.id
  const email = (user.email || '').trim().toLowerCase()

  // 2. Resolver o papel em public.profiles usando service_role para contornar qualquer restrição
  const adminClient = createClient(supabaseUrl, serviceRoleKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let papel: 'admin' | 'operador' | 'operador_diretoria' | 'leitor' = 'leitor'
  let nome = ''

  try {
    const { data: profileRow } = await adminClient
      .from('profiles')
      .select('papel, role, nome, full_name, bloqueado')
      .eq('id', userId)
      .maybeSingle()

    if (profileRow?.bloqueado) {
      return {
        response: new Response(
          JSON.stringify({
            error: 'Esta conta de usuário está bloqueada para operações no sistema.',
            code: 'FORBIDDEN_USER_BLOCKED',
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        ),
      }
    }

    const resolvedRole = (profileRow?.papel || profileRow?.role || '').toLowerCase()
    if (
      resolvedRole === 'admin' ||
      resolvedRole === 'operador' ||
      resolvedRole === 'operador_diretoria'
    ) {
      papel = resolvedRole
    }

    nome = (profileRow?.nome || profileRow?.full_name || '').trim()
  } catch (profErr) {
    console.warn('[auth-guard] Erro ao consultar perfil:', profErr)
  }

  // Fallback para user_metadata se perfil ainda não tiver o papel
  if (papel === 'leitor') {
    const metaRole = (
      user.user_metadata?.papel ||
      user.user_metadata?.app_role ||
      user.user_metadata?.role ||
      ''
    ).toLowerCase()
    if (metaRole === 'admin' || metaRole === 'operador' || metaRole === 'operador_diretoria') {
      papel = metaRole
    }
  }

  // Super-admin garantido por configuração conhecida do projeto
  if (email === 'admin@cep.edu.br' || email === 'ishii7883@gmail.com') {
    papel = 'admin'
  }

  if (!nome) {
    nome = (user.user_metadata?.nome || user.user_metadata?.full_name || email.split('@')[0]).trim()
  }

  const isStaff = papel === 'admin' || papel === 'operador' || papel === 'operador_diretoria'
  const isAdmin = papel === 'admin'
  const canAccessDiretoria = papel === 'admin' || papel === 'operador_diretoria'

  // 3. Validação de Papel Exigido
  if (options.requireAdmin && !isAdmin) {
    return {
      response: new Response(
        JSON.stringify({
          error:
            'Acesso negado: esta operação é exclusiva para o papel Administrador. Permissão insuficiente.',
          code: 'FORBIDDEN_ADMIN_REQUIRED',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      ),
    }
  }

  if (options.requireStaff !== false && !isStaff) {
    return {
      response: new Response(
        JSON.stringify({
          error:
            'Acesso negado: operação restrita a papéis internos da biblioteca (administradores e operadores). Leitores não possuem permissão para executar esta ação.',
          code: 'FORBIDDEN_STAFF_REQUIRED',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      ),
    }
  }

  return {
    caller: {
      user,
      userId,
      email,
      papel,
      nome,
      isStaff,
      isAdmin,
      canAccessDiretoria,
      token,
    },
  }
}

/**
 * Rate Limiter simples em memória por chave (ex.: IP ou userId)
 * Padrão: máx 5 chamadas por minuto (windowMs = 60_000, maxRequests = 5)
 */
interface RateLimitRecord {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitRecord>()

export function checkRateLimit(
  key: string,
  maxRequests = 5,
  windowMs = 60_000,
): { allowed: boolean; remaining: number; resetInSeconds: number } {
  const now = Date.now()

  // Limpeza periódica leve
  if (rateLimitStore.size > 2000) {
    for (const [k, rec] of rateLimitStore.entries()) {
      if (rec.resetAt < now) {
        rateLimitStore.delete(k)
      }
    }
  }

  const record = rateLimitStore.get(key)
  if (!record || record.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetInSeconds: Math.ceil(windowMs / 1000),
    }
  }

  if (record.count >= maxRequests) {
    const resetInSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000))
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds,
    }
  }

  record.count += 1
  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
  }
}

export function extractClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    'unknown-client'
  )
}

/**
 * Registra a transição ou ação sensível na tabela public.auditoria_transicoes
 */
export async function logTransicaoAuditoria({
  supabaseAdmin,
  entidade,
  registroId,
  estadoAnterior,
  estadoNovo,
  operadorId,
  operadorNome,
  motivo,
  payload,
}: {
  supabaseAdmin: any
  entidade: string
  registroId: string
  estadoAnterior?: string | null
  estadoNovo: string
  operadorId?: string | null
  operadorNome?: string | null
  motivo?: string | null
  payload?: Record<string, any> | null
}) {
  try {
    await supabaseAdmin.from('auditoria_transicoes').insert({
      entidade,
      registro_id: registroId,
      estado_anterior: estadoAnterior || null,
      estado_novo: estadoNovo,
      operador_id: operadorId || null,
      operador_nome: operadorNome || null,
      motivo: motivo || null,
      payload: payload || null,
    })
  } catch (err) {
    console.warn('[audit] Falha ao gravar auditoria_transicoes:', err)
  }
}
