import { supabase } from '@/lib/supabase/client'

export interface StorageOrfao {
  bucket: string
  name: string
  size: number
  created_at: string
}

export interface StorageBucketResumo {
  total: number
  orfaos: number
  bytes: number
}

export interface StorageLimpezaAnalise {
  success: boolean
  resumo: Record<string, StorageBucketResumo>
  orfaos: StorageOrfao[]
}

export interface StorageLimpezaExclusao {
  success: boolean
  removidos: number
  bytes_liberados: number
  ignorados: string[]
  erros: string[]
}

const FUNCTION_NAME = 'storage_limpeza_orfaos'
const MSG_FALHA_CONEXAO =
  'Não foi possível concluir a operação no Storage. Verifique sua conexão e tente novamente.'

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  let data: any = null
  let error: any = null
  try {
    const res = await supabase.functions.invoke(FUNCTION_NAME, { body })
    data = res.data
    error = res.error
  } catch {
    throw new Error(MSG_FALHA_CONEXAO)
  }

  if (error) {
    let msg = MSG_FALHA_CONEXAO
    try {
      const errBody = await error.context?.json?.()
      if (errBody?.error) msg = errBody.error
    } catch {
      // resposta sem JSON: mantém a mensagem amigável padrão
    }
    throw new Error(msg)
  }

  if (data?.error) throw new Error(data.error)
  return data as T
}

export const StorageLimpezaService = {
  /** Lista as capas órfãs a partir do estado atual do banco e do Storage (não apaga nada). */
  analisar(): Promise<StorageLimpezaAnalise> {
    return invocar<StorageLimpezaAnalise>({ action: 'analisar' })
  },

  /** Apaga somente os itens que continuam órfãos no momento da exclusão. */
  excluir(itens: { bucket: string; name: string }[]): Promise<StorageLimpezaExclusao> {
    return invocar<StorageLimpezaExclusao>({ action: 'excluir', itens })
  },
}
