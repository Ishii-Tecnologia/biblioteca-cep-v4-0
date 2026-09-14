import { supabase } from '@/lib/supabase/client'
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/supabase/types'
import { HistoricoService } from './historico'

export type Exemplar = Tables<'exemplar'>
export type ExemplarInsert = TablesInsert<'exemplar'>
export type ExemplarUpdate = TablesUpdate<'exemplar'>

export interface ExemplarWithTitulo extends Exemplar {
  titulo?: Tables<'titulo'>
  ultimo_emprestimo?: {
    id_emprestimo: number
    id_leitor: number
    data_emprestimo: string
    data_prevista_devolucao: string
    leitor?: {
      nome_do_leitor: string
      email: string
    }
  }
}

export const ExemplaresService = {
  async getByTitulo(id_titulo: string) {
    const { data, error } = await supabase
      .from('exemplar')
      .select('*')
      .eq('id_titulo', id_titulo)
      .order('seq', { ascending: true })

    if (error) throw error
    return data
  },

  async getAll(statusFilter?: string) {
    let query = supabase
      .from('exemplar')
      .select('*, titulo(*)')
      .order('id_exemplar', { ascending: true })

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'Manutencao' || statusFilter === 'EM_MANUTENCAO') {
        query = query.in('status', ['Manutencao', 'EM_MANUTENCAO', 'Em Manutencao'])
      } else {
        query = query.eq('status', statusFilter)
      }
    }

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async create(
    id_titulo: string,
    localizacao = 'Estante Geral',
    quantidade = 1,
    operador?: { nome?: string; id?: string },
  ) {
    // Buscar dados do título para log rico
    const { data: tituloData } = await supabase
      .from('titulo')
      .select('titulo_de_livro')
      .eq('id_titulo', id_titulo)
      .maybeSingle()

    const tituloNome = tituloData?.titulo_de_livro || id_titulo

    const { data: existing } = await supabase
      .from('exemplar')
      .select('seq')
      .eq('id_titulo', id_titulo)
      .order('seq', { ascending: false })
      .limit(1)

    const startSeq = existing && existing.length > 0 ? existing[0].seq + 1 : 1
    const inserts: ExemplarInsert[] = []

    for (let i = 0; i < quantidade; i++) {
      const seq = startSeq + i
      inserts.push({
        id_exemplar: `${id_titulo}-${seq}`,
        id_titulo: id_titulo,
        seq: seq,
        status: 'Disponivel',
        localizacao: localizacao,
      })
    }

    const { data, error } = await supabase.from('exemplar').insert(inserts).select()
    if (error) throw error

    // Auditoria: registrar inclusão dos novos exemplares
    try {
      const nomeOp = operador?.nome || 'Operador'
      const idOp = operador?.id || null

      if (data && data.length > 0) {
        for (const ex of data) {
          await HistoricoService.log(
            ex.id_exemplar,
            'Inclusão de Exemplar',
            null,
            `Inclusão de novo exemplar ${ex.id_exemplar} para a obra "${tituloNome}" (${id_titulo})`,
            nomeOp,
            'exemplar',
            idOp,
            `Localização: ${localizacao}`,
          )
        }
      }
    } catch (auditErr) {
      console.error('Erro ao registrar auditoria na inclusão de exemplar:', auditErr)
    }

    return data
  },

  /**
   * Atualiza o status do exemplar com registro no Histórico Geral de Operações (F-03)
   */
  async updateStatus(
    id_exemplar: string,
    status: string,
    localizacao?: string,
    observacao?: string,
    operatorName = 'Sistema',
    explicitUserId?: string | null,
  ) {
    // Normalizar status para Manutencao
    const finalStatus = status === 'EM_MANUTENCAO' ? 'Manutencao' : status

    const updateObj: ExemplarUpdate = { status: finalStatus }
    if (localizacao !== undefined) {
      updateObj.localizacao = localizacao
    }

    // Buscar título e dados atuais para log rico
    const { data: currentEx } = await supabase
      .from('exemplar')
      .select('*, titulo(titulo_de_livro, autor)')
      .eq('id_exemplar', id_exemplar)
      .single()

    const { data, error } = await supabase
      .from('exemplar')
      .update(updateObj)
      .eq('id_exemplar', id_exemplar)
      .select()
      .single()

    if (error) throw error

    // F-03 e Auditoria: Registrar evento no histórico geral com observação e nome do usuário
    try {
      const bookTitle = (currentEx?.titulo as any)?.titulo_de_livro || id_exemplar
      const obsClean = observacao?.trim() || null
      const obsText = obsClean ? ` — Motivo: ${obsClean}` : ''

      if (finalStatus === 'Manutencao') {
        await HistoricoService.log(
          id_exemplar,
          'Entrada em Manutenção',
          null,
          `Exemplar ${id_exemplar} ("${bookTitle}") enviado para manutenção física${obsText}`,
          operatorName,
          'exemplar',
          explicitUserId,
          obsClean,
        )
      } else if (currentEx?.status === 'Manutencao' && finalStatus === 'Disponivel') {
        await HistoricoService.log(
          id_exemplar,
          'Saída de Manutenção',
          null,
          `Exemplar ${id_exemplar} ("${bookTitle}") liberado da manutenção para disponibilidade${obsText}`,
          operatorName,
          'exemplar',
          explicitUserId,
          obsClean,
        )
      } else if (finalStatus === 'Perdido') {
        await HistoricoService.log(
          id_exemplar,
          'Baixa / Perdido',
          null,
          `Exemplar ${id_exemplar} ("${bookTitle}") baixado do acervo como perdido/danificado${obsText}`,
          operatorName,
          'exemplar',
          explicitUserId,
          obsClean,
        )
      } else if (currentEx?.status !== finalStatus) {
        await HistoricoService.log(
          id_exemplar,
          'Alteração de Exemplar',
          null,
          `Alteração de status do exemplar ${id_exemplar} ("${bookTitle}"): ${currentEx?.status || '-'} ➔ ${finalStatus}${obsText}`,
          operatorName,
          'exemplar',
          explicitUserId,
          obsClean,
        )
      } else if (localizacao !== undefined && localizacao !== currentEx?.localizacao) {
        // Alteração apenas da localização do exemplar
        await HistoricoService.log(
          id_exemplar,
          'Alteração de Exemplar',
          null,
          `Alteração de localização do exemplar ${id_exemplar} ("${bookTitle}"): "${currentEx?.localizacao || 'Estante Geral'}" ➔ "${localizacao}"`,
          operatorName,
          'exemplar',
          explicitUserId,
          obsClean,
        )
      }
    } catch (logErr) {
      console.warn('Erro ao registrar log no histórico:', logErr)
    }

    return data
  },

  async delete(id_exemplar: string, operador?: { nome?: string; id?: string }) {
    // Buscar exemplar antes de remover para gravar log detalhado
    const { data: exData } = await supabase
      .from('exemplar')
      .select('*, titulo(titulo_de_livro, autor)')
      .eq('id_exemplar', id_exemplar)
      .maybeSingle()

    const { data: loan } = await supabase
      .from('emprestimo')
      .select('id_emprestimo')
      .eq('id_exemplar', id_exemplar)
      .is('data_devolucao_real', null)
      .maybeSingle()

    if (loan) {
      throw new Error('Não é possível remover um exemplar que está atualmente emprestado.')
    }

    // Desvincular de reservas que possam apontar para este exemplar como exemplar_reservado_id
    try {
      await supabase
        .from('reserva')
        .update({ exemplar_reservado_id: null })
        .eq('exemplar_reservado_id', id_exemplar)
    } catch {
      // continua
    }

    // Excluir empréstimos já concluídos desse exemplar específico para não violar FK
    try {
      await supabase.from('emprestimo').delete().eq('id_exemplar', id_exemplar)
    } catch {
      // continua
    }

    const { error } = await supabase.from('exemplar').delete().eq('id_exemplar', id_exemplar)
    if (error) throw error

    // Auditoria: registrar exclusão do exemplar
    try {
      const nomeOp = operador?.nome || 'Operador'
      const idOp = operador?.id || null
      const bookTitle = (exData?.titulo as any)?.titulo_de_livro || exData?.id_titulo || ''

      await HistoricoService.log(
        id_exemplar,
        'Exclusão de Exemplar',
        null,
        `Exclusão do exemplar ${id_exemplar}${bookTitle ? ` da obra "${bookTitle}"` : ''}`,
        nomeOp,
        'exemplar',
        idOp,
        `Status anterior: ${exData?.status || 'Disponível'}; Localização: ${exData?.localizacao || 'Estante Geral'}`,
      )
    } catch (auditErr) {
      console.error('Erro ao registrar auditoria na exclusão de exemplar:', auditErr)
    }
  },
}
