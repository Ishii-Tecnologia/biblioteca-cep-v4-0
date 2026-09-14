import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { UserCog, Loader2, Upload, Camera, X, ClipboardPaste } from 'lucide-react'
import { uploadImageToStorage, extractImageFileFromClipboard, urlToFile } from '@/lib/image-upload'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ProfileRecord } from '@/pages/Usuarios'
import { formatPhone } from '@/lib/utils'

interface EditUserModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: ProfileRecord | null
  isCurrentUser: boolean
  onSuccess: () => void
}

export function EditUserModal({
  open,
  onOpenChange,
  user,
  isCurrentUser,
  onSuccess,
}: EditUserModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    papel: 'operador' as 'admin' | 'operador' | 'operador_diretoria',
    avatar_url: '',
  })

  useEffect(() => {
    if (open && user) {
      const rawRole = user.papel || user.role || 'operador'
      const currentRole = (
        rawRole === 'admin'
          ? 'admin'
          : rawRole === 'operador_diretoria'
            ? 'operador_diretoria'
            : 'operador'
      ) as 'admin' | 'operador' | 'operador_diretoria'
      const currentName = user.nome || user.full_name || ''
      const currentEmail = user.email || ''
      const currentAvatar = user.avatar_url || ''
      const currentTelefone = formatPhone(user.telefone || '')

      setFormData({
        nome: currentName,
        email: currentEmail,
        telefone: currentTelefone,
        papel: currentRole,
        avatar_url: currentAvatar,
      })
      setPhotoFile(null)
      setPhotoPreview(currentAvatar || null)
    }
  }, [open, user])

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      console.log('[EditUserModal] Foto selecionada via arquivo:', file.name, file.size)
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onload = (ev) => {
        setPhotoPreview(ev.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const applyPhotoFile = (file: File) => {
    console.log(
      '[EditUserModal] Aplicando arquivo de foto (tamanho:',
      file.size,
      'tipo:',
      file.type,
      ')',
    )
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setPhotoPreview(ev.target?.result as string)
      console.log('[EditUserModal] Preview atualizado com sucesso da foto.')
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    console.log('[EditUserModal] Evento paste disparado no elemento')
    try {
      const file = await extractImageFileFromClipboard(e)
      if (file) {
        e.preventDefault()
        e.stopPropagation()
        console.log('[EditUserModal] Imagem extraída com sucesso:', file.size, 'bytes')
        applyPhotoFile(file)
        toast({
          title: 'Imagem colada!',
          description: 'Foto de perfil atualizada da área de transferência.',
        })
      } else {
        console.log('[EditUserModal] Nenhuma imagem extraída do clipboard')
      }
    } catch (err: any) {
      console.warn('[EditUserModal] Erro ao processar imagem colada:', err)
      toast({
        title: 'Falha ao colar imagem',
        description: err.message || 'Não foi possível ler a imagem da área de transferência.',
        variant: 'destructive',
      })
    }
  }

  // Listener global para Ctrl+V enquanto o modal estiver aberto
  useEffect(() => {
    if (!open) return

    const handleGlobalPaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      const isInputOrTextarea =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      const hasImageItems =
        e.clipboardData?.items &&
        Array.from(e.clipboardData.items).some((it) => it.type.startsWith('image/'))

      if (hasImageItems || !isInputOrTextarea) {
        console.log('[EditUserModal] Global paste interceptado (hasImage:', hasImageItems, ')')
        try {
          const file = await extractImageFileFromClipboard(e)
          if (file) {
            e.preventDefault()
            e.stopPropagation()
            applyPhotoFile(file)
            toast({
              title: 'Imagem colada!',
              description: 'Foto de perfil atualizada da área de transferência.',
            })
          }
        } catch (err: any) {
          console.warn('[EditUserModal] Erro no global paste:', err)
        }
      }
    }

    window.addEventListener('paste', handleGlobalPaste)
    return () => window.removeEventListener('paste', handleGlobalPaste)
  }, [open, toast])

  const handlePasteButtonClick = async () => {
    console.log('[EditUserModal] Botão colar clicado')
    try {
      const file = await extractImageFileFromClipboard()
      if (file) {
        console.log('[EditUserModal] Imagem colada via botão:', file.size)
        applyPhotoFile(file)
        toast({
          title: 'Imagem colada!',
          description: 'Foto de perfil atualizada da área de transferência.',
        })
      } else {
        toast({
          title: 'Nenhuma imagem encontrada',
          description: 'Copie uma imagem ou use Ctrl+V diretamente na área de foto.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      console.warn('[EditUserModal] Falha ao ler clipboard via botão:', err)
      toast({
        title: 'Aviso',
        description: 'Clique no campo e pressione Ctrl+V para colar a imagem.',
      })
    }
  }

  const handleRemovePhoto = () => {
    console.log('[EditUserModal] Foto removida')
    setPhotoFile(null)
    setPhotoPreview(null)
    setFormData((prev) => ({ ...prev, avatar_url: '' }))
  }

  const getInitials = (name?: string | null, email?: string) => {
    const raw = name || email || 'U'
    const parts = raw.trim().split(' ')
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return raw.substring(0, 2).toUpperCase()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    // 0. Pré-verificar validade da sessão para evitar tentar salvar com token expirado
    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr || !sessionData?.session) {
        toast({
          title: 'Sessão Expirada',
          description: 'Sua sessão de acesso expirou. Faça login novamente para continuar.',
          variant: 'destructive',
        })
        return
      }
    } catch {
      // Ignora erro de verificação de sessão se houver
    }

    const nome = formData.nome.trim()
    const email = formData.email.trim()

    if (!nome) {
      toast({
        title: 'Nome obrigatório',
        description: 'Por favor, informe o nome completo do usuário.',
        variant: 'destructive',
      })
      return
    }

    if (!email) {
      toast({
        title: 'E-mail obrigatório',
        description: 'Por favor, informe um endereço de e-mail válido.',
        variant: 'destructive',
      })
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      toast({
        title: 'E-mail inválido',
        description: 'Por favor, insira um formato de e-mail válido.',
        variant: 'destructive',
      })
      return
    }

    if (isCurrentUser && formData.papel !== 'admin') {
      toast({
        title: 'Ação não permitida',
        description: 'Você não pode rebaixar o seu próprio papel de administrador.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      let finalAvatarUrl: string | null = formData.avatar_url || null
      let fileToUpload = photoFile

      console.log(
        '[EditUserModal] Salvando edição de usuário:',
        user.id,
        'fileToUpload:',
        !!fileToUpload,
        'preview:',
        !!photoPreview,
      )

      // Fallback: se houver photoPreview (ex: dataURL ou blob colado) e não tiver photoFile, converter
      if (
        !fileToUpload &&
        photoPreview &&
        (photoPreview.startsWith('data:image/') || photoPreview.startsWith('blob:')) &&
        photoPreview !== user.avatar_url
      ) {
        try {
          console.log('[EditUserModal] Convertendo photoPreview em File...')
          fileToUpload = await urlToFile(photoPreview, `avatar-${user.id}-${Date.now()}.png`)
          console.log(
            '[EditUserModal] Preview convertido com sucesso em File:',
            fileToUpload.size,
            'bytes',
          )
        } catch (convErr) {
          console.warn('[EditUserModal] Erro ao converter preview para arquivo:', convErr)
        }
      }

      // Se houver novo arquivo de foto, comprimir e fazer upload
      if (fileToUpload) {
        try {
          console.log('[EditUserModal] Enviando avatar para storage avatars...')
          finalAvatarUrl = await uploadImageToStorage(fileToUpload, 'avatars', {
            maxWidth: 400,
            maxHeight: 400,
            quality: 0.8,
            outputFormat: 'image/jpeg',
          })
          console.log('[EditUserModal] Upload concluído, URL pública:', finalAvatarUrl)
        } catch (uploadErr: any) {
          console.error('[EditUserModal] Erro ao enviar avatar para o storage:', uploadErr)
          throw new Error(`Falha no upload da foto: ${uploadErr.message || 'Erro desconhecido'}`)
        }
      } else if (!photoPreview) {
        console.log('[EditUserModal] Sem preview de foto, definindo avatar_url como null')
        finalAvatarUrl = null
      }

      console.log(
        '[EditUserModal] Executando RPC update_user_info com new_avatar_url:',
        finalAvatarUrl,
      )

      let rpcSucceeded = false
      let rpcFailureMsg = ''

      // 1. Executar RPC que atualiza profiles, auth.users e leitor
      try {
        const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('update_user_info', {
          target_user_id: user.id,
          new_name: nome,
          new_email: email,
          new_role: formData.papel,
          new_avatar_url: finalAvatarUrl,
          new_telefone: formData.telefone.trim() || null,
        })

        if (rpcError) {
          console.error('[EditUserModal] Erro retornado pelo RPC update_user_info:', rpcError)
          rpcFailureMsg = rpcError.message || 'Erro no RPC'
        } else {
          console.log('[EditUserModal] RPC update_user_info executado com sucesso:', rpcData)
          rpcSucceeded = true
        }
      } catch (rpcCallEx: any) {
        console.error('[EditUserModal] Exceção na chamada RPC update_user_info:', rpcCallEx)
        rpcFailureMsg = rpcCallEx.message || 'Exceção ao chamar RPC'
      }

      // 2. Fallback resiliente: garantir atualização direta em public.profiles
      // Se a RPC falhar ou para assegurar que a coluna avatar_url esteja gravada exatamente onde a tela /usuarios lê
      console.log(
        '[EditUserModal] Garantindo atualização direta em public.profiles para avatar_url e dados...',
      )
      const directUpdatePayload = {
        nome,
        full_name: nome,
        papel: formData.papel,
        role: formData.papel,
        avatar_url: finalAvatarUrl,
        telefone: formData.telefone.trim() || null,
      }

      const { data: directProfileData, error: directProfileErr } = await (
        supabase.from('profiles') as any
      )
        .update(directUpdatePayload)
        .eq('id', user.id)
        .select()

      if (directProfileErr) {
        console.warn(
          '[EditUserModal] Aviso no update direto em profiles (possível RLS para outro usuário):',
          directProfileErr,
        )
        if (!rpcSucceeded) {
          throw new Error(
            `Falha ao salvar no banco de dados: ${directProfileErr.message || rpcFailureMsg || 'Erro desconhecido'}`,
          )
        }
      } else {
        console.log(
          '[EditUserModal] Update direto em public.profiles concluído com sucesso:',
          directProfileData,
        )
      }

      // 3. Atualizar metadados auth do usuário se for o próprio usuário logado
      if (isCurrentUser) {
        try {
          await supabase.auth.updateUser({
            data: {
              nome,
              full_name: nome,
              avatar_url: finalAvatarUrl,
              papel: formData.papel,
              role: formData.papel,
              app_role: formData.papel,
              telefone: formData.telefone.trim() || null,
            },
          })
          console.log('[EditUserModal] Metadados de auth atualizados para o usuário logado.')
        } catch (authErr) {
          console.warn('[EditUserModal] Aviso ao atualizar dados no auth.updateUser:', authErr)
        }
      }

      // 4. Também sincronizar tabela public.leitor caso exista registro leitor para este usuário
      try {
        await supabase
          .from('leitor')
          .update({
            nome_do_leitor: nome,
            telefone: formData.telefone.trim() || null,
            foto: finalAvatarUrl,
          })
          .or(`id_auth.eq.${user.id},email.eq.${email}`)
      } catch (leitorSyncErr) {
        console.warn('[EditUserModal] Aviso ao sincronizar tabela leitor:', leitorSyncErr)
      }

      toast({
        title: 'Usuário atualizado com sucesso!',
        description: `As informações e foto de perfil de ${nome} foram salvas.`,
      })

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      console.error('[EditUserModal] Falha geral ao atualizar usuário:', err)
      toast({
        title: 'Erro ao atualizar usuário',
        description: err.message || 'Não foi possível salvar as alterações do usuário.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <UserCog className="w-5 h-5 text-emerald-600" />
              Editar Informações do Usuário
            </DialogTitle>
            <DialogDescription>
              Altere os dados cadastrais, papel de acesso e foto de perfil do usuário.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Upload de Foto / Avatar */}
            <div
              onPaste={handlePaste}
              tabIndex={0}
              className="flex flex-col sm:flex-row items-center gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all cursor-default"
              title="Clique aqui e pressione Ctrl+V / Cmd+V para colar uma imagem da área de transferência"
            >
              <Avatar className="w-16 h-16 border-2 border-emerald-500 shadow-sm">
                {photoPreview ? (
                  <AvatarImage src={photoPreview} alt="Preview da foto" className="object-cover" />
                ) : (
                  <AvatarFallback className="bg-emerald-100 text-emerald-800 text-base font-bold">
                    {getInitials(formData.nome, formData.email) || (
                      <Camera className="w-6 h-6 text-emerald-600" />
                    )}
                  </AvatarFallback>
                )}
              </Avatar>

              <div className="space-y-1.5 flex-1 text-center sm:text-left">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-800">
                    Foto de Perfil / Avatar
                  </Label>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-400">
                    <ClipboardPaste className="w-3 h-3" /> Ctrl+V aceito
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Selecione um arquivo ou cole (Ctrl+V) diretamente aqui. Comprimida
                  automaticamente.
                </p>
                <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 shadow-xs">
                    <Upload className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{photoPreview ? 'Alterar Foto' : 'Selecionar Foto'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/jpg"
                      onChange={handlePhotoSelect}
                      className="hidden"
                      disabled={loading}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePasteButtonClick}
                    disabled={loading}
                    className="h-7 text-xs px-2.5 bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
                    title="Colar imagem da área de transferência"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                    Colar
                  </Button>
                  {photoPreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemovePhoto}
                      disabled={loading}
                      className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2"
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Remover
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Nome Completo */}
            <div>
              <Label htmlFor="edit-user-name" className="text-xs font-semibold text-slate-700">
                Nome Completo *
              </Label>
              <Input
                id="edit-user-name"
                required
                placeholder="Ex: João Silva"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                className="mt-1"
                disabled={loading}
              />
            </div>

            {/* Email (Desabilitado / Somente Leitura) */}
            <div>
              <Label htmlFor="edit-user-email" className="text-xs font-semibold text-slate-700">
                Endereço de E-mail (Somente leitura)
              </Label>
              <Input
                id="edit-user-email"
                type="email"
                required
                readOnly
                disabled
                placeholder="Ex: joao.silva@exemplo.com"
                value={formData.email}
                className="mt-1 bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                O endereço de e-mail não pode ser alterado diretamente por questões de segurança de
                autenticação.
              </p>
            </div>

            {/* Telefone */}
            <div>
              <Label htmlFor="edit-user-phone" className="text-xs font-semibold text-slate-700">
                Telefone / WhatsApp
              </Label>
              <Input
                id="edit-user-phone"
                type="tel"
                placeholder="(XX) XXXXX-XXXX"
                maxLength={15}
                value={formData.telefone}
                onChange={(e) =>
                  setFormData({ ...formData, telefone: formatPhone(e.target.value) })
                }
                className="mt-1"
                disabled={loading}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Número de contato para avisos de empréstimos, devoluções e reservas.
              </p>
            </div>

            {/* Papel / Permissão */}
            <div>
              <Label htmlFor="edit-user-role" className="text-xs font-semibold text-slate-700">
                Papel / Permissão *
              </Label>
              <Select
                value={formData.papel}
                onValueChange={(val: 'admin' | 'operador' | 'operador_diretoria') =>
                  setFormData({ ...formData, papel: val })
                }
                disabled={loading}
              >
                <SelectTrigger id="edit-user-role" className="mt-1">
                  <SelectValue placeholder="Selecione o papel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="operador"
                    disabled={isCurrentUser && formData.papel === 'admin'}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-600" />
                      <span>Operador (Bibliotecário - gestão de acervo geral e empréstimos)</span>
                    </div>
                  </SelectItem>
                  <SelectItem
                    value="operador_diretoria"
                    disabled={isCurrentUser && formData.papel === 'admin'}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-600" />
                      <span>Operador (Diretoria - bibliotecário + acervo da diretoria)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-600" />
                      <span>Admin (Acesso total às configurações, acervos e usuários)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {isCurrentUser && formData.papel === 'admin' && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Você não pode alterar seu próprio papel de administrador.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
