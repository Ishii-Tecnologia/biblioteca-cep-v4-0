import { supabase } from '@/lib/supabase/client'

export interface AdminResetPasswordParams {
  userId: string
  newPassword: string
}

export interface ChangeOwnPasswordParams {
  currentPassword: string
  newPassword: string
  userEmail: string
}

/**
 * Redefine a senha de outro usuário usando a Edge Function ou fallback via RPC (executado por admin)
 */
export async function adminResetPassword({
  userId,
  newPassword,
}: AdminResetPasswordParams): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Tentar invocar Edge Function admin_reset_password
    const { data: funcData, error: funcError } = await supabase.functions.invoke(
      'admin_reset_password',
      {
        body: {
          user_id: userId,
          new_password: newPassword,
        },
      },
    )

    if (!funcError && funcData && !funcData.error) {
      return { success: true }
    }

    // 2. Se a Edge Function retornar erro ou falhar, fallback direto para a RPC admin_reset_password
    const { error: rpcError } = await (supabase.rpc as any)('admin_reset_password', {
      target_user_id: userId,
      new_password: newPassword,
    })

    if (rpcError) {
      const errorMsg =
        funcError?.message || rpcError.message || 'Erro ao alterar a senha do usuário.'
      return { success: false, error: errorMsg }
    }

    return { success: true }
  } catch (err: any) {
    // Tentativa direta via RPC em caso de exceção de rede na Edge Function
    try {
      const { error: rpcError } = await (supabase.rpc as any)('admin_reset_password', {
        target_user_id: userId,
        new_password: newPassword,
      })
      if (!rpcError) {
        return { success: true }
      }
      return {
        success: false,
        error: rpcError.message || err.message || 'Erro ao processar a troca de senha.',
      }
    } catch (innerErr: any) {
      return {
        success: false,
        error: innerErr.message || err.message || 'Erro inesperado ao redefinir a senha.',
      }
    }
  }
}

/**
 * Altera a própria senha do usuário logado:
 * 1. Valida a senha atual efetuando reautenticação (signInWithPassword)
 * 2. Atualiza para a nova senha via supabase.auth.updateUser({ password: newPassword })
 */
export async function changeOwnPassword({
  currentPassword,
  newPassword,
  userEmail,
}: ChangeOwnPasswordParams): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Validação prévia da senha atual via reautenticação
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    })

    if (signInError) {
      return {
        success: false,
        error: 'A senha atual informada está incorreta. Verifique e tente novamente.',
      }
    }

    // 2. Atualização para a nova senha
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      return {
        success: false,
        error: updateError.message || 'Não foi possível atualizar sua senha.',
      }
    }

    return { success: true }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Erro inesperado ao alterar sua senha.',
    }
  }
}
