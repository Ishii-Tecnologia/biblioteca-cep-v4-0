/* General utility functions (exposes cn) */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges multiple class names into a single string
 * @param inputs - Array of class names
 * @returns Merged class names
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a CPF string into Brazilian format:
 * - Up to 11 digits: XXX.XXX.XXX-XX
 */
export function formatCPF(value: string): string {
  if (!value) return ''

  // Keep only digits and limit to 11 characters
  const digits = value.replace(/\D/g, '').slice(0, 11)

  if (digits.length <= 3) {
    return digits
  }
  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}.${digits.slice(3)}`
  }
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
}

/**
 * Valida os dígitos verificadores do CPF utilizando o algoritmo oficial da Receita Federal.
 * Retorna true se válido, false se inválido.
 */
export function validateCPF(cpf: string): boolean {
  if (!cpf) return false
  const cleanCPF = cpf.replace(/\D/g, '')

  if (cleanCPF.length !== 11) return false

  // Rejeita sequências com todos os dígitos iguais (ex: 111.111.111-11)
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false

  // 1º Dígito verificador
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF.charAt(i), 10) * (10 - i)
  }
  let remainder = sum % 11
  let firstCheckDigit = remainder < 2 ? 0 : 11 - remainder

  if (firstCheckDigit !== parseInt(cleanCPF.charAt(9), 10)) {
    return false
  }

  // 2º Dígito verificador
  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF.charAt(i), 10) * (11 - i)
  }
  remainder = sum % 11
  let secondCheckDigit = remainder < 2 ? 0 : 11 - remainder

  if (secondCheckDigit !== parseInt(cleanCPF.charAt(10), 10)) {
    return false
  }

  return true
}

/**
 * Formata celular brasileiro:
 * - 2 dígitos DDD + até 9 dígitos: (XX) XXXXX-XXXX (máximo 11 dígitos)
 */
export function formatMobilePhone(value: string): string {
  if (!value) return ''
  const digits = value.replace(/\D/g, '').slice(0, 11)

  if (digits.length <= 2) {
    return digits.length > 0 ? `(${digits}` : ''
  }
  if (digits.length <= 7) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

/**
 * Valida celular brasileiro: exatamente 2 dígitos DDD + 9 dígitos celular (11 dígitos no total).
 * Primeiro dígito do celular no Brasil após o DDD costuma ser 9.
 */
export function validateMobilePhone(value: string): boolean {
  if (!value) return false
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11) return false
  const ddd = parseInt(digits.slice(0, 2), 10)
  if (ddd < 11 || ddd > 99) return false
  // Celular no Brasil começa com 9
  if (digits.charAt(2) !== '9') return false
  return true
}

/**
 * Formata telefone fixo brasileiro:
 * - 2 dígitos DDD + até 8 dígitos: (XX) XXXX-XXXX (máximo 10 dígitos)
 */
export function formatLandlinePhone(value: string): string {
  if (!value) return ''
  const digits = value.replace(/\D/g, '').slice(0, 10)

  if (digits.length <= 2) {
    return digits.length > 0 ? `(${digits}` : ''
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 10)}`
}

/**
 * Valida telefone fixo brasileiro: exatamente 2 dígitos DDD + 8 dígitos (10 dígitos no total).
 * Telefones fixos no Brasil costumam começar com 2, 3, 4 ou 5.
 */
export function validateLandlinePhone(value: string): boolean {
  if (!value) return false
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 10) return false
  const ddd = parseInt(digits.slice(0, 2), 10)
  if (ddd < 11 || ddd > 99) return false
  // Fixo não começa com 0 ou 1, nem com 9
  const firstDigit = digits.charAt(2)
  if (firstDigit === '0' || firstDigit === '1' || firstDigit === '9') return false
  return true
}

/**
 * Formats a phone string into Brazilian phone format:
 * - Up to 10 digits: (XX) XXXX-XXXX
 * - 11 digits: (XX) XXXXX-XXXX
 */
export function formatPhone(value: string): string {
  if (!value) return ''

  // Keep only digits and limit to 11 characters
  const digits = value.replace(/\D/g, '').slice(0, 11)

  if (digits.length <= 2) {
    return digits.length > 0 ? `(${digits}` : ''
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

/**
 * Utilitário de formatação de data
 * Formata uma data para o padrão brasileiro curto dd/mm/yy (ano com 2 dígitos: ex. 24/02/25).
 * Suporta strings ISO (com ou sem timestamp/timezone), strings no formato YYYY-MM-DD,
 * objetos Date e números timestamp. Trata timezone corretamente para evitar
 * deslocamentos indesejados de data por UTC.
 */
export function formatDate(dateInput?: string | Date | number | null): string {
  if (!dateInput) return '-'
  try {
    if (typeof dateInput === 'string') {
      const trimmed = dateInput.trim()
      // Se for formato simples YYYY-MM-DD (sem timezone ou horário)
      const pureDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
      if (pureDateMatch) {
        const [, year, month, day] = pureDateMatch
        const shortYear = year.slice(-2)
        return `${day}/${month}/${shortYear}`
      }
    }

    const d =
      typeof dateInput === 'string' || typeof dateInput === 'number'
        ? new Date(dateInput)
        : dateInput

    if (!(d instanceof Date) || isNaN(d.getTime())) return String(dateInput)

    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const shortYear = String(d.getFullYear()).slice(-2)
    return `${day}/${month}/${shortYear}`
  } catch {
    return String(dateInput)
  }
}

/**
 * Formata uma data para o formato completo brasileiro dd/mm/yyyy (ex: 24/02/2025).
 * Suporta strings ISO, YYYY-MM-DD, objetos Date e timestamps.
 */
export function formatDateBR(dateInput?: string | Date | number | null): string {
  if (!dateInput) return ''
  try {
    if (typeof dateInput === 'string') {
      const trimmed = dateInput.trim()
      const pureDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
      if (pureDateMatch) {
        const [, year, month, day] = pureDateMatch
        return `${day}/${month}/${year}`
      }
    }

    const d =
      typeof dateInput === 'string' || typeof dateInput === 'number'
        ? new Date(dateInput)
        : dateInput

    if (!(d instanceof Date) || isNaN(d.getTime())) return ''

    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = String(d.getFullYear())
    return `${day}/${month}/${year}`
  } catch {
    return ''
  }
}

/**
 * Converte data no formato dd/mm/yyyy para o formato ISO yyyy-mm-dd.
 * Retorna string vazia se formato for inválido.
 */
export function parseDateBRToISO(brDate: string): string {
  if (!brDate) return ''
  const trimmed = brDate.trim()
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed)
  if (!match) return ''
  const [, day, month, year] = match
  const d = parseInt(day, 10)
  const m = parseInt(month, 10)
  const y = parseInt(year, 10)
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return ''
  return `${year}-${month}-${day}`
}

/**
 * Formata máscara de digitação de data no padrão dd/mm/yyyy conforme o usuário digita.
 */
export function formatBRDateInput(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/**
 * Formata data e hora para o padrão dd/mm/yy às HH:mm.
 * Trata fuso horário e strings ISO sem offset.
 */
/**
 * Adiciona N dias úteis (segunda a sexta-feira) a uma data de referência.
 */
export function addBusinessDays(startDate: Date, businessDays: number): Date {
  const result = new Date(startDate)
  let added = 0
  while (added < businessDays) {
    result.setDate(result.getDate() + 1)
    const dayOfWeek = result.getDay()
    // 0 = Domingo, 6 = Sábado
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++
    }
  }
  return result
}

/**
 * Calcula a quantidade de dias úteis (segunda a sexta) entre duas datas.
 */
export function countBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0
  const cur = new Date(startDate)
  while (cur < endDate) {
    cur.setDate(cur.getDate() + 1)
    const dayOfWeek = cur.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++
    }
  }
  return count
}

export function formatDateTime(dateInput?: string | Date | number | null): string {
  if (!dateInput) return '-'
  try {
    const d =
      typeof dateInput === 'string' || typeof dateInput === 'number'
        ? new Date(dateInput)
        : dateInput

    if (!(d instanceof Date) || isNaN(d.getTime())) return String(dateInput)

    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const shortYear = String(d.getFullYear()).slice(-2)
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${day}/${month}/${shortYear} às ${hours}:${minutes}`
  } catch {
    return String(dateInput)
  }
}
