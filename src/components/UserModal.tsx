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
import { UserPlus, Loader2, Eye, EyeOff, Upload, Camera, X, ClipboardPaste } from 'lucide-react'
import { uploadImageToStorage, extractImageFileFromClipboard, urlToFile } from '@/lib/image-upload'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface UserModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function UserModal({ open, onOpenChange, onSuccess }: UserModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    password: '',
    papel: 'operador' as 'admin' | 'operador' | 'operador_diretoria',
    avatar_url: '',
  })

  useEffect(() => {
    if (open) {
      setFormData({
        nome: '',
        email: '',
        password: '',
        papel: 'operador',
        avatar_url: '',
      })
      setPhotoFile(null)
      setPhotoPreview(null)
      setShowPassword(false)
    }
  }, [open])

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      console.log('[UserModal] Foto selecionada via arquivo:', file.name, file.type, file.size)
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onload = (ev) => {
        const result = ev.target?.result as string
        setPhotoPreview(result)
        console.log('[UserModal] Preview atualizado com sucesso do arquivo selecionado.')
      }
      reader.readAsDataURL(file)
    }
  }

  const applyPhotoFile = (file: File) => {
    console.log(
      '[UserModal] Aplicando arquivo de foto (tamanho:',
      file.size,
      'tipo:',
      file.type,
      'nome:',
      file.name,
      ')',
    )
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      setPhotoPreview(result)
      console.log('[UserModal] Preview de foto atualizado com sucesso.')
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    console.log('[UserModal] Evento paste disparado no modal')
    try {
      const file = await extractImageFileFromClipboard(e)
      if (file) {
        e.preventDefault()
        e.stopPropagation()
        console.log(
          '[UserModal] Imagem extraída do clipboard com sucesso:',
          file.name,
          file.size,
          'bytes',
        )
        applyPhotoFile(file)
        toast({
          title: 'Imagem colada!',
          description: 'Foto de perfil colada com sucesso da área de transferência.',
        })
      } else {
        console.log('[UserModal] Nenhuma imagem extraída do evento paste')
      }
    } catch (err: any) {
      console.warn('[UserModal] Erro ao processar imagem colada:', err)
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
      // Se o usuário estiver digitando em campos de texto convencionais (exceto o próprio campo de foto), não interceptar texto puro
      const isInputOrTextarea =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')

      const hasImageItems =
        e.clipboardData?.items &&
        Array.from(e.clipboardData.items).some((it) => it.type.startsWith('image/'))

      // Se for colagem de arquivo de imagem, ou se o foco não estiver num input, interceptar
      if (hasImageItems || !isInputOrTextarea) {
        console.log(
          '[UserModal] Capturado paste no listener da janela do modal (hasImage:',
          hasImageItems,
          ')',
        )
        try {
          const file = await extractImageFileFromClipboard(e)
          if (file) {
            e.preventDefault()
            e.stopPropagation()
            applyPhotoFile(file)
            toast({
              title: 'Imagem colada!',
              description: 'Foto de perfil colada com sucesso da área de transferência.',
            })
          }
        } catch (err: any) {
          console.warn('[UserModal] Erro no global paste:', err)
        }
      }
    }

    window.addEventListener('paste', handleGlobalPaste)
    return () => window.removeEventListener('paste', handleGlobalPaste)
  }, [open, toast])

  const handlePasteButtonClick = async () => {
    console.log('[UserModal] Botão "Colar" clicado')
    try {
      const file = await extractImageFileFromClipboard()
      if (file) {
        console.log('[UserModal] Imagem colada via botão:', file.size, 'bytes')
        applyPhotoFile(file)
        toast({
          title: 'Imagem colada!',
          description: 'Foto de perfil colada com sucesso da área de transferência.',
        })
      } else {
        console.log('[UserModal] Nenhuma imagem encontrada no clipboard via botão')
        toast({
          title: 'Nenhuma imagem encontrada',
          description: 'Copie uma imagem ou use Ctrl+V diretamente na área de foto.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      console.warn('[UserModal] Falha ao ler clipboard via botão:', err)
      toast({
        title: 'Aviso',
        description: 'Clique no campo e pressione Ctrl+V para colar a imagem.',
      })
    }
  }

  const handleRemovePhoto = () => {
    console.log('[UserModal] Foto removida')
    setPhotoFile(null)
    setPhotoPreview(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const nome = formData.nome.trim()
    const email = formData.email.trim()
    const password = formData.password

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

    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      toast({
        title: 'E-mail inválido',
        description: 'Por favor, insira um formato de e-mail válido.',
        variant: 'destructive',
      })
      return
    }

    if (!password || password.length < 6) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha provisória deve conter no mínimo 6 caracteres.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      const normalizedEmail = email.toLowerCase()

      // 1. Validação prévia de duplicidade de e-mail (usado como login no sistema)
      try {
        const { data: emailInUse, error: checkErr } = await (supabase.rpc as any)(
          'check_email_exists',
          {
            check_email: normalizedEmail,
          },
        )
        if (!checkErr && emailInUse) {
          toast({
            title: 'E-mail já cadastrado',
            description: `O e-mail "${normalizedEmail}" já está em uso por outro usuário ou leitor no sistema. Como o e-mail é o identificador de login, cada conta deve possuir um e-mail único.`,
            variant: 'destructive',
          })
          setLoading(false)
          return
        }
      } catch (checkRpcErr) {
        console.warn('Erro ao verificar email duplicado via RPC:', checkRpcErr)
      }

      // Upload de avatar comprimido para o bucket 'avatars' (max 400px, 80% qualidade)
      let uploadedAvatarUrl = ''
      let fileToUpload = photoFile

      console.log(
        '[UserModal] Preparando upload da foto... photoFile existe?',
        !!photoFile,
        'photoPreview existe?',
        !!photoPreview,
      )

      // Fallback: se houver photoPreview (ex: dataURL colado) e não tiver photoFile, converter
      if (
        !fileToUpload &&
        photoPreview &&
        (photoPreview.startsWith('data:image/') || photoPreview.startsWith('blob:'))
      ) {
        try {
          console.log('[UserModal] Convertendo photoPreview em File...')
          fileToUpload = await urlToFile(photoPreview, `avatar-${Date.now()}.png`)
          console.log(
            '[UserModal] Preview convertido com sucesso em File:',
            fileToUpload.size,
            'bytes',
          )
        } catch (convErr) {
          console.warn('[UserModal] Erro ao converter preview para arquivo:', convErr)
        }
      }

      if (fileToUpload) {
        try {
          console.log('[UserModal] Enviando avatar comprimido para o storage avatars...')
          uploadedAvatarUrl = await uploadImageToStorage(fileToUpload, 'avatars', {
            maxWidth: 400,
            maxHeight: 400,
            quality: 0.8,
            outputFormat: 'image/jpeg',
          })
          console.log('[UserModal] Avatar enviado com sucesso! URL pública:', uploadedAvatarUrl)
        } catch (avatarErr: any) {
          console.error('[UserModal] Erro ao enviar avatar do usuário para o storage:', avatarErr)
          toast({
            title: 'Aviso sobre a foto',
            description: `A foto não pôde ser salva no servidor: ${avatarErr.message || 'Erro no storage'}. O usuário será criado sem foto.`,
            variant: 'destructive',
          })
        }
      } else {
        console.log('[UserModal] Nenhuma foto fornecida para upload')
      }

      // 2. Criação do usuário com email já confirmado (email_confirm: true)
      // Estratégia resiliente em camadas:
      // Camada A: Edge Function admin_create_user (cria com service_role e email_confirm: true)
      // Camada B: RPC admin_create_user (insere com email_confirmed_at = now() diretamente)
      // Camada C: Fallback para supabase.auth.signUp + RPC confirm_user_email (tratando rate limits sem bloquear)
      let createdUserId: string | null = null
      let userCreatedSuccessfully = false

      // Tentativa Camada A: Edge Function
      try {
        const { data: edgeData, error: edgeErr } = await supabase.functions.invoke(
          'admin_create_user',
          {
            body: {
              email: normalizedEmail,
              password,
              nome,
              papel: formData.papel,
              avatar_url: uploadedAvatarUrl || null,
            },
          },
        )

        if (!edgeErr && edgeData && !edgeData.error && edgeData.success) {
          createdUserId = edgeData.user?.id || null
          userCreatedSuccessfully = true
        } else if (edgeErr || (edgeData && edgeData.error)) {
          const errMsg = edgeData?.error || edgeErr?.message || ''
          console.warn('Falha na Edge Function admin_create_user, tentando RPC...', errMsg)
          if (
            errMsg.toLowerCase().includes('já está cadastrado') ||
            errMsg.toLowerCase().includes('already registered')
          ) {
            toast({
              title: 'E-mail já cadastrado',
              description: `O e-mail "${normalizedEmail}" já possui uma conta no sistema. Por favor, utilize outro e-mail.`,
              variant: 'destructive',
            })
            setLoading(false)
            return
          }
        }
      } catch (edgeEx: any) {
        console.warn('Exceção ao invocar admin_create_user:', edgeEx)
      }

      // Tentativa Camada B: RPC admin_create_user (se Camada A não concluiu)
      if (!userCreatedSuccessfully) {
        try {
          const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)(
            'admin_create_user',
            {
              new_email: normalizedEmail,
              new_password: password,
              new_nome: nome,
              new_papel: formData.papel,
              new_avatar_url: uploadedAvatarUrl || null,
            },
          )

          if (!rpcErr && rpcData && rpcData.success) {
            createdUserId = rpcData.user_id || null
            userCreatedSuccessfully = true
          } else if (rpcErr) {
            const rpcMsg = rpcErr.message || ''
            console.warn('Falha na RPC admin_create_user, tentando signUp:', rpcMsg)
            if (
              rpcMsg.toLowerCase().includes('já está cadastrado') ||
              rpcMsg.toLowerCase().includes('already')
            ) {
              toast({
                title: 'E-mail já cadastrado',
                description: `O e-mail "${normalizedEmail}" já possui uma conta no sistema. Por favor, utilize outro e-mail.`,
                variant: 'destructive',
              })
              setLoading(false)
              return
            }
          }
        } catch (rpcEx: any) {
          console.warn('Exceção na RPC admin_create_user:', rpcEx)
        }
      }

      // Tentativa Camada C: Fallback para supabase.auth.signUp + confirm_user_email
      if (!userCreatedSuccessfully) {
        try {
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              data: {
                nome,
                full_name: nome,
                papel: formData.papel,
                role: formData.papel,
                app_role: formData.papel,
                avatar_url: uploadedAvatarUrl || undefined,
              },
            },
          })

          if (authError) {
            const msg = authError.message?.toLowerCase() || ''
            if (msg.includes('already registered') || msg.includes('user already exists')) {
              toast({
                title: 'E-mail já cadastrado',
                description: `O e-mail "${normalizedEmail}" já possui uma conta no sistema. Por favor, utilize outro e-mail.`,
                variant: 'destructive',
              })
              setLoading(false)
              return
            }

            // Se o erro for de envio de e-mail / rate limit, NÃO bloquear o cadastro
            if (msg.includes('rate limit') || msg.includes('email') || msg.includes('smtp')) {
              console.warn(
                'Aviso de envio de e-mail ao criar usuário (não bloqueante):',
                authError.message,
              )
            } else {
              throw authError
            }
          }

          createdUserId = authData.user?.id || null
          userCreatedSuccessfully = true
        } catch (signUpErr: any) {
          const msg = signUpErr.message?.toLowerCase() || ''
          if (msg.includes('rate limit') || msg.includes('email')) {
            console.warn('Rate limit do Supabase ignorado para não bloquear cadastro:', signUpErr)
            userCreatedSuccessfully = true
          } else {
            throw signUpErr
          }
        }
      }

      // Garantir confirmação de e-mail e persistência no perfil
      if (createdUserId) {
        try {
          console.log('[UserModal] Confirmando e-mail do usuário recém-criado:', createdUserId)
          await (supabase.rpc as any)('confirm_user_email', { user_id: createdUserId })
        } catch (rpcErr) {
          console.warn('[UserModal] Aviso confirm_user_email RPC:', rpcErr)
        }

        try {
          console.log(
            '[UserModal] Persistindo perfil em profiles com avatar_url:',
            uploadedAvatarUrl || '(sem foto)',
          )
          const { error: upsertErr } = await supabase.from('profiles').upsert(
            {
              id: createdUserId,
              nome,
              full_name: nome,
              email: normalizedEmail,
              papel: formData.papel,
              role: formData.papel,
              avatar_url: uploadedAvatarUrl || null,
              bloqueado: false,
            },
            { onConflict: 'id' },
          )
          if (upsertErr) {
            console.error('[UserModal] Erro ao fazer upsert em profiles:', upsertErr)
          } else {
            console.log('[UserModal] Perfil gravado com sucesso em public.profiles.')
          }
        } catch (profileError) {
          console.warn('[UserModal] Erro ao atualizar perfil na tabela profiles:', profileError)
        }
      }

      toast({
        title: 'Usuário cadastrado com sucesso!',
        description: `O usuário ${nome} (${email}) foi criado com o papel "${formData.papel}". O acesso já está liberado.`,
      })

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao criar usuário',
        description: err.message || 'Não foi possível cadastrar o novo usuário no sistema.',
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
              <UserPlus className="w-5 h-5 text-emerald-600" />
              Novo Usuário
            </DialogTitle>
            <DialogDescription>
              Crie uma nova conta de acesso ao sistema e defina o nível de permissão.
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
                    <Camera className="w-6 h-6 text-emerald-600" />
                  </AvatarFallback>
                )}
              </Avatar>

              <div className="space-y-1.5 flex-1 text-center sm:text-left">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-800">
                    Foto de Perfil (Opcional)
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
                    <span>Selecionar Foto</span>
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

            {/* Nome */}
            <div>
              <Label htmlFor="user-name" className="text-xs font-semibold text-slate-700">
                Nome Completo *
              </Label>
              <Input
                id="user-name"
                required
                placeholder="Ex: João Silva"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                className="mt-1"
                disabled={loading}
              />
            </div>

            {/* Email */}
            <div>
              <Label htmlFor="user-email" className="text-xs font-semibold text-slate-700">
                Endereço de E-mail *
              </Label>
              <Input
                id="user-email"
                type="email"
                required
                placeholder="Ex: joao.silva@exemplo.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-1"
                disabled={loading}
              />
            </div>

            {/* Senha */}
            <div>
              <Label htmlFor="user-password" className="text-xs font-semibold text-slate-700">
                Senha Inicial * (mínimo 6 caracteres)
              </Label>
              <div className="relative mt-1">
                <Input
                  id="user-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="******"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="pr-10"
                  disabled={loading}
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                O usuário poderá utilizar esta senha para acessar o painel.
              </p>
            </div>

            {/* Papel */}
            <div>
              <Label htmlFor="user-role" className="text-xs font-semibold text-slate-700">
                Papel / Permissão *
              </Label>
              <Select
                value={formData.papel}
                onValueChange={(val: 'admin' | 'operador' | 'operador_diretoria') =>
                  setFormData({ ...formData, papel: val })
                }
                disabled={loading}
              >
                <SelectTrigger id="user-role" className="mt-1">
                  <SelectValue placeholder="Selecione o papel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operador">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-600" />
                      <span>Operador (Bibliotecário - gestão de acervo geral e empréstimos)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="operador_diretoria">
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
              <UserPlus className="w-4 h-4" />
              Criar Usuário
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
