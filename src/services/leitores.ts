import { supabase } from '@/lib/supabase/client'
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/supabase/types'

export type Leitor = Tables<'leitor'>
export type LeitorInsert = TablesInsert<'leitor'>
export type LeitorUpdate = TablesUpdate<'leitor'>

export interface LeitorWithStats extends Leitor {
  telefone_fixo: string | null
  status_cadastro: string
  emprestimos_ativos: number
  emprestimos_atrasados: number
  total_emprestimos: number
  cursos_nomes?: string[]
  cursos_ids?: string[]
}

export const LeitoresService = {
  async getAll(searchQuery?: string, filterStatus?: 'all' | 'ativos' | 'bloqueados' | 'pendentes') {
    let query = supabase
      .from('leitor')
      .select(`
        *,
        emprestimo(id_emprestimo, data_devolucao_real, atraso, data_prevista_devolucao),
        leitor_curso(id_curso, cursos:id_curso(id, nome))
      `)
      .order('nome_do_leitor', { ascending: true })

    if (filterStatus === 'ativos') {
      query = (query as any).eq('bloqueado', false).neq('status_cadastro', 'pendente')
    } else if (filterStatus === 'bloqueados') {
      query = query.eq('bloqueado', true)
    } else if (filterStatus === 'pendentes') {
      query = (query as any).eq('status_cadastro', 'pendente')
    }

    if (searchQuery && searchQuery.trim()) {
      const q = `%${searchQuery.trim()}%`
      query = query.or(
        `nome_do_leitor.ilike.${q},email.ilike.${q},telefone.ilike.${q},telefone_fixo.ilike.${q}`,
      )
    }

    const { data, error } = await query
    if (error) throw error

    const now = new Date()
    const formatted: LeitorWithStats[] = (data || []).map((l: any) => {
      const loans = l.emprestimo || []
      const activeLoans = loans.filter((lo: any) => !lo.data_devolucao_real)
      const overdueLoans = activeLoans.filter((lo: any) => {
        if (lo.atraso) return true
        if (lo.data_prevista_devolucao) {
          return new Date(lo.data_prevista_devolucao) < now
        }
        return false
      })

      // Extrair múltiplos cursos vinculados
      const rawCursos = l.leitor_curso || []
      const cursosNomes: string[] = []
      const cursosIds: string[] = []

      for (const item of rawCursos) {
        if (item.cursos && item.cursos.nome) {
          cursosNomes.push(item.cursos.nome)
          if (item.cursos.id) cursosIds.push(item.cursos.id)
        }
      }

      // Se não houver vínculos na tabela associativa mas houver o campo legado/direto l.curso
      if (cursosNomes.length === 0 && l.curso) {
        cursosNomes.push(l.curso)
      }

      return {
        id_leitor: l.id_leitor,
        id_auth: l.id_auth,
        nome_do_leitor: l.nome_do_leitor,
        email: l.email,
        telefone: l.telefone,
        telefone_fixo: l.telefone_fixo || null,
        status_cadastro: l.status_cadastro || 'ativo',
        data_cadastro: l.data_cadastro,
        bloqueado: l.bloqueado,
        curso: l.curso || null,
        acesso_diretoria: Boolean(l.acesso_diretoria),
        cursos_nomes: cursosNomes,
        cursos_ids: cursosIds,
        foto: l.foto || null,
        created_at: l.created_at,
        emprestimos_ativos: activeLoans.length,
        emprestimos_atrasados: overdueLoans.length,
        total_emprestimos: loans.length,
      }
    })

    return formatted
  },

  async getById(id_leitor: number) {
    const { data, error } = await supabase
      .from('leitor')
      .select(`
        *,
        emprestimo(
          *,
          exemplar(*, titulo(*))
        ),
        reserva(
          *,
          titulo(*)
        ),
        leitor_curso(id_curso, cursos:id_curso(id, nome))
      `)
      .eq('id_leitor', id_leitor)
      .single()

    if (error) throw error
    return data
  },

  async checkEmailExists(email: string, excludeIdLeitor?: number): Promise<boolean> {
    const normalized = email.trim().toLowerCase()
    if (!normalized) return false

    // 1. Tentar verificar via RPC abrangente (auth.users, profiles, leitor)
    try {
      const { data: rpcExists, error: rpcError } = await (supabase.rpc as any)(
        'check_email_exists',
        {
          check_email: normalized,
        },
      )
      if (!rpcError && typeof rpcExists === 'boolean') {
        if (rpcExists) {
          // Se estamos excluindo o próprio leitor na edição, checar se o email é do próprio
          if (excludeIdLeitor) {
            const { data: ownData } = await supabase
              .from('leitor')
              .select('id_leitor, email')
              .eq('id_leitor', excludeIdLeitor)
              .maybeSingle()
            if (ownData && ownData.email?.trim().toLowerCase() === normalized) {
              return false
            }
          }
          return true
        }
        return false
      }
    } catch (e) {
      console.warn('Fallback para checagem direta de email:', e)
    }

    // 2. Fallback de verificação em leitor e profiles
    let leitorQuery = supabase.from('leitor').select('id_leitor').ilike('email', normalized)

    if (excludeIdLeitor) {
      leitorQuery = leitorQuery.neq('id_leitor', excludeIdLeitor)
    }

    const { data: leitorData } = await leitorQuery
    if (leitorData && leitorData.length > 0) return true

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', normalized)

    return (profileData && profileData.length > 0) || false
  },

  async create(leitor: LeitorInsert) {
    const { data, error } = await supabase
      .from('leitor')
      .insert({
        ...leitor,
        data_cadastro: leitor.data_cadastro || new Date().toISOString().split('T')[0],
        bloqueado: leitor.bloqueado ?? false,
        status_cadastro: (leitor as any).status_cadastro || 'ativo',
      } as any)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Auto-cadastro de leitor com status pendente de validação
   */
  async autoRegister(leitorData: {
    nome_do_leitor: string
    email: string
    telefone?: string | null
    telefone_fixo?: string | null
    foto?: string | null
    curso?: string | null
  }) {
    const insertPayload: any = {
      nome_do_leitor: leitorData.nome_do_leitor.trim(),
      email: leitorData.email.trim().toLowerCase(),
      telefone: leitorData.telefone || null,
      telefone_fixo: leitorData.telefone_fixo || null,
      foto: leitorData.foto || null,
      curso: leitorData.curso || null,
      status_cadastro: 'pendente',
      bloqueado: false,
      acesso_diretoria: false,
      data_cadastro: new Date().toISOString().split('T')[0],
    }

    const { data, error } = await supabase.from('leitor').insert(insertPayload).select().single()

    if (error) throw error
    return data
  },

  /**
   * Verifica o status de cadastro do leitor pelo e-mail
   */
  async checkLeitorStatus(email: string): Promise<'ativo' | 'pendente' | 'inexistente'> {
    const normalized = email.trim().toLowerCase()
    if (!normalized) return 'inexistente'

    try {
      const { data, error } = await (supabase.rpc as any)('check_leitor_status', {
        p_email: normalized,
      })
      if (!error && data) {
        return data as 'ativo' | 'pendente' | 'inexistente'
      }
    } catch {
      // fallback
    }

    const { data: row } = await supabase
      .from('leitor')
      .select('status_cadastro')
      .ilike('email', normalized)
      .maybeSingle()

    if (!row) return 'inexistente'
    return ((row as any).status_cadastro || 'ativo') as 'ativo' | 'pendente'
  },

  /**
   * Aprova cadastro pendente: cria conta de auth, marca como ativo e dispara e-mail de primeiro acesso
   */
  async approveReader(
    id_leitor: number,
  ): Promise<{ success: boolean; emailSent: boolean; error?: string }> {
    try {
      // 1. Chamar RPC segura para criar o usuário auth e atualizar leitor
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
        'aprovar_cadastro_leitor',
        { p_id_leitor: id_leitor },
      )

      if (rpcError) {
        throw new Error(rpcError.message || 'Falha ao aprovar cadastro.')
      }

      const leitorEmail = rpcData?.email
      let emailSent = false

      // 2. Disparar e-mail de primeiro acesso com link de definição de senha
      if (leitorEmail) {
        const resetRes = await LeitoresService.sendPasswordResetEmail(leitorEmail)
        if (resetRes.success) {
          emailSent = true
        } else {
          console.warn('Aviso: cadastro aprovado mas o envio do e-mail falhou:', resetRes.error)
        }
      }

      return { success: true, emailSent }
    } catch (err: any) {
      return { success: false, emailSent: false, error: err.message || 'Erro ao aprovar leitor.' }
    }
  },

  /**
   * Recusar/rejeitar e excluir cadastro pendente
   */
  async rejectReader(id_leitor: number): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Remover cursos vinculados
      await supabase.from('leitor_curso').delete().eq('id_leitor', id_leitor)
      // 2. Excluir o registro de leitor
      const { error } = await supabase.from('leitor').delete().eq('id_leitor', id_leitor)
      if (error) throw error
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao recusar cadastro do leitor.' }
    }
  },

  async update(id_leitor: number, updates: LeitorUpdate & { telefone_fixo?: string | null }) {
    const { data, error } = await supabase
      .from('leitor')
      .update(updates as any)
      .eq('id_leitor', id_leitor)
      .select()
      .single()

    if (error) throw error

    // Sincronizar dados em public.profiles e user_metadata caso exista id_auth ou email vinculado
    try {
      const authId = data.id_auth
      const email = data.email
      const profileUpdates: any = {
        nome: data.nome_do_leitor,
        full_name: data.nome_do_leitor,
        telefone: data.telefone,
        telefone_fixo: (data as any).telefone_fixo || null,
        avatar_url: data.foto,
      }
      if (typeof updates.acesso_diretoria === 'boolean') {
        profileUpdates.acesso_diretoria = updates.acesso_diretoria
      }
      if (updates.curso !== undefined) {
        profileUpdates.curso = updates.curso
      }

      if (authId) {
        // Atualiza perfil no profiles
        await supabase.from('profiles').update(profileUpdates).eq('id', authId)
      } else if (email) {
        await supabase.from('profiles').update(profileUpdates).eq('email', email)
      }
    } catch (syncErr) {
      console.warn('Não foi possível sincronizar profiles:', syncErr)
    }

    return data
  },

  /**
   * Envia e-mail de redefinição de senha para o leitor via Supabase Auth
   */
  async sendPasswordResetEmail(email: string): Promise<{ success: boolean; error?: string }> {
    const normalized = email.trim().toLowerCase()
    if (!normalized) {
      return { success: false, error: 'E-mail não informado.' }
    }

    try {
      const redirectUrl = `${window.location.origin}/redefinir-senha`
      const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
        redirectTo: redirectUrl,
      })

      if (error) {
        return { success: false, error: error.message || 'Falha ao enviar e-mail de redefinição.' }
      }

      return { success: true }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erro inesperado ao solicitar reset de senha.',
      }
    }
  },

  async toggleBlock(id_leitor: number, currentBlocked: boolean) {
    const { data, error } = await supabase
      .from('leitor')
      .update({ bloqueado: !currentBlocked })
      .eq('id_leitor', id_leitor)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async delete(id_leitor: number) {
    // 1. Contagem total de empréstimos vinculados ao leitor (ativos + históricos)
    const { count: totalCount, error: countError } = await supabase
      .from('emprestimo')
      .select('id_emprestimo', { count: 'exact', head: true })
      .eq('id_leitor', id_leitor)

    if (countError) throw countError

    if (totalCount !== null && totalCount > 0) {
      // Verificar se há empréstimos ativos pendentes
      const { data: activeLoans, error: activeError } = await supabase
        .from('emprestimo')
        .select('id_emprestimo')
        .eq('id_leitor', id_leitor)
        .is('data_devolucao_real', null)

      if (activeError) throw activeError

      if (activeLoans && activeLoans.length > 0) {
        throw new Error('Não é possível remover leitor com empréstimos ativos pendentes.')
      } else {
        throw new Error(
          'Este leitor possui histórico de empréstimos e não pode ser excluído. Considere bloqueá-lo para impedir novos empréstimos.',
        )
      }
    }

    // 2. Verificar se existem reservas ativas pendentes para este leitor
    const { count: activeReservationsCount, error: activeResError } = await supabase
      .from('reserva')
      .select('id_reserva', { count: 'exact', head: true })
      .eq('id_leitor', id_leitor)
      .eq('status_reserva', 'Ativa')

    if (activeResError) throw activeResError

    if (activeReservationsCount !== null && activeReservationsCount > 0) {
      throw new Error('Não é possível excluir leitor com reserva ativa pendente.')
    }

    // 3. Excluir reservas não ativas (Cancelada ou Atendida) para evitar bloqueio por foreign key (RESTRICT)
    const { error: deleteResError } = await supabase
      .from('reserva')
      .delete()
      .eq('id_leitor', id_leitor)
      .in('status_reserva', ['Cancelada', 'Atendida'])

    if (deleteResError) throw deleteResError

    // 4. Excluir o leitor
    const { error } = await supabase.from('leitor').delete().eq('id_leitor', id_leitor)
    if (error) throw error
  },
}
