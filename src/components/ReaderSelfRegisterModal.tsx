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
import { LeitoresService } from '@/services/leitores'
import { CursosService, Curso } from '@/services/cursos'
import { useToast } from '@/hooks/use-toast'
import {
  formatMobilePhone,
  validateMobilePhone,
  formatLandlinePhone,
  validateLandlinePhone,
} from '@/lib/utils'
import {
  UserPlus,
  Loader2,
  Upload,
  Camera,
  X,
  ClipboardPaste,
  Plus,
  GraduationCap,
  Phone,
  Smartphone,
  Mail,
  CheckCircle2,
  ShieldAlert,
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

interface ReaderSelfRegisterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function ReaderSelfRegisterModal({
  open,
  onOpenChange,
  onSuccess,
}: ReaderSelfRegisterModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [submittedSuccess, setSubmittedSuccess] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Erros de validação
  const [emailError, setEmailError] = useState<string | null>(null)
  const [celularError, setCelularError] = useState<string | null>(null)
  const [telefoneFixoError, setTelefoneFixoError] = useState<string | null>(null)

  // Estado do formulário (sem CPF e sem senha)
  const [formData, setFormData] = useState({
    nome_do_leitor: '',
    email: '',
    celular: '',
    telefone_fixo: '',
    foto: '',
  })

  // Cursos da CEP
  const [allCursos, setAllCursos] = useState<Curso[]>([])
  const [selectedCursoIds, setSelectedCursoIds] = useState<string[]>([])
  const [cursoToAdd, setCursoToAdd] = useState<string>('')
  const [loadingCursos, setLoadingCursos] = useState<boolean>(false)

  useEffect(() => {
    if (open) {
      setSubmittedSuccess(false)
      setEmailError(null)
      setCelularError(null)
      setTelefoneFixoError(null)
      setFormData({
        nome_do_leitor: '',
        email: '',
        celular: '',
        telefone_fixo: '',
        foto: '',
      })
      setPhotoFile(null)
      setPhotoPreview(null)
      setSelectedCursoIds([])
      setCursoToAdd('')

      setLoadingCursos(true)
      CursosService.getAll()
        .then((data) => setAllCursos(data.filter((c) => c.ativo !== false)))
        .catch((err) => console.warn('Erro ao carregar lista de cursos:', err))
        .finally(() => setLoadingCursos(false))
    }
  }, [open])

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
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onload = (ev) => {
        setPhotoPreview(ev.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const applyPhotoFile = (file: File) => {
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setPhotoPreview(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    try {
      const file = await extractImageFileFromClipboard(e)
      if (file) {
        e.preventDefault()
        e.stopPropagation()
        applyPhotoFile(file)
        toast({
          title: 'Imagem colada!',
          description: 'Foto colada com sucesso da área de transferência.',
        })
      }
    } catch (err: any) {
      console.warn('Erro ao colar foto:', err)
    }
  }

  const handlePasteButtonClick = async () => {
    try {
      const file = await extractImageFileFromClipboard()
      if (file) {
        applyPhotoFile(file)
        toast({
          title: 'Imagem colada!',
          description: 'Foto colada com sucesso.',
        })
      } else {
        toast({
          title: 'Nenhuma imagem encontrada',
          description: 'Copie uma imagem ou use Ctrl+V na área de foto.',
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'Aviso',
        description: 'Clique na área da foto e pressione Ctrl+V para colar a imagem.',
      })
    }
  }

  const handleRemovePhoto = () => {
    setPhotoFile(null)
    setPhotoPreview(null)
    setFormData((prev) => ({ ...prev, foto: '' }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError(null)
    setCelularError(null)
    setTelefoneFixoError(null)

    const cleanNome = formData.nome_do_leitor.trim()
    const cleanEmail = formData.email.trim().toLowerCase()

    if (!cleanNome) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe seu nome completo.',
        variant: 'destructive',
      })
      return
    }

    if (!cleanEmail) {
      setEmailError('E-mail obrigatório')
      toast({
        title: 'E-mail obrigatório',
        description: 'Informe um endereço de e-mail.',
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

    // 1. Validação de duplicidade de e-mail no sistema
    try {
      const emailExists = await LeitoresService.checkEmailExists(cleanEmail)
      if (emailExists) {
        // Verificar se há registro ativo na tabela leitor
        const { data: existingReader } = await LeitoresService.findByEmail(cleanEmail)
        if (existingReader) {
          setEmailError('E-mail já cadastrado')
          toast({
            title: 'E-mail já cadastrado',
            description: `O e-mail "${cleanEmail}" já está em uso no sistema. Caso já tenha cadastro, aguarde a validação ou entre em contato com a biblioteca.`,
            variant: 'destructive',
          })
          return
        }
      }
    } catch (checkEmailErr) {
      console.warn('Erro ao verificar email:', checkEmailErr)
    }

    // 2. Validação do Celular/WhatsApp (se preenchido, 2 dígitos DDD + 9 dígitos celular: 11 dígitos)
    const cleanCelularDigits = formData.celular.replace(/\D/g, '')
    if (cleanCelularDigits.length > 0) {
      if (!validateMobilePhone(cleanCelularDigits)) {
        setCelularError('Informe o celular no formato: (XX) 9XXXX-XXXX')
        toast({
          title: 'Celular inválido',
          description:
            'O campo "Celular/WhatsApp" deve conter 2 dígitos para o DDD seguidos de 9 dígitos para o celular (ex: (11) 98765-4321).',
          variant: 'destructive',
        })
        return
      }
    }

    // 3. Validação do Telefone Fixo (se preenchido, 2 dígitos DDD + 8 dígitos fixo: 10 dígitos)
    const cleanFixoDigits = formData.telefone_fixo.replace(/\D/g, '')
    if (cleanFixoDigits.length > 0) {
      if (!validateLandlinePhone(cleanFixoDigits)) {
        setTelefoneFixoError('Informe o fixo no formato: (XX) XXXX-XXXX')
        toast({
          title: 'Telefone Fixo inválido',
          description:
            'O campo "Telefone Fixo" deve conter 2 dígitos para o DDD seguidos de 8 dígitos para o fixo (ex: (11) 3456-7890).',
          variant: 'destructive',
        })
        return
      }
    }

    setLoading(true)
    try {
      let finalFotoUrl = formData.foto || null
      let fileToUpload = photoFile

      if (
        !fileToUpload &&
        photoPreview &&
        (photoPreview.startsWith('data:image/') || photoPreview.startsWith('blob:')) &&
        photoPreview !== formData.foto
      ) {
        try {
          fileToUpload = await urlToFile(photoPreview, `leitor-auto-${Date.now()}.png`)
        } catch (convErr) {
          console.warn('Erro ao converter preview para arquivo:', convErr)
        }
      }

      if (fileToUpload) {
        try {
          finalFotoUrl = await uploadImageToStorage(fileToUpload, 'avatars', {
            maxWidth: 400,
            maxHeight: 400,
            quality: 0.8,
            outputFormat: 'image/jpeg',
          })
        } catch (uploadErr: any) {
          console.warn('Aviso no upload da foto:', uploadErr)
          // Continua o cadastro mesmo se a foto falhar
        }
      }

      const primaryCursoObj = allCursos.find((c) => selectedCursoIds.includes(c.id))
      const primaryCursoNome = primaryCursoObj ? primaryCursoObj.nome : null

      const formattedCelular = cleanCelularDigits ? formatMobilePhone(cleanCelularDigits) : null
      const formattedFixo = cleanFixoDigits ? formatLandlinePhone(cleanFixoDigits) : null

      // Inserir leitor com status 'pendente' e já passar os cursos_ids
      const createdLeitor = await LeitoresService.autoRegister({
        nome_do_leitor: cleanNome,
        email: cleanEmail,
        telefone: formattedCelular,
        telefone_fixo: formattedFixo,
        foto: finalFotoUrl,
        curso: primaryCursoNome,
        cursos_ids: selectedCursoIds,
      })

      // Garantia adicional de vinculação de cursos selecionados
      if (createdLeitor && createdLeitor.id_leitor && selectedCursoIds.length > 0) {
        try {
          await CursosService.setCursosForLeitor(createdLeitor.id_leitor, selectedCursoIds)
        } catch (cursoErr) {
          console.warn('Aviso ao vincular cursos via fallback:', cursoErr)
        }
      }

      setRegisteredEmail(cleanEmail)
      setSubmittedSuccess(true)
      if (onSuccess) onSuccess()
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar cadastro',
        description: err.message || 'Não foi possível concluir seu cadastro. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setSubmittedSuccess(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[92vh] overflow-y-auto">
        {submittedSuccess ? (
          <div className="py-6 space-y-5 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center shadow-inner">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-2">
              <DialogTitle className="text-xl font-bold text-slate-900">
                Cadastro Enviado com Sucesso!
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                Agradecemos pelo seu cadastro na <strong>Biblioteca da CEP</strong>.
              </DialogDescription>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-left text-xs text-emerald-950 space-y-2.5 shadow-2xs">
              <div className="flex items-start gap-2.5">
                <Mail className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-emerald-900">Validação pela Biblioteca da CEP</p>
                  <p className="text-emerald-800 leading-relaxed text-[11px]">
                    As informações cadastradas serão analisadas e validadas pela equipe da
                    Biblioteca da CEP.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 pt-1 border-t border-emerald-200/60">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-emerald-900">
                    Instruções para o Primeiro Acesso
                  </p>
                  <p className="text-emerald-800 leading-relaxed text-[11px]">
                    Após a aprovação, um <strong>e-mail com o link para o primeiro acesso</strong>{' '}
                    será enviado para <strong>{registeredEmail}</strong> para que você possa definir
                    sua senha de acesso ao sistema.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button
                onClick={handleClose}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs h-9"
              >
                Voltar para a Tela de Login
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900">
                <UserPlus className="w-5 h-5 text-emerald-600" />
                <span>Cadastro de Novo Leitor</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Preencha seus dados para solicitar o cadastro na Biblioteca da CEP. Após a validação
                pela equipe, você receberá por e-mail as orientações para o primeiro acesso.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3.5 py-3">
              {/* Foto do Leitor (Opcional) */}
              <div
                onPaste={handlePaste}
                tabIndex={0}
                className="flex flex-col sm:flex-row items-center gap-3.5 p-3 bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all cursor-default"
                title="Clique aqui e pressione Ctrl+V para colar uma imagem"
              >
                <Avatar className="w-14 h-14 border-2 border-emerald-500 shadow-sm shrink-0">
                  {photoPreview ? (
                    <AvatarImage
                      src={photoPreview}
                      alt="Preview da foto"
                      className="object-cover"
                    />
                  ) : (
                    <AvatarFallback className="bg-emerald-100 text-emerald-800 text-sm font-bold">
                      <Camera className="w-5 h-5 text-emerald-600" />
                    </AvatarFallback>
                  )}
                </Avatar>

                <div className="space-y-1 flex-1 text-center sm:text-left min-w-0">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-800">
                      Foto do Leitor (Opcional)
                    </Label>
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-400">
                      <ClipboardPaste className="w-3 h-3" /> Ctrl+V aceito
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Selecione uma imagem ou cole da área de transferência.
                  </p>
                  <div className="flex items-center justify-center sm:justify-start gap-2 pt-0.5">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 shadow-xs">
                      <Upload className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Selecionar</span>
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
                <Label htmlFor="auto_nome" className="text-xs font-semibold text-slate-700">
                  Nome Completo *
                </Label>
                <Input
                  id="auto_nome"
                  required
                  placeholder="Ex: Maria dos Santos"
                  value={formData.nome_do_leitor}
                  onChange={(e) => setFormData({ ...formData, nome_do_leitor: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>

              {/* E-mail / Login */}
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto_email" className="text-xs font-semibold text-slate-700">
                    E-mail (será seu login de acesso) *
                  </Label>
                  {emailError && (
                    <span className="text-[11px] font-medium text-rose-600 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" />
                      {emailError}
                    </span>
                  )}
                </div>
                <Input
                  id="auto_email"
                  type="email"
                  required
                  placeholder="seu.email@exemplo.com"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value })
                    setEmailError(null)
                  }}
                  className={`mt-1 text-xs ${
                    emailError ? 'border-rose-500 focus-visible:ring-rose-500' : ''
                  }`}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  O link de primeiro acesso para cadastramento da senha será enviado para este
                  e-mail.
                </p>
              </div>

              {/* Telefones: Celular e Fixo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Celular/WhatsApp */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="auto_celular"
                      className="text-xs font-semibold text-slate-700 flex items-center gap-1"
                    >
                      <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                      Celular/WhatsApp
                    </Label>
                    {celularError && (
                      <span className="text-[10px] font-medium text-rose-600">{celularError}</span>
                    )}
                  </div>
                  <Input
                    id="auto_celular"
                    type="tel"
                    placeholder="(XX) 9XXXX-XXXX"
                    maxLength={15}
                    value={formData.celular}
                    onChange={(e) => {
                      setFormData({ ...formData, celular: formatMobilePhone(e.target.value) })
                      if (celularError) setCelularError(null)
                    }}
                    className={`mt-1 text-xs font-mono ${
                      celularError ? 'border-rose-500 focus-visible:ring-rose-500' : ''
                    }`}
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    2 dígitos DDD + 9 dígitos celular
                  </p>
                </div>

                {/* Telefone Fixo */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="auto_fixo"
                      className="text-xs font-semibold text-slate-700 flex items-center gap-1"
                    >
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      Telefone Fixo (Opcional)
                    </Label>
                    {telefoneFixoError && (
                      <span className="text-[10px] font-medium text-rose-600">
                        {telefoneFixoError}
                      </span>
                    )}
                  </div>
                  <Input
                    id="auto_fixo"
                    type="tel"
                    placeholder="(XX) XXXX-XXXX"
                    maxLength={14}
                    value={formData.telefone_fixo}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        telefone_fixo: formatLandlinePhone(e.target.value),
                      })
                      if (telefoneFixoError) setTelefoneFixoError(null)
                    }}
                    className={`mt-1 text-xs font-mono ${
                      telefoneFixoError ? 'border-rose-500 focus-visible:ring-rose-500' : ''
                    }`}
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    2 dígitos DDD + 8 dígitos fixo
                  </p>
                </div>
              </div>

              {/* Cursos Frequentados na CEP */}
              <div className="space-y-2 p-3 bg-slate-50/80 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-emerald-600" />
                    Curso(s) que você frequenta na CEP (Opcional)
                  </Label>
                  <span className="text-[11px] text-slate-500">
                    {selectedCursoIds.length === 0
                      ? 'Nenhum curso selecionado'
                      : `${selectedCursoIds.length} selecionado(s)`}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 min-h-[26px] items-center">
                  {selectedCursoIds.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">
                      Se você frequenta algum curso na CEP, selecione abaixo e clique em Adicionar
                      (+).
                    </span>
                  ) : (
                    selectedCursoIds.map((cId) => {
                      const cObj = allCursos.find((c) => c.id === cId)
                      const cNome = cObj?.nome || cId
                      return (
                        <Badge
                          key={cId}
                          variant="secondary"
                          className="bg-emerald-100 text-emerald-900 border-emerald-300 text-xs py-0.5 px-2 gap-1.5 font-medium flex items-center"
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

                <div className="flex items-center gap-2 pt-1">
                  <Select value={cursoToAdd} onValueChange={setCursoToAdd} disabled={loadingCursos}>
                    <SelectTrigger className="text-xs h-8 bg-white flex-1">
                      <SelectValue placeholder="Selecione um curso..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {allCursos
                        .filter((c) => !selectedCursoIds.includes(c.id))
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">
                            {c.nome}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddCurso}
                    disabled={!cursoToAdd}
                    className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white hover:text-white border-none gap-1 font-semibold shrink-0 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar (+)</span>
                  </Button>
                </div>
              </div>

              {/* Aviso explicativo sobre o fluxo */}
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-lg p-2.5 text-[11px] text-emerald-900 leading-relaxed">
                <strong>Atenção:</strong> Não é necessário definir senha neste momento. Seu cadastro
                ficará pendente de validação pela Biblioteca da CEP. Após a aprovação, você receberá
                por e-mail o link para criar sua senha de acesso.
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-end pt-2">
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
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Enviando Cadastro...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Confirmar Cadastro
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
