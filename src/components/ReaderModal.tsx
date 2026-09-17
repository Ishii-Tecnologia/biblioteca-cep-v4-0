import React, { useState, useEffect, useRef } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { LeitoresService, Leitor } from '@/services/leitores'
import { CursosService, Curso } from '@/services/cursos'
import { useToast } from '@/hooks/use-toast'
import {
  formatMobilePhone,
  validateMobilePhone,
  formatLandlinePhone,
  validateLandlinePhone,
} from '@/lib/utils'
import { validateEmailBasic, validateEmailDomainOnline } from '@/lib/email-validation'
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
  KeyRound,
  Eye,
  EyeOff,
  MailCheck,
  Phone,
  Smartphone,
  History,
  CheckCircle2,
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
import { supabase } from '@/lib/supabase/client'

interface ReaderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  readerToEdit?: (Leitor & { telefone_fixo?: string | null; cursos_ids?: string[] }) | null
  isSelfEdit?: boolean
  onSuccess: () => void
  onViewHistory?: () => void
}

export function ReaderModal({
  open,
  onOpenChange,
  readerToEdit,
  isSelfEdit = false,
  onSuccess,
  onViewHistory,
}: ReaderModalProps) {
  const { isOperadorOrAdmin, refreshProfile } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Erros de validação
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailValidating, setEmailValidating] = useState(false)
  const [emailValidSuccess, setEmailValidSuccess] = useState(false)
  const [celularError, setCelularError] = useState<string | null>(null)
  const [telefoneFixoError, setTelefoneFixoError] = useState<string | null>(null)
  const [senhaError, setSenhaError] = useState<string | null>(null)

  // Estado do formulário
  const [formData, setFormData] = useState({
    nome_do_leitor: '',
    email: '',
    celular: '',
    telefone_fixo: '',
    foto: '',
    bloqueado: false,
    acesso_diretoria: false,
  })

  // Ref para debounce da validação em tempo real de e-mail
  const emailDebounceTimerRef = useRef<any>(null)
  const emailCallIdRef = useRef<number>(0)

  // Senha para primeiro acesso (novo leitor)
  const [firstAccessPassword, setFirstAccessPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Checkbox de reset de senha (edição pelo operador)
  const [sendPasswordReset, setSendPasswordReset] = useState(false)

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
    setEmailError(null)
    setEmailValidating(false)
    setEmailValidSuccess(false)
    setCelularError(null)
    setTelefoneFixoError(null)
    setSenhaError(null)
    setCursoToAdd('')
    setFirstAccessPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    if (emailDebounceTimerRef.current) {
      clearTimeout(emailDebounceTimerRef.current)
    }
    setSendPasswordReset(false)

    if (readerToEdit) {
      setFormData({
        nome_do_leitor: readerToEdit.nome_do_leitor,
        email: readerToEdit.email,
        celular: formatMobilePhone(readerToEdit.telefone || ''),
        telefone_fixo: formatLandlinePhone((readerToEdit as any).telefone_fixo || ''),
        foto: readerToEdit.foto || '',
        bloqueado: readerToEdit.bloqueado || false,
        acesso_diretoria: Boolean((readerToEdit as any).acesso_diretoria),
      })
      setPhotoPreview(readerToEdit.foto || null)
      setPhotoFile(null)

      // Se o objeto readerToEdit já trouxer cursos_ids em cache, pré-popula imediatamente
      const initialIds = Array.isArray(readerToEdit.cursos_ids) ? [...readerToEdit.cursos_ids] : []
      setSelectedCursoIds(initialIds)

      // Carregar cursos vinculados ao leitor via CursosService para ter a lista mais recente
      setLoadingCursos(true)
      CursosService.getCursosByLeitor(readerToEdit.id_leitor)
        .then((cursosDoLeitor) => {
          if (cursosDoLeitor.length > 0) {
            setSelectedCursoIds(cursosDoLeitor.map((c) => c.id))
          } else if (readerToEdit.curso && allCursos.length > 0) {
            // Fallback caso leitor_curso estivesse vazio mas leitor.curso tenha valor
            const match = allCursos.find(
              (c) => c.nome.trim().toLowerCase() === readerToEdit.curso?.trim().toLowerCase(),
            )
            if (match) {
              setSelectedCursoIds([match.id])
            }
          }
        })
        .catch((err) => {
          console.warn('Erro ao carregar cursos do leitor:', err)
        })
        .finally(() => setLoadingCursos(false))
    } else {
      setFormData({
        nome_do_leitor: '',
        email: '',
        celular: '',
        telefone_fixo: '',
        foto: '',
        bloqueado: false,
        acesso_diretoria: false,
      })
      setPhotoPreview(null)
      setPhotoFile(null)
      setSelectedCursoIds([])
    }
  }, [readerToEdit, open, allCursos.length])

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
    try {
      const file = await extractImageFileFromClipboard()
      if (file) {
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

  // Validador em tempo real do e-mail com debounce
  const triggerEmailValidation = (rawEmail: string) => {
    const clean = rawEmail.trim().toLowerCase()
    setEmailValidSuccess(false)

    if (emailDebounceTimerRef.current) {
      clearTimeout(emailDebounceTimerRef.current)
    }

    if (!clean) {
      setEmailError(null)
      setEmailValidating(false)
      return
    }

    // 1. Validação síncrona preliminar (formato e descarte)
    const basic = validateEmailBasic(clean)
    if (!clean.includes('@') || !clean.includes('.')) {
      // Usuário ainda está digitando o domínio
      setEmailError(null)
      setEmailValidating(false)
      return
    }

    if (!basic.isFormatValid) {
      setEmailError(basic.message || 'Formato de e-mail inválido')
      setEmailValidating(false)
      return
    }

    if (basic.isDisposable) {
      setEmailError(
        basic.message ||
          'Este e-mail parece ser temporário/descartável. Use um e-mail permanente (ex.: Gmail, Outlook).',
      )
      setEmailValidating(false)
      return
    }

    // Passou formato e não é descartável conhecido: agendar checagem DNS online via Edge Function
    setEmailError(null)
    setEmailValidating(true)

    const currentCallId = ++emailCallIdRef.current
    emailDebounceTimerRef.current = setTimeout(async () => {
      try {
        const fullResult = await validateEmailDomainOnline(clean)
        if (currentCallId !== emailCallIdRef.current) return

        if (!fullResult.valid) {
          setEmailError(
            fullResult.message || 'Domínio de e-mail inválido ou sem recebimento de mensagens.',
          )
          setEmailValidSuccess(false)
        } else {
          setEmailError(null)
          setEmailValidSuccess(true)
        }
      } catch (err) {
        if (currentCallId !== emailCallIdRef.current) return
        setEmailError(null)
      } finally {
        if (currentCallId === emailCallIdRef.current) {
          setEmailValidating(false)
        }
      }
    }, 600)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError(null)
    setCelularError(null)
    setTelefoneFixoError(null)
    setSenhaError(null)

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

    if (!cleanEmail) {
      setEmailError('E-mail obrigatório')
      toast({
        title: 'E-mail obrigatório',
        description: 'O endereço de e-mail é obrigatório.',
        variant: 'destructive',
      })
      return
    }

    // 1. Validação de formato e bloqueio de descartáveis (obrigatório para novos e edits)
    const basicValidation = validateEmailBasic(cleanEmail)
    if (!basicValidation.isFormatValid) {
      const msg = basicValidation.message || 'Formato de e-mail inválido'
      setEmailError(msg)
      toast({
        title: 'E-mail inválido',
        description: msg,
        variant: 'destructive',
      })
      return
    }

    if (basicValidation.isDisposable) {
      const msg =
        basicValidation.message ||
        'Este e-mail parece ser temporário/descartável. Use um e-mail permanente (ex.: Gmail, Outlook).'
      setEmailError(msg)
      toast({
        title: 'E-mail temporário não permitido',
        description: msg,
        variant: 'destructive',
      })
      return
    }

    // 2. Validação online de domínio DNS/MX caso não seja modo de edição com e-mail idêntico
    try {
      const domainResult = await validateEmailDomainOnline(cleanEmail)
      if (!domainResult.valid) {
        const msg =
          domainResult.message || 'O domínio deste e-mail é inválido ou não pode receber mensagens.'
        setEmailError(msg)
        toast({
          title: 'Domínio de e-mail inválido',
          description: msg,
          variant: 'destructive',
        })
        return
      }
    } catch (dnsErr) {
      console.warn('Aviso ao checar domínio no submit:', dnsErr)
    }

    // 3. Validação de existência/duplicidade de e-mail (login)
    try {
      const emailExists = await LeitoresService.checkEmailExists(
        cleanEmail,
        readerToEdit ? readerToEdit.id_leitor : undefined,
      )
      if (emailExists) {
        setEmailError('E-mail já cadastrado')
        toast({
          title: 'E-mail já cadastrado',
          description: `O e-mail "${cleanEmail}" já está em uso no sistema. Cada leitor deve possuir um e-mail exclusivo como login de acesso.`,
          variant: 'destructive',
        })
        return
      }
    } catch (checkEmailErr) {
      console.warn('Erro ao verificar email:', checkEmailErr)
    }

    // 2. Validação do Celular/WhatsApp (se preenchido, deve ter 2 dígitos DDD e 9 dígitos celular: 11 dígitos)
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

    // 3. Validação do Telefone Fixo (se preenchido, deve ter 2 dígitos DDD e 8 dígitos fixo: 10 dígitos)
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

    // 4. Validação de Senha de Primeiro Acesso (apenas para novo cadastro)
    if (!readerToEdit) {
      const cleanPass = firstAccessPassword.trim()
      if (!cleanPass) {
        setSenhaError('Defina a senha para o primeiro acesso')
        toast({
          title: 'Senha de acesso obrigatória',
          description:
            'Ao cadastrar um novo leitor, defina a senha para o primeiro acesso ao sistema (mínimo 6 caracteres).',
          variant: 'destructive',
        })
        return
      }
      if (cleanPass.length < 6) {
        setSenhaError('A senha deve ter no mínimo 6 caracteres')
        toast({
          title: 'Senha muito curta',
          description: 'A senha de acesso do leitor deve conter no mínimo 6 caracteres.',
          variant: 'destructive',
        })
        return
      }
      if (confirmPassword && cleanPass !== confirmPassword.trim()) {
        setSenhaError('A confirmação de senha não confere')
        toast({
          title: 'Senhas não coincidem',
          description: 'A senha de primeiro acesso e sua confirmação devem ser iguais.',
          variant: 'destructive',
        })
        return
      }
    }

    setLoading(true)
    try {
      let finalFotoUrl = formData.foto || null
      let fileToUpload = photoFile

      // Fallback: se houver photoPreview (ex: dataURL ou blob colado) e não tiver photoFile, converter
      if (
        !fileToUpload &&
        photoPreview &&
        (photoPreview.startsWith('data:image/') || photoPreview.startsWith('blob:')) &&
        photoPreview !== formData.foto
      ) {
        try {
          fileToUpload = await urlToFile(photoPreview, `leitor-${Date.now()}.png`)
        } catch (convErr) {
          console.warn('[ReaderModal] Erro ao converter preview para arquivo:', convErr)
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
          console.error('[ReaderModal] Erro ao enviar foto do leitor:', uploadErr)
          throw new Error(`Falha no upload da foto: ${uploadErr.message || 'Erro desconhecido'}`)
        }
      } else if (!photoPreview) {
        finalFotoUrl = null
      }

      // Descobrir nome do curso primário
      const primaryCursoObj = allCursos.find((c) => selectedCursoIds.includes(c.id))
      const primaryCursoNome = primaryCursoObj ? primaryCursoObj.nome : null

      const formattedCelular = cleanCelularDigits ? formatMobilePhone(cleanCelularDigits) : null
      const formattedFixo = cleanFixoDigits ? formatLandlinePhone(cleanFixoDigits) : null

      if (readerToEdit) {
        // --- ATUALIZAÇÃO DO LEITOR ---
        const updatePayload: any = {
          nome_do_leitor: cleanNome,
          telefone: formattedCelular,
          telefone_fixo: formattedFixo,
          foto: finalFotoUrl,
          curso: primaryCursoNome,
          cursos_ids: selectedCursoIds,
        }

        // Apenas operador/admin pode alterar status de bloqueio e acesso à diretoria
        if (isOperadorOrAdmin && !isSelfEdit) {
          updatePayload.bloqueado = formData.bloqueado
          updatePayload.acesso_diretoria = formData.acesso_diretoria
        }

        await LeitoresService.update(readerToEdit.id_leitor, updatePayload)

        // Salvar múltiplos cursos vinculados também explicitamente
        await CursosService.setCursosForLeitor(readerToEdit.id_leitor, selectedCursoIds)

        // Se o operador marcou o checkbox para enviar e-mail de reset de senha
        let resetEmailSent = false
        let isRateLimitReset = false
        let resetErrorMessage: string | null = null

        if (sendPasswordReset && isOperadorOrAdmin) {
          const resetRes = await LeitoresService.sendPasswordResetEmail(cleanEmail, {
            nome: cleanNome,
            tipo: 'primeiro_acesso',
          })
          if (resetRes.success) {
            resetEmailSent = true
          } else {
            isRateLimitReset = !!resetRes.isRateLimit
            resetErrorMessage = resetRes.error || null
            console.warn('Aviso no resetPasswordForEmail:', resetRes.error)
            toast({
              title: isRateLimitReset ? 'Limite de envio recente' : 'Aviso sobre o e-mail de reset',
              description: isRateLimitReset
                ? 'Dados salvos com sucesso! Porém, um e-mail já foi enviado recentemente para este leitor. Aguarde alguns minutos antes de reenviar.'
                : `Dados salvos, mas o envio do link de reset falhou: ${resetRes.error || 'Verifique o serviço de e-mail.'}`,
              variant: isRateLimitReset ? 'default' : 'destructive',
            })
          }
        }

        await refreshProfile()

        toast({
          title: 'Dados atualizados!',
          description: resetEmailSent
            ? `Dados do leitor salvos e link de redefinição de senha enviado para ${cleanEmail}.`
            : isRateLimitReset
              ? 'Dados do leitor atualizados. Para novo e-mail de acesso, aguarde alguns minutos.'
              : 'Dados do leitor atualizados com sucesso!',
        })
      } else {
        // --- NOVO CADASTRO DE LEITOR ---
        // 1. Criar usuário no Supabase Auth com a senha de primeiro acesso definida
        let createdAuthUserId: string | null = null
        const cleanPassword = firstAccessPassword.trim()

        try {
          // Tentativa A: Edge Function admin_create_user
          const { data: edgeData, error: edgeErr } = await supabase.functions.invoke(
            'admin_create_user',
            {
              body: {
                email: cleanEmail,
                password: cleanPassword,
                nome: cleanNome,
                papel: 'leitor',
                avatar_url: finalFotoUrl,
              },
            },
          )

          if (!edgeErr && edgeData && edgeData.success) {
            createdAuthUserId = edgeData.user?.id || null
          } else {
            // Tentativa B: RPC admin_create_user
            const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)(
              'admin_create_user',
              {
                new_email: cleanEmail,
                new_password: cleanPassword,
                new_nome: cleanNome,
                new_papel: 'leitor',
                new_avatar_url: finalFotoUrl,
              },
            )

            if (!rpcErr && rpcData && rpcData.success) {
              createdAuthUserId = rpcData.user_id || null
            } else {
              // Tentativa C: Fallback para supabase.auth.signUp
              const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
                email: cleanEmail,
                password: cleanPassword,
                options: {
                  data: {
                    nome: cleanNome,
                    full_name: cleanNome,
                    papel: 'leitor',
                    role: 'leitor',
                    app_role: 'leitor',
                    avatar_url: finalFotoUrl || undefined,
                  },
                },
              })

              if (signUpErr) {
                console.warn('Aviso no fallback de signUp:', signUpErr.message)
                const isDup =
                  signUpErr.message?.toLowerCase().includes('already registered') ||
                  signUpErr.message?.toLowerCase().includes('already exists')
                if (isDup) {
                  throw new Error(
                    `O e-mail "${cleanEmail}" já está cadastrado no sistema. Verifique a lista de usuários ou utilize outro e-mail.`,
                  )
                }
                throw signUpErr
              } else if (signUpData?.user) {
                createdAuthUserId = signUpData.user.id
                try {
                  await (supabase.rpc as any)('confirm_user_email', {
                    user_id: createdAuthUserId,
                  })
                } catch {
                  /* ignore */
                }
              }
            }
          }
        } catch (authCreateEx) {
          console.warn('Exceção ao criar credencial de autenticação:', authCreateEx)
        }

        // 2. Criar registro na tabela public.leitor (sem CPF)
        const insertPayload: any = {
          id_auth: createdAuthUserId,
          nome_do_leitor: cleanNome,
          email: cleanEmail,
          telefone: formattedCelular,
          telefone_fixo: formattedFixo,
          foto: finalFotoUrl,
          bloqueado: isOperadorOrAdmin ? formData.bloqueado : false,
          acesso_diretoria: isOperadorOrAdmin ? formData.acesso_diretoria : false,
          curso: primaryCursoNome,
          cursos_ids: selectedCursoIds,
          data_cadastro: new Date().toISOString().split('T')[0],
        }

        const createdLeitor = await LeitoresService.create(insertPayload)

        // 3. Vincular cursos selecionados explicitamente também
        if (createdLeitor && createdLeitor.id_leitor && selectedCursoIds.length > 0) {
          await CursosService.setCursosForLeitor(createdLeitor.id_leitor, selectedCursoIds)
        }

        toast({
          title: 'Leitor cadastrado com sucesso!',
          description: `O leitor ${cleanNome} foi registrado. A senha de primeiro acesso foi configurada para o e-mail ${cleanEmail}.`,
        })
      }

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar leitor',
        description: err.message || 'Verifique se as informações preenchidas estão corretas.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-4xl md:max-w-5xl lg:max-w-6xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 md:p-7">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader className="pb-2 border-b border-slate-100">
            <DialogTitle className="flex items-center gap-2 text-slate-900 text-lg sm:text-xl">
              <UserPlus className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>
                {readerToEdit
                  ? isSelfEdit
                    ? 'Gestão de Leitores — Meus Dados'
                    : 'Gestão de Leitores — Editar Leitor'
                  : 'Gestão de Leitores — Cadastrar Leitor'}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-slate-500">
              {readerToEdit
                ? isSelfEdit
                  ? 'Altere suas informações de nome, celular, telefone fixo e foto. O e-mail de login não pode ser alterado.'
                  : 'Atualize as informações de contato, cursos frequentados, permissões e redefinição de senha.'
                : 'Cadastre um novo leitor com suas formas de contato e defina a senha para o primeiro acesso.'}
            </DialogDescription>
          </DialogHeader>

          {/* Grid Principal com 2 Colunas em telas médias/largas:
              Coluna 1: Identificação, Foto e Contatos
              Coluna 2: Cursos, Permissões e Acessos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* COLUNA ESQUERDA: Dados Cadastrais e Contatos */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  1. Identificação e Contatos
                </span>
              </div>

              {/* Foto do Leitor */}
              <div
                onPaste={handlePaste}
                tabIndex={0}
                className="flex flex-col sm:flex-row items-center gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all cursor-default"
                title="Clique aqui e pressione Ctrl+V / Cmd+V para colar uma imagem da área de transferência"
              >
                <Avatar className="w-16 h-16 border-2 border-emerald-500 shadow-sm shrink-0">
                  {photoPreview ? (
                    <AvatarImage
                      src={photoPreview}
                      alt="Preview da foto"
                      className="object-cover"
                    />
                  ) : (
                    <AvatarFallback className="bg-emerald-100 text-emerald-800 text-base font-bold">
                      <Camera className="w-6 h-6 text-emerald-600" />
                    </AvatarFallback>
                  )}
                </Avatar>

                <div className="space-y-1.5 flex-1 min-w-0 text-center sm:text-left">
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
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
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

              {/* Nome Completo */}
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
                  className="mt-1 text-xs"
                />
              </div>

              {/* E-mail / Login */}
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                    {readerToEdit
                      ? 'E-mail (Login de Entrada — Não Editável)'
                      : 'E-mail (Login de Acesso) *'}
                  </Label>
                  {readerToEdit ? (
                    <span className="text-[11px] font-medium text-amber-700 flex items-center gap-1">
                      <Info className="w-3 h-3" /> Login Bloqueado
                    </span>
                  ) : emailValidating ? (
                    <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                      Validando domínio...
                    </span>
                  ) : emailValidSuccess && !emailError ? (
                    <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Domínio de e-mail válido
                    </span>
                  ) : null}
                </div>
                <div className="relative mt-1">
                  <Input
                    id="email"
                    type="email"
                    required={!readerToEdit}
                    readOnly={!!readerToEdit}
                    disabled={!!readerToEdit}
                    placeholder="Ex: maria.santos@exemplo.com"
                    value={formData.email}
                    onChange={(e) => {
                      const val = e.target.value
                      setFormData({ ...formData, email: val })
                      if (!readerToEdit) {
                        triggerEmailValidation(val)
                      }
                    }}
                    onBlur={() => {
                      if (!readerToEdit && formData.email) {
                        triggerEmailValidation(formData.email)
                      }
                    }}
                    className={`text-xs ${
                      readerToEdit
                        ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 select-none'
                        : emailError
                          ? 'border-rose-500 focus-visible:ring-rose-500 pr-8'
                          : emailValidSuccess
                            ? 'border-emerald-500 focus-visible:ring-emerald-500 pr-8'
                            : ''
                    }`}
                  />
                  {!readerToEdit && (
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      {emailValidating ? (
                        <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                      ) : emailError ? (
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                      ) : emailValidSuccess ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : null}
                    </div>
                  )}
                </div>
                {readerToEdit ? (
                  <div className="mt-1.5 flex items-start gap-1.5 p-2 rounded bg-amber-50/80 border border-amber-200/60 text-[11px] text-amber-900 leading-snug">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      O e-mail é o <strong>login de entrada</strong> do leitor. Para alterá-lo,
                      exclua e recadastre o leitor com o novo e-mail.
                    </span>
                  </div>
                ) : emailError ? (
                  <div className="mt-1.5 flex items-start gap-1.5 p-2 rounded bg-rose-50 border border-rose-200 text-[11px] text-rose-800 leading-snug">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                    <span>{emailError}</span>
                  </div>
                ) : emailValidSuccess ? (
                  <p className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    E-mail permanente com domínio e recebimento verificados.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Este e-mail será o identificador de login exclusivo do leitor na biblioteca.
                  </p>
                )}
              </div>

              {/* Telefones: Celular/WhatsApp e Telefone Fixo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Celular/WhatsApp */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="celular"
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
                    id="celular"
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
                      htmlFor="telefone_fixo"
                      className="text-xs font-semibold text-slate-700 flex items-center gap-1"
                    >
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      Telefone Fixo
                    </Label>
                    {telefoneFixoError && (
                      <span className="text-[10px] font-medium text-rose-600">
                        {telefoneFixoError}
                      </span>
                    )}
                  </div>
                  <Input
                    id="telefone_fixo"
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

              {/* SE FOR NOVO CADASTRO: Senha de Primeiro Acesso */}
              {!readerToEdit && (
                <div className="space-y-3 p-3 bg-emerald-50/60 rounded-lg border border-emerald-200">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center">
                      <KeyRound className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-emerald-950">
                        Senha de Acesso (Primeiro Acesso) *
                      </Label>
                      <p className="text-[11px] text-emerald-800">
                        Defina a senha que o leitor utilizará para acessar o sistema no primeiro
                        acesso.
                      </p>
                    </div>
                  </div>

                  {senhaError && (
                    <p className="text-[11px] font-medium text-rose-600 bg-rose-50 p-2 rounded border border-rose-200">
                      {senhaError}
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div className="space-y-1">
                      <Label
                        htmlFor="first_password"
                        className="text-[11px] font-semibold text-slate-700"
                      >
                        Senha Provisória * (mínimo 6 dígitos)
                      </Label>
                      <div className="relative">
                        <Input
                          id="first_password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          minLength={6}
                          required
                          value={firstAccessPassword}
                          onChange={(e) => {
                            setFirstAccessPassword(e.target.value)
                            if (senhaError) setSenhaError(null)
                          }}
                          className="text-xs pr-8 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label
                        htmlFor="confirm_first_password"
                        className="text-[11px] font-semibold text-slate-700"
                      >
                        Confirmar Senha *
                      </Label>
                      <Input
                        id="confirm_first_password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        minLength={6}
                        required
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value)
                          if (senhaError) setSenhaError(null)
                        }}
                        className="text-xs bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* COLUNA DIREITA: Cursos Frequentados e Permissões */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  2. Cursos e Permissões
                </span>
              </div>

              {/* Campo de Curso(s) que está frequentando na CEP */}
              <div className="space-y-2.5 p-3.5 bg-slate-50/80 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-emerald-600" />
                    Curso(s) que está frequentando na CEP
                  </Label>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {selectedCursoIds.length === 0
                      ? 'Nenhum curso vinculado'
                      : `${selectedCursoIds.length} curso(s)`}
                  </span>
                </div>

                {/* Badges dos cursos selecionados */}
                <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-white rounded-md border border-slate-200/80 items-center">
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
                    <SelectTrigger className="text-xs h-8 bg-white flex-1 min-w-0">
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

              {/* SE FOR EDIÇÃO POR OPERADOR: Checkbox de Reset de Senha */}
              {readerToEdit && isOperadorOrAdmin && !isSelfEdit && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="reset-password-check"
                      checked={sendPasswordReset}
                      onCheckedChange={(checked) => setSendPasswordReset(!!checked)}
                      className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                    />
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="reset-password-check"
                        className="text-xs font-semibold text-slate-900 cursor-pointer flex items-center gap-1.5"
                      >
                        <MailCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Enviar e-mail para redefinição de senha do leitor
                      </Label>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Ao marcar esta opção e salvar, será enviado automaticamente um link seguro
                        para o e-mail cadastrado (<strong>{readerToEdit.email}</strong>) para que o
                        leitor defina uma nova senha.
                      </p>
                    </div>
                  </div>
                </div>
              )}

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

              {/* Bloqueio de Empréstimos */}
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
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, bloqueado: checked })
                      }
                      className="data-[state=checked]:bg-rose-600 data-[state=unchecked]:bg-slate-700"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between pt-3 border-t border-slate-100">
            {readerToEdit && onViewHistory ? (
              <Button
                type="button"
                variant="outline"
                onClick={onViewHistory}
                className="gap-1.5 text-xs text-slate-700 border-slate-300 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 mr-auto"
              >
                <History className="w-3.5 h-3.5 text-emerald-600" />
                <span>Ver Histórico de Empréstimos</span>
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
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
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
