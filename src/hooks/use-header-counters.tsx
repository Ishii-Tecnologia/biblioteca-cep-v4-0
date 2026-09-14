import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { EmprestimosService } from '@/services/emprestimos'
import { ReservasService } from '@/services/reservas'

interface HeaderCountersContextType {
  emprestimosAtivos: number
  reservasAtivas: number
  hasQueueChangeAlert: boolean
  hasReadyForPickupAlert: boolean
  clearQueueChangeAlert: () => void
  loading: boolean
  refreshCounters: () => Promise<void>
}

const HeaderCountersContext = createContext<HeaderCountersContextType>({
  emprestimosAtivos: 0,
  reservasAtivas: 0,
  hasQueueChangeAlert: false,
  hasReadyForPickupAlert: false,
  clearQueueChangeAlert: () => {},
  loading: false,
  refreshCounters: async () => {},
})

const QUEUE_SNAPSHOT_KEY = 'cep_library_queue_snapshot'
const QUEUE_ALERT_DISMISSED_KEY = 'cep_library_queue_alert_dismissed'

export function HeaderCountersProvider({ children }: { children: React.ReactNode }) {
  const [emprestimosAtivos, setEmprestimosAtivos] = useState(0)
  const [reservasAtivas, setReservasAtivas] = useState(0)
  const [hasQueueChangeAlert, setHasQueueChangeAlert] = useState(false)
  const [hasReadyForPickupAlert, setHasReadyForPickupAlert] = useState(false)
  const [loading, setLoading] = useState(false)

  const clearQueueChangeAlert = useCallback(() => {
    setHasQueueChangeAlert(false)
    setHasReadyForPickupAlert(false)
    try {
      localStorage.setItem(QUEUE_ALERT_DISMISSED_KEY, Date.now().toString())
    } catch {
      /* intentionally ignored */
    }
  }, [])

  const refreshCounters = useCallback(async () => {
    try {
      const [loansCount, reservesCount, allReservas] = await Promise.all([
        EmprestimosService.countActive(),
        ReservasService.countActive(),
        ReservasService.getAll('all').catch(() => []),
      ])
      setEmprestimosAtivos(loansCount)
      setReservasAtivas(reservesCount)

      // Verificar reservas prontas para retirada
      const readyForPickup = allReservas.filter((r) => r.status_reserva === 'Pronta para Retirada')
      if (readyForPickup.length > 0) {
        setHasReadyForPickupAlert(true)
      }

      // Verificar mudanças na posição da fila comparando com snapshot salvo no storage local
      try {
        const activeItems = allReservas.filter(
          (r) => r.status_reserva === 'Ativa' || r.status_reserva === 'Pronta para Retirada',
        )
        const currentSnapshot: Record<number, { pos: number; status: string }> = {}
        activeItems.forEach((item) => {
          currentSnapshot[item.id_reserva] = {
            pos: item.posicao_fila || 1,
            status: item.status_reserva,
          }
        })

        const savedRaw = localStorage.getItem(QUEUE_SNAPSHOT_KEY)
        if (savedRaw) {
          const prevSnapshot = JSON.parse(savedRaw) as Record<
            number,
            { pos: number; status: string }
          >
          let changed = false
          for (const [idStr, curr] of Object.entries(currentSnapshot)) {
            const id = Number(idStr)
            const prev = prevSnapshot[id]
            if (prev && (prev.pos !== curr.pos || prev.status !== curr.status)) {
              changed = true
              break
            }
          }
          if (changed) {
            setHasQueueChangeAlert(true)
          }
        }
        localStorage.setItem(QUEUE_SNAPSHOT_KEY, JSON.stringify(currentSnapshot))
      } catch (storageErr) {
        console.debug('Storage snapshot tracking error:', storageErr)
      }
    } catch (err) {
      console.warn('Erro ao atualizar contadores do cabeçalho:', err)
    }
  }, [])

  useEffect(() => {
    refreshCounters()
    // Atualização periódica leve a cada 30 segundos
    const interval = setInterval(refreshCounters, 30000)
    return () => clearInterval(interval)
  }, [refreshCounters])

  return (
    <HeaderCountersContext.Provider
      value={{
        emprestimosAtivos,
        reservasAtivas,
        hasQueueChangeAlert,
        hasReadyForPickupAlert,
        clearQueueChangeAlert,
        loading,
        refreshCounters,
      }}
    >
      {children}
    </HeaderCountersContext.Provider>
  )
}

export function useHeaderCounters() {
  return useContext(HeaderCountersContext)
}
