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
import { Switch } from '@/components/ui/switch'
import { LeitoresService, Leitor } from '@/services/leitores'
import { CursosService, Curso } from '@/services/cursos'
import { useToast } from '@/hooks/use-toast'
import { formatCPF, formatPhone, validateCPF } from '@/lib/utils'
import {
  UserPlus,
  Loader2,
  Upload,
  Camera,
  X,
  ClipboardPaste,
  Plus,
  GraduationCap,
  ShieldCheck,
  ShieldAlert,
  Info,
  AlertCircle,
} from 'lucide-react'
import { uploadImageToStorage, extractImageFileFromClipboard, urlToFile } from '@/lib/image-upload'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

import { useAuth } from '@/hooks/use-auth'

interface ReaderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  readerToEdit?: Leitor | null
  isSelfEdit?: boolean
  onSuccess: () => void
}

export function ReaderModal({
  open,
  onOpenChange,
  readerToEdit,
  isSelfEdit = false,
  onSuccess,
}: ReaderModalProps) {
  const { isOperadorOrAdmin, refreshProfile } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [cpfError, setCpfError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    nome_do_leitor: '',
    email: '',
    cpf: '',
    telefone: '',
    foto: '',
    bloqueado: false,
    acesso_diretoria: false,
  })

  // Gerenciamento de cursos
  const [allCursos, setAllCursos] = useState<Curso[]>([])
  const [selectedCursoIds, setSelectedCursoIds] = useState<string[]>([])
  const [cursoToAdd, setCursoToAdd] = useState<string>('')
  const [loadingCursos, setLoadingCursos] = useState<boolean>(false)

  // Carregar lista geral de cursos quando modal abrir
  useEffect(() => {
    if (open) {
      CursosService.getAll()
        .then((data) => setAllCursos(data.filter((c) => c.ativo !== false)))
        .catch((err) => console.warn('Erro ao carregar lista de cursos:', err))
    }
  }, [open])

  useEffect(() => {
    setCpfError(null)
    setEmailError(null)
    setCursoToAdd('')

    if (readerToEdit) {
      setFormData({
        nome_do_leitor: readerToEdit.nome_do_leitor,
        email: readerToEdit.email,
        cpf: formatCPF(readerToEdit.cpf || ''),
        telefone: formatPhone(readerToEdit.telefone || ''),
        foto: readerToEdit.foto || '',
        bloqueado: readerToEdit.bloqueado || false,
        acesso_diretoria: Boolean((readerToEdit as any).acesso_diretoria),
      })
      setPhotoPreview(readerToEdit.foto || null)
      setPhotoFile(null)

      // Carregar cursos vinculados ao leitor
      setLoadingCursos(true)
      CursosService.getCursosByLeitor(readerToEdit.id_leitor)
        .then((cursosDoLeitor) => {
          setSelectedCursoIds(cursosDoLeitor.map((c) => c.id))
        })
        .catch((err) => {
          console.warn('Erro ao carregar cursos do leitor:', err)
          setSelectedCursoIds([])
        })
        .finally(() => setLoadingCursos(false))
    } else {
      setFormData({
        nome_do_leitor: '',
        email: '',
        cpf: '',
        telefone: '',
        foto: '',
        bloqueado: false,
        acesso_diretoria: false,
      })
      setPhotoPreview(null)
      setPhotoFile(null)
      setSelectedCursoIds([])
    }
  }, [readerToEdit, open])

  const handleAddCurso = () => {
    if (!cursoToAdd) return
    if (!selectedCursoIds.includes(cursoToAdd)) {
      setSelectedCursoIds((prev) => [...prev, cursoToAdd])
    }
    setCursoToAdd('')
  }

  const handleRemoveCurso = (cursoId: string) => {
    setSelectedCursoIds((prev) => prev.filter((id) => id !== cursoId))
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      console.log('[ReaderModal] Foto de leitor selecionada via arquivo:', file.name, file.size)
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onload = (ev) => {
        setPhotoPreview(ev.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const applyPhotoFile = (file: File) => {
    console.log('[ReaderModal] Aplicando arquivo de foto do leitor (tamanho:', file.size, ')')
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setPhotoPreview(ev.target?.result as string)
      console.log('[ReaderModal] Preview atualizado com sucesso da foto.')
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    console.log('[ReaderModal] Evento paste no container da foto')
    try {
      const file = await extractImageFileFromClipboard(e)
      if (file) {
        e.preventDefault()
        e.stopPropagation()
        console.log('[ReaderModal] Imagem extraída com sucesso:', file.size, 'bytes')
        applyPhotoFile(file)
        toast({
          title: 'Imagem colada!',
          description: 'Foto do leitor colada com sucesso da área de transferência.',
        })
      }
    } catch (err: any) {
      console.warn('[ReaderModal] Erro ao processar imagem colada do leitor:', err)
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
        console.log('[ReaderModal] Global paste interceptado (hasImage:', hasImageItems, ')')
        try {
          const file = await extractImageFileFromClipboard(e)
          if (file) {
            e.preventDefault()
            e.stopPropagation()
            applyPhotoFile(file)
            toast({
              title: 'Imagem colada!',
              description: 'Foto do leitor colada com sucesso da área de transferência.',
            })
          }
        } catch (err: any) {
          console.warn('[ReaderModal] Erro no global paste:', err)
        }
      }
    }

    window.addEventListener('paste', handleGlobalPaste)
    return () => window.removeEventListener('paste', handleGlobalPaste)
  }, [open, toast])

  const handlePasteButtonClick = async () => {
    console.log('[ReaderModal] Botão colar clicado')
    try {
      const file = await extractImageFileFromClipboard()
      if (file) {
        console.log('[ReaderModal] Imagem colada via botão:', file.size)
        applyPhotoFile(file)
        toast({
          title: 'Imagem colada!',
          description: 'Foto do leitor colada com sucesso da área de transferência.',
        })
      } else {
        toast({
          title: 'Nenhuma imagem encontrada',
          description: 'Copie uma imagem ou use Ctrl+V diretamente na área de foto.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      console.warn('[ReaderModal] Falha ao ler clipboard via botão:', err)
      toast({
        title: 'Aviso',
        description: 'Clique no campo e pressione Ctrl+V para colar a imagem.',
      })
    }
  }

  const handleRemovePhoto = () => {
    setPhotoFile(null)
    setPhotoPreview(null)
    setFormData((prev) => ({ ...prev, foto: '' }))
  }

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCPF(e.target.value)
    setFormData((prev) => ({ ...prev, cpf: formatted }))
    setCpfError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCpfError(null)
    setEmailError(null)

    const cleanNome = formData.nome_do_leitor.trim()
    const cleanEmail = formData.email.trim().toLowerCase()

    if (!cleanNome) {
      toast({
        title: 'Nome obrigatório',
        description: 'O campo Nome Completo é obrigatório.',
        variant: 'destructive',
      })
      return
    }

    if (!readerToEdit) {
      if (!cleanEmail) {
        toast({
          title: 'E-mail obrigatório',
          description: 'O endereço de e-mail é obrigatório para novos cadastros de leitores.',
          variant: 'destructive',
        })
        return
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(cleanEmail)) {
        setEmailError('Formato de e-mail inválido')
        toast({
          title: 'E-mail inválido',
          description: 'Por favor, informe um endereço de e-mail válido.',
          variant: 'destructive',
        })
        return
      }

      // Validação de duplicidade de e-mail no sistema
      try {
        const emailExists = await LeitoresService.checkEmailExists(cleanEmail)
        if (emailExists) {
          setEmailError('E-mail já cadastrado')
          toast({
            title: 'E-mail já cadastrado',
            description: `O e-mail "${cleanEmail}" já está em uso no sistema. Como ele é o identificador de login de acesso, cada leitor deve possuir um e-mail exclusivo.`,
            variant: 'destructive',
          })
          return
        }
      } catch (checkEmailErr) {
        console.warn('Erro ao verificar email:', checkEmailErr)
      }
    }

    const cleanCpf = formData.cpf.replace(/\D/g, '')
    if (cleanCpf) {
      // 1. Validação dos dígitos verificadores
      if (!validateCPF(cleanCpf)) {
        setCpfError('CPF inválido')
        toast({
          title: 'CPF inválido',
          description:
            'Por favor, informe um número de CPF válido com dígitos verificadores corretos.',
          variant: 'destructive',
        })
        return
      }

      // 2. Validação de duplicidade
      try {
        const exists = await LeitoresService.checkCpfExists(
          cleanCpf,
          readerToEdit ? readerToEdit.id_leitor : undefined,
        )
        if (exists) {
          setCpfError('CPF já cadastrado')
          toast({
            title: 'CPF já cadastrado',
            description: 'Já existe outro leitor cadastrado com este mesmo CPF.',
            variant: 'destructive',
          })
          return
        }
      } catch (checkErr: any) {
        console.error('Erro ao verificar CPF:', checkErr)
      }
    }

    setLoading(true)
    try {
      let finalFotoUrl = formData.foto || null
      let fileToUpload = photoFile

      console.log(
        '[ReaderModal] Salvando leitor... fileToUpload:',
        !!fileToUpload,
        'preview:',
        !!photoPreview,
      )

      // Fallback: se houver photoPreview (ex: dataURL ou blob colado) e não tiver photoFile, converter
      if (
        !fileToUpload &&
        photoPreview &&
        (photoPreview.startsWith('data:image/') || photoPreview.startsWith('blob:')) &&
        photoPreview !== formData.foto
      ) {
        try {
          console.log('[ReaderModal] Convertendo photoPreview em File...')
          fileToUpload = await urlToFile(photoPreview, `leitor-${Date.now()}.png`)
          console.log(
            '[ReaderModal] Preview convertido com sucesso em File:',
            fileToUpload.size,
            'bytes',
          )
        } catch (convErr) {
          console.warn('[ReaderModal] Erro ao converter preview para arquivo:', convErr)
        }
      }

      if (fileToUpload) {
        try {
          console.log('[ReaderModal] Enviando foto para storage avatars...')
          finalFotoUrl = await uploadImageToStorage(fileToUpload, 'avatars', {
            maxWidth: 400,
            maxHeight: 400,
            quality: 0.8,
            outputFormat: 'image/jpeg',
          })
          console.log('[ReaderModal] Upload concluído, URL pública:', finalFotoUrl)
        } catch (uploadErr: any) {
          console.error('[ReaderModal] Erro ao enviar foto do leitor para o storage:', uploadErr)
          throw new Error(`Falha no upload da foto: ${uploadErr.message || 'Erro desconhecido'}`)
        }
      } else if (!photoPreview) {
        console.log('[ReaderModal] Sem preview de foto, definindo foto como null')
        finalFotoUrl = null
      }

      // Descobrir nome do curso primário (para compatibilidade com colunas legadas leitor.curso)
      const primaryCursoObj = allCursos.find((c) => selectedCursoIds.includes(c.id))
      const primaryCursoNome = primaryCursoObj ? primaryCursoObj.nome : null

      if (readerToEdit) {
        // Na edição, o e-mail NÃO é alterado (mantém o e-mail original como login de entrada)
        const updatePayload: any = {
          nome_do_leitor: formData.nome_do_leitor.trim(),
          cpf: formData.cpf.trim() || null,
          telefone: formData.telefone.trim() || null,
          foto: finalFotoUrl,
          curso: primaryCursoNome,
        }

        // Apenas operador/admin pode alterar o status de bloqueio e acesso à diretoria
        if (isOperadorOrAdmin && !isSelfEdit) {
          updatePayload.bloqueado = formData.bloqueado
          updatePayload.acesso_diretoria = formData.acesso_diretoria
        }

        await LeitoresService.update(readerToEdit.id_leitor, updatePayload)

        // Salvar múltiplos cursos vinculados
        if (isOperadorOrAdmin || !isSelfEdit) {
          await CursosService.setCursosForLeitor(readerToEdit.id_leitor, selectedCursoIds)
        }

        await refreshProfile()
        toast({ title: 'Sucesso', description: 'Dados do leitor atualizados com sucesso!' })
      } else {
        const createdLeitor = await LeitoresService.create({
          nome_do_leitor: formData.nome_do_leitor.trim(),
          email: formData.email.trim(),
          cpf: formData.cpf.trim() || null,
          telefone: formData.telefone.trim() || null,
          foto: finalFotoUrl,
          bloqueado: isOperadorOrAdmin ? formData.bloqueado : false,
          acesso_diretoria: isOperadorOrAdmin ? formData.acesso_diretoria : false,
          curso: primaryCursoNome,
        } as any)

        if (createdLeitor && createdLeitor.id_leitor && selectedCursoIds.length > 0) {
          await CursosService.setCursosForLeitor(createdLeitor.id_leitor, selectedCursoIds)
        }

        toast({ title: 'Sucesso', description: 'Novo leitor cadastrado com sucesso!' })
      }
      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar leitor',
        description: err.message || 'Verifique se o e-mail ou CPF já não estão cadastrados.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <UserPlus className="w-5 h-5 text-emerald-600" />
              {readerToEdit
                ? isSelfEdit
                  ? 'Gestão de Leitores — Meus Dados'
                  : 'Gestão de Leitores — Editar Leitor'
                : 'Gestão de Leitores — Cadastrar Leitor'}
            </DialogTitle>
            <DialogDescription>
              {readerToEdit
                ? isSelfEdit
                  ? 'Altere suas informações de nome, CPF, telefone e foto. O e-mail de login não pode ser alterado.'
                  : 'Atualize as informações de contato, cursos frequentados e permissão do leitor.'
                : 'Cadastre um leitor para habilitar a realização de empréstimos e reservas.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Foto do Leitor */}
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
                    Foto do Leitor (Opcional)
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

            <div>
              <Label htmlFor="nome_do_leitor" className="text-xs font-semibold text-slate-700">
                Nome Completo *
              </Label>
              <Input
                id="nome_do_leitor"
                required
                placeholder="Ex: Maria dos Santos"
                value={formData.nome_do_leitor}
                onChange={(e) => setFormData({ ...formData, nome_do_leitor: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                  {readerToEdit
                    ? 'E-mail (Login de Entrada - Não Editável)'
                    : 'E-mail Institucional ou Pessoal *'}
                </Label>
                {readerToEdit ? (
                  <span className="text-[11px] font-medium text-amber-700 flex items-center gap-1">
                    <Info className="w-3 h-3" /> Login Bloqueado
                  </span>
                ) : emailError ? (
                  <span className="text-[11px] font-medium text-rose-600">{emailError}</span>
                ) : null}
              </div>
              <Input
                id="email"
                type="email"
                required={!readerToEdit}
                readOnly={!!readerToEdit}
                disabled={!!readerToEdit}
                placeholder="Ex: maria.santos@escola.br"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value })
                  setEmailError(null)
                }}
                className={`mt-1 text-xs ${
                  readerToEdit
                    ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 select-none'
                    : emailError
                      ? 'border-rose-500 focus-visible:ring-rose-500'
                      : ''
                }`}
              />
              {readerToEdit ? (
                <div className="mt-1.5 flex items-start gap-1.5 p-2 rounded bg-amber-50/80 border border-amber-200/60 text-[11px] text-amber-900 leading-snug">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    O e-mail é o <strong>login de entrada</strong> e não pode ser alterado na
                    edição. Para alterar o e-mail, é necessário excluir o leitor e cadastrá-lo
                    novamente com o novo e-mail.
                  </span>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 mt-1">
                  Este e-mail será utilizado como identificador único de login no sistema.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="cpf" className="text-xs font-semibold text-slate-700">
                    CPF
                  </Label>
                  {cpfError && (
                    <span className="text-[11px] font-medium text-rose-600">{cpfError}</span>
                  )}
                </div>
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  maxLength={14}
                  value={formData.cpf}
                  onChange={handleCpfChange}
                  className={`mt-1 font-mono text-xs ${
                    cpfError ? 'border-rose-500 focus-visible:ring-rose-500' : ''
                  }`}
                />
              </div>

              <div>
                <Label htmlFor="telefone" className="text-xs font-semibold text-slate-700">
                  Telefone / WhatsApp
                </Label>
                <Input
                  id="telefone"
                  type="tel"
                  placeholder="(XX) XXXXX-XXXX"
                  maxLength={15}
                  value={formData.telefone}
                  onChange={(e) =>
                    setFormData({ ...formData, telefone: formatPhone(e.target.value) })
                  }
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            {/* Campo de Curso(s) que está frequentando na CEP */}
            <div className="space-y-2 p-3 bg-slate-50/80 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                  Curso(s) que está frequentando na CEP
                </Label>
                <span className="text-[11px] text-slate-500">
                  {selectedCursoIds.length === 0
                    ? 'Nenhum curso vinculado'
                    : `${selectedCursoIds.length} curso(s)`}
                </span>
              </div>

              {/* Badges dos cursos selecionados */}
              <div className="flex flex-wrap gap-1.5 min-h-[28px] items-center">
                {selectedCursoIds.length === 0 ? (
                  <span className="text-xs text-slate-400 italic">
                    Nenhum curso selecionado no momento. Use o seletor abaixo e o botão (+) para
                    adicionar cursos.
                  </span>
                ) : (
                  selectedCursoIds.map((cId) => {
                    const cObj = allCursos.find((c) => c.id === cId)
                    const cNome = cObj?.nome || cId
                    return (
                      <Badge
                        key={cId}
                        variant="secondary"
                        className="bg-emerald-100 text-emerald-900 border-emerald-300 text-xs py-1 px-2.5 gap-1.5 font-medium flex items-center"
                      >
                        <span>{cNome}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCurso(cId)}
                          className="hover:bg-emerald-200 rounded-full p-0.5 text-emerald-700 hover:text-emerald-950 transition-colors"
                          title="Remover curso"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    )
                  })
                )}
              </div>

              {/* Seletor + Botão (+) para adicionar curso */}
              <div className="flex items-center gap-2 pt-1">
                <Select value={cursoToAdd} onValueChange={setCursoToAdd} disabled={loadingCursos}>
                  <SelectTrigger className="text-xs h-8 bg-white flex-1">
                    <SelectValue placeholder="Selecione um curso para acrescentar..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {allCursos
                      .filter((c) => !selectedCursoIds.includes(c.id))
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.nome}
                        </SelectItem>
                      ))}
                    {allCursos.filter((c) => !selectedCursoIds.includes(c.id)).length === 0 && (
                      <div className="p-2 text-xs text-slate-400 text-center">
                        Todos os cursos disponíveis já foram adicionados.
                      </div>
                    )}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddCurso}
                  disabled={!cursoToAdd}
                  className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white hover:text-white border-none gap-1 font-semibold shrink-0 shadow-xs"
                  title="Adicionar outro curso"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar (+)</span>
                </Button>
              </div>
            </div>

            {/* Flag de acesso aos livros da diretoria: Sim/Não com default Não */}
            {isOperadorOrAdmin && !isSelfEdit && (
              <div
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
                  formData.acesso_diretoria
                    ? 'bg-amber-50/60 border-amber-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    {formData.acesso_diretoria ? (
                      <ShieldCheck className="w-4 h-4 text-amber-600" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-slate-400" />
                    )}
                    <Label className="text-xs font-semibold text-slate-800">
                      Acesso aos Livros da Diretoria
                    </Label>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Permite ao leitor realizar empréstimos e reservas de obras pertencentes ao
                    Acervo da Diretoria.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded select-none ${
                      formData.acesso_diretoria
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {formData.acesso_diretoria ? 'Sim' : 'Não'}
                  </span>
                  <Switch
                    checked={formData.acesso_diretoria}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, acesso_diretoria: checked })
                    }
                    className="data-[state=checked]:bg-amber-600 data-[state=unchecked]:bg-slate-400"
                  />
                </div>
              </div>
            )}

            {readerToEdit && isOperadorOrAdmin && !isSelfEdit && (
              <div
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
                  formData.bloqueado
                    ? 'bg-rose-50/50 border-rose-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold text-slate-800">
                    Bloquear Empréstimos
                  </Label>
                  <p className="text-[11px] text-slate-500">
                    Impede o leitor de solicitar novos livros por pendências
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setFormData({ ...formData, bloqueado: !formData.bloqueado })}
                    className={`h-8 text-xs font-semibold transition-colors gap-1.5 shadow-xs ${
                      formData.bloqueado
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'bg-slate-700 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {formData.bloqueado ? 'Empréstimos Bloqueados' : 'Bloquear Empréstimos'}
                  </Button>
                  <Switch
                    checked={formData.bloqueado}
                    onCheckedChange={(checked) => setFormData({ ...formData, bloqueado: checked })}
                    className="data-[state=checked]:bg-rose-600 data-[state=unchecked]:bg-slate-700"
                  />
                </div>
              </div>
            )}
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {readerToEdit ? 'Salvar Alterações' : 'Salvar Cadastro'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
