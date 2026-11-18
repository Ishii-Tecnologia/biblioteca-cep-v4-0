import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticateCaller } from '../_shared/auth.ts'

/**
 * Limpeza de arquivos órfãos dos buckets "capas" e "avatars".
 * - action "analisar": lista os órfãos (nenhum registro referencia o arquivo).
 * - action "excluir": recalcula os órfãos no momento da exclusão e apaga apenas
 *   os itens selecionados que continuam órfãos; registra a ocorrência no historico.
 * Somente staff (admin/operador) autenticado pode executar.
 */

const BUCKETS = ['capas', 'avatars'] as const
type BucketName = (typeof BUCKETS)[number]

// Arquivos enviados há menos de 1 hora são ignorados (upload em andamento, ainda sem registro).
const GRACE_MS = 60 * 60 * 1000
const PAGE_SIZE = 1000

interface StorageItem {
  bucket: BucketName
  name: string
  size: number
  created_at: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Converte uma URL pública (ou caminho relativo) no path do objeto dentro do bucket. */
function extrairPath(valor: string | null | undefined, bucket: BucketName): string | null {
  if (!valor) return null
  const marcador = `/object/public/${bucket}/`
  const idx = valor.indexOf(marcador)
  let p = idx >= 0 ? valor.slice(idx + marcador.length) : valor
  p = p.split('?')[0]
  if (idx < 0 && p.startsWith(`${bucket}/`)) p = p.slice(bucket.length + 1)
  try {
    p = decodeURIComponent(p)
  } catch {
    // mantém o valor original
  }
  return p.replace(/^\/+/, '')
}

async function listarBucket(admin: any, bucket: BucketName): Promise<StorageItem[]> {
  const out: StorageItem[] = []

  async function percorrer(prefixo: string) {
    let offset = 0
    while (true) {
      const { data, error } = await admin.storage.from(bucket).list(prefixo, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw new Error(`Falha ao listar o bucket ${bucket}: ${error.message}`)
      if (!data || data.length === 0) break

      for (const item of data) {
        const caminho = prefixo ? `${prefixo}/${item.name}` : item.name
        if (item.id === null) {
          // pasta: percorre recursivamente
          await percorrer(caminho)
        } else {
          out.push({
            bucket,
            name: caminho,
            size: Number((item as any).metadata?.size ?? 0),
            created_at: item.created_at ?? '',
          })
        }
      }
      if (data.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }
  }

  await percorrer('')
  return out
}

async function buscarTodos(admin: any, tabela: string, coluna: string): Promise<string[]> {
  const valores: string[] = []
  let from = 0
  while (true) {
    const { data, error } = await admin
      .from(tabela)
      .select(coluna)
      .not(coluna, 'is', null)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Falha ao consultar ${tabela}: ${error.message}`)
    if (!data || data.length === 0) break
    for (const row of data) {
      if (row[coluna]) valores.push(row[coluna])
    }
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return valores
}

/** Calcula os órfãos atuais de cada bucket, sempre a partir do banco e do Storage. */
async function calcularOrfaos(admin: any) {
  const [titulosCapas, perfisAvatars, leitoresFotos] = await Promise.all([
    buscarTodos(admin, 'titulo', 'capa_url'),
    buscarTodos(admin, 'profiles', 'avatar_url'),
    buscarTodos(admin, 'leitor', 'foto'),
  ])

  const referenciadas: Record<BucketName, Set<string>> = {
    capas: new Set(),
    avatars: new Set(),
  }
  // Conservador: qualquer valor gravado nos registros protege o arquivo nos dois buckets.
  const todosValores = [...titulosCapas, ...perfisAvatars, ...leitoresFotos]
  for (const url of todosValores) {
    for (const bucket of BUCKETS) {
      const p = extrairPath(url, bucket)
      if (p) referenciadas[bucket].add(p)
    }
  }

  const resumo: Record<BucketName, { total: number; orfaos: number; bytes: number }> = {
    capas: { total: 0, orfaos: 0, bytes: 0 },
    avatars: { total: 0, orfaos: 0, bytes: 0 },
  }
  const orfaos: StorageItem[] = []
  const agora = Date.now()

  for (const bucket of BUCKETS) {
    const objetos = await listarBucket(admin, bucket)
    resumo[bucket].total = objetos.length
    for (const obj of objetos) {
      if (referenciadas[bucket].has(obj.name)) continue
      const criadoEm = Date.parse(obj.created_at)
      if (!Number.isNaN(criadoEm) && agora - criadoEm < GRACE_MS) continue
      orfaos.push(obj)
      resumo[bucket].orfaos += 1
      resumo[bucket].bytes += obj.size
    }
  }

  return { resumo, orfaos }
}

function formatarMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Configuração do servidor ausente.' }, 500)
    }

    const authResult = await authenticateCaller(req, { requireStaff: true, requireAdmin: false })
    if ('response' in authResult) {
      return authResult.response
    }
    const caller = authResult.caller
    // Regra do projeto: a limpeza é restrita a admin e operador (não operador_diretoria).
    if (caller.papel !== 'admin' && caller.papel !== 'operador') {
      return jsonResponse(
        { error: 'Acesso negado: a limpeza do Storage é restrita a administradores e operadores.' },
        403,
      )
    }

    const body = await req.json().catch(() => ({}))
    const action = body?.action
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    if (action === 'analisar') {
      const { resumo, orfaos } = await calcularOrfaos(admin)
      return jsonResponse({ success: true, resumo, orfaos })
    }

    if (action === 'excluir') {
      const itens: { bucket: string; name: string }[] = Array.isArray(body?.itens) ? body.itens : []
      if (itens.length === 0) {
        return jsonResponse({ error: 'Nenhum arquivo selecionado para exclusão.' }, 400)
      }

      // Recalcula os órfãos agora: só apaga o que ainda não tem referência.
      const { orfaos } = await calcularOrfaos(admin)
      const chave = (b: string, n: string) => `${b}::${n}`
      const mapaOrfaos = new Map(orfaos.map((o) => [chave(o.bucket, o.name), o]))

      const aApagar: StorageItem[] = []
      const ignorados: string[] = []
      const vistos = new Set<string>()
      for (const item of itens) {
        const k = chave(String(item?.bucket), String(item?.name))
        if (vistos.has(k)) continue
        vistos.add(k)
        const orfao = mapaOrfaos.get(k)
        if (orfao) aApagar.push(orfao)
        else ignorados.push(String(item?.name))
      }

      const erros: string[] = []
      const removidos: StorageItem[] = []
      for (const bucket of BUCKETS) {
        const nomes = aApagar.filter((o) => o.bucket === bucket).map((o) => o.name)
        for (let i = 0; i < nomes.length; i += 100) {
          const lote = nomes.slice(i, i + 100)
          const { data, error } = await admin.storage.from(bucket).remove(lote)
          if (error) {
            erros.push(`${bucket}: ${error.message}`)
            continue
          }
          const apagados = new Set((data ?? []).map((d: any) => d.name))
          for (const obj of aApagar) {
            if (obj.bucket === bucket && apagados.has(obj.name)) removidos.push(obj)
          }
        }
      }

      const bytesLiberados = removidos.reduce((acc, o) => acc + o.size, 0)
      const porBucket = BUCKETS.map((b) => {
        const qtd = removidos.filter((o) => o.bucket === b).length
        return `${b}: ${qtd}`
      }).join(', ')

      if (removidos.length > 0) {
        const nomesRegistro = removidos.slice(0, 100).map((o) => `${o.bucket}/${o.name}`)
        const { error: logError } = await admin.from('historico').insert({
          tipo: 'Limpeza de Storage Concluída',
          descricao: `Limpeza do Storage: ${removidos.length} arquivo(s) excluído(s), ${formatarMB(bytesLiberados)} MB liberados (${porBucket}).`,
          entidade_tipo: 'sistema',
          entidade_id: 'limpeza_storage',
          usuario_id: caller.userId,
          observacao: [
            `Executado por: ${caller.nome || caller.email}`,
            `Arquivos: ${removidos.length}`,
            `Bytes liberados: ${bytesLiberados}`,
            `Itens: ${nomesRegistro.join(', ')}${removidos.length > 100 ? ' ...' : ''}`,
          ].join(' | '),
        })
        if (logError) {
          console.warn('[storage-limpeza] Falha ao registrar no historico:', logError)
        }
      }

      return jsonResponse({
        success: true,
        removidos: removidos.length,
        bytes_liberados: bytesLiberados,
        ignorados,
        erros,
      })
    }

    return jsonResponse({ error: 'Ação inválida.' }, 400)
  } catch (err: any) {
    console.error('[storage-limpeza] Erro:', err)
    return jsonResponse({ error: err?.message || 'Erro interno na limpeza do Storage.' }, 500)
  }
})
