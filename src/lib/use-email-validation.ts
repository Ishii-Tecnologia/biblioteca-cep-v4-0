import { useState, useEffect, useRef, useCallback } from 'react'
import {
  validateEmailBasic,
  validateEmailDomainOnline,
  EmailDomainValidationResult,
  extractEmailDomain,
} from './email-validation'

export interface UseEmailValidationOptions {
  debounceMs?: number
  enabled?: boolean
  initialEmail?: string
}

export interface UseEmailValidationReturn {
  email: string
  setEmail: (email: string) => void
  validation: EmailDomainValidationResult
  isValidating: boolean
  domain: string
  errorMessage: string | null
  isValid: boolean
  isInvalid: boolean
  isSuccess: boolean
  validateImmediately: (emailToValidate?: string) => Promise<EmailDomainValidationResult>
  reset: () => void
}

export function useEmailValidation(
  options: UseEmailValidationOptions = {},
): UseEmailValidationReturn {
  const { debounceMs = 600, enabled = true, initialEmail = '' } = options

  const [email, setEmailState] = useState<string>(initialEmail)
  const [validation, setValidation] = useState<EmailDomainValidationResult>(() =>
    initialEmail
      ? validateEmailBasic(initialEmail)
      : {
          valid: false,
          isFormatValid: false,
          isDisposable: false,
          isDomainValid: false,
          status: 'idle',
        },
  )
  const [isValidating, setIsValidating] = useState<boolean>(false)

  const timerRef = useRef<any>(null)
  const latestValidationCallId = useRef<number>(0)

  const runValidation = useCallback(
    async (emailToTest: string): Promise<EmailDomainValidationResult> => {
      const clean = emailToTest.trim().toLowerCase()
      if (!clean) {
        const idleResult: EmailDomainValidationResult = {
          valid: false,
          isFormatValid: false,
          isDisposable: false,
          isDomainValid: false,
          status: 'idle',
        }
        setValidation(idleResult)
        setIsValidating(false)
        return idleResult
      }

      // 1. Checagem imediata rápida (formato + lista estática de descartáveis)
      const basic = validateEmailBasic(clean)
      if (!basic.isFormatValid || basic.isDisposable) {
        setValidation(basic)
        setIsValidating(false)
        return basic
      }

      // 2. Se formato for válido e não for descartável conhecido, checar DNS/MX via Edge Function
      const callId = ++latestValidationCallId.current
      setIsValidating(true)

      try {
        const fullResult = await validateEmailDomainOnline(clean)
        // Somente aplicar se essa ainda for a chamada mais recente
        if (callId === latestValidationCallId.current) {
          setValidation(fullResult)
          setIsValidating(false)
        }
        return fullResult
      } catch (err) {
        if (callId === latestValidationCallId.current) {
          setValidation(basic)
          setIsValidating(false)
        }
        return basic
      }
    },
    [],
  )

  useEffect(() => {
    if (!enabled) return

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    const clean = email.trim()
    if (!clean) {
      setValidation({
        valid: false,
        isFormatValid: false,
        isDisposable: false,
        isDomainValid: false,
        status: 'idle',
      })
      setIsValidating(false)
      return
    }

    // Se ainda está digitando e não tem '@' ou '.', apenas limpa erros anteriores ou mostra pendente
    if (!clean.includes('@') || !clean.includes('.')) {
      setValidation({
        valid: false,
        isFormatValid: false,
        isDisposable: false,
        isDomainValid: false,
        status: 'pending',
      })
      setIsValidating(false)
      return
    }

    // Debounce antes de disparar a checagem online de DNS
    timerRef.current = setTimeout(() => {
      runValidation(clean)
    }, debounceMs)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [email, debounceMs, enabled, runValidation])

  const setEmail = useCallback((newEmail: string) => {
    setEmailState(newEmail)
  }, [])

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setEmailState('')
    setValidation({
      valid: false,
      isFormatValid: false,
      isDisposable: false,
      isDomainValid: false,
      status: 'idle',
    })
    setIsValidating(false)
  }, [])

  const validateImmediately = useCallback(
    async (emailToValidate?: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      const target = emailToValidate !== undefined ? emailToValidate : email
      return runValidation(target)
    },
    [email, runValidation],
  )

  const domain = validation.domain || extractEmailDomain(email)
  const errorMessage = validation.message || null
  const isValid = validation.valid
  const isInvalid =
    !validation.valid && validation.status !== 'idle' && validation.status !== 'pending'
  const isSuccess = validation.valid && !isValidating && Boolean(email.trim())

  return {
    email,
    setEmail,
    validation,
    isValidating,
    domain,
    errorMessage,
    isValid,
    isInvalid,
    isSuccess,
    validateImmediately,
    reset,
  }
}
