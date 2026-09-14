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
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Upload, Camera, X, ClipboardPaste, ImageIcon } from 'lucide-react'
import { uploadImageToStorage, extractImageFileFromClipboard, urlToFile } from '@/lib/image-upload'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { LeitoresService } from '@/services/leitores'

interface EditOwnPhotoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function EditOwnPhotoModal({ open, onOpenChange, onSuccess }: EditOwnPhotoModalProps) {
  const { user, profile, refreshProfile } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setPhotoPreview(profile?.avatar_url || null)
      setPhotoFile(null)
    }
  }, [open, profile?.avatar_url])

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      console.log('[EditOwnPhotoModal] Foto selecionada via arquivo:', file.name, file.size)
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onload = (ev) => {
        setPhotoPreview(ev.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const applyPhotoFile = (file: File) => {
    console.log('[EditOwnPhotoModal] Aplicando arquivo de foto (tamanho:', file.size, ')')
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setPhotoPreview(ev.target?.result as string)
      console.log('[EditOwnPhotoModal] Preview atualizado com sucesso da foto.')
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    console.log('[EditOwnPhotoModal] Evento paste no elemento')
    try {
      const file = await extractImageFileFromClipboard(e)
      if (file) {
        e.preventDefault()
        e.stopPropagation()
        console.log('[EditOwnPhotoModal] Imagem extraída com sucesso:', file.size, 'bytes')
        applyPhotoFile(file)
        toast({
          title: 'Imagem colada!',
          description: 'Foto de perfil colada com sucesso da área de transferência.',
        })
      }
    } catch (err: any) {
      console.warn('[EditOwnPhotoModal] Erro ao processar imagem colada:', err)
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
        console.log('[EditOwnPhotoModal] Global paste interceptado (hasImage:', hasImageItems, ')')
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
          console.warn('[EditOwnPhotoModal] Erro no global paste:', err)
        }
      }
    }

    window.addEventListener('paste', handleGlobalPaste)
    return () => window.removeEventListener('paste', handleGlobalPaste)
  }, [open, toast])

  const handlePasteButtonClick = async () => {
    try {
      const file = await extractImageFileFromClipboard()
      if (file) {
        applyPhotoFile(file)
        toast({
          title: 'Imagem colada!',
          description: 'Foto de perfil colada com sucesso da área de transferência.',
        })
      } else {
        toast({
          title: 'Nenhuma imagem encontrada',
          description: 'Copie uma imagem ou use Ctrl+V diretamente na área de foto.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Aviso',
        description: 'Clique no campo e pressione Ctrl+V para colar a imagem.',
      })
    }
  }

  const handleRemovePhoto = () => {
    setPhotoFile(null)
    setPhotoPreview(null)
  }

  const getInitials = (name?: string) => {
    if (!name) return 'U'
    const parts = name.trim().split(' ')
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return name.substring(0, 2).toUpperCase()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setLoading(true)
    try {
      let finalAvatarUrl: string | null = profile?.avatar_url || null
      let fileToUpload = photoFile

      console.log(
        '[EditOwnPhotoModal] Salvando foto de perfil... fileToUpload:',
        !!fileToUpload,
        'preview:',
        !!photoPreview,
      )

      // Fallback: se houver photoPreview novo (dataURL ou blob) e não tiver photoFile, converter
      if (
        !fileToUpload &&
        photoPreview &&
        (photoPreview.startsWith('data:image/') || photoPreview.startsWith('blob:')) &&
        photoPreview !== profile?.avatar_url
      ) {
        try {
          console.log('[EditOwnPhotoModal] Convertendo photoPreview em File...')
          fileToUpload = await urlToFile(photoPreview, `my-avatar-${Date.now()}.png`)
          console.log('[EditOwnPhotoModal] Preview convertido em File:', fileToUpload.size, 'bytes')
        } catch (convErr) {
          console.warn('[EditOwnPhotoModal] Erro ao converter preview para arquivo:', convErr)
        }
      }

      if (fileToUpload) {
        console.log('[EditOwnPhotoModal] Enviando foto para storage avatars...')
        finalAvatarUrl = await uploadImageToStorage(fileToUpload, 'avatars', {
          maxWidth: 400,
          maxHeight: 400,
          quality: 0.8,
          outputFormat: 'image/jpeg',
        })
        console.log('[EditOwnPhotoModal] Upload concluído, URL pública:', finalAvatarUrl)
      } else if (!photoPreview) {
        console.log('[EditOwnPhotoModal] Sem preview, definindo avatar_url como null')
        finalAvatarUrl = null
      }

      // 1. Atualizar em profiles
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({
          avatar_url: finalAvatarUrl,
        })
        .eq('id', user.id)

      if (profileErr) {
        console.warn('Erro ao atualizar profiles:', profileErr)
      }

      // 2. Se houver leitor vinculado, atualizar tabela leitor.foto
      try {
        if (profile?.id_leitor) {
          await supabase
            .from('leitor')
            .update({ foto: finalAvatarUrl })
            .eq('id_leitor', profile.id_leitor)
        } else {
          // Buscar leitor pelo id_auth ou email
          const { data: leitorRow } = await supabase
            .from('leitor')
            .select('id_leitor')
            .or(`id_auth.eq.${user.id},email.eq.${user.email}`)
            .maybeSingle()

          if (leitorRow) {
            await supabase
              .from('leitor')
              .update({ foto: finalAvatarUrl })
              .eq('id_leitor', leitorRow.id_leitor)
          }
        }
      } catch (leitorSyncErr) {
        console.warn('Erro ao sincronizar foto na tabela leitor:', leitorSyncErr)
      }

      // 3. Atualizar metadados do auth
      try {
        await supabase.auth.updateUser({
          data: {
            avatar_url: finalAvatarUrl,
          },
        })
      } catch (authMetaErr) {
        console.warn('Erro ao sincronizar avatar nos metadados do auth:', authMetaErr)
      }

      await refreshProfile()

      toast({
        title: 'Foto atualizada!',
        description: 'Sua foto de perfil foi salva com sucesso.',
      })

      if (onSuccess) onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar foto',
        description: err.message || 'Não foi possível atualizar sua foto.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <ImageIcon className="w-5 h-5 text-emerald-600" />
              Editar Minha Foto de Perfil
            </DialogTitle>
            <DialogDescription>
              Selecione uma nova imagem ou cole da área de transferência para alterar sua foto.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div
              onPaste={handlePaste}
              tabIndex={0}
              className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all cursor-default"
              title="Clique aqui e pressione Ctrl+V / Cmd+V para colar uma imagem"
            >
              <Avatar className="w-20 h-20 border-2 border-emerald-500 shadow-md shrink-0">
                {photoPreview ? (
                  <AvatarImage src={photoPreview} alt="Preview da foto" className="object-cover" />
                ) : (
                  <AvatarFallback className="bg-emerald-100 text-emerald-800 text-lg font-bold">
                    {getInitials(profile?.full_name)}
                  </AvatarFallback>
                )}
              </Avatar>

              <div className="space-y-2 flex-1 text-center sm:text-left">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-800">Foto do Perfil</Label>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-400">
                    <ClipboardPaste className="w-3 h-3" /> Ctrl+V aceito
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  A imagem é otimizada e comprimida automaticamente para carregamento rápido.
                </p>
                <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 shadow-xs">
                    <Upload className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{photoPreview ? 'Alterar Imagem' : 'Selecionar Foto'}</span>
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
                    className="h-8 text-xs px-2.5 bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
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
                      className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2"
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Remover
                    </Button>
                  )}
                </div>
              </div>
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
              Salvar Foto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
