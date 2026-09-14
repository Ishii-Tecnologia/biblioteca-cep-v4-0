import React from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AlertTriangle, Info, Trash2, CheckCircle2, RotateCw } from 'lucide-react'

export type ConfirmVariant = 'destructive' | 'default' | 'warning' | 'primary'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string | React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
  onConfirm: () => void | Promise<void>
  loading?: boolean
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  onConfirm,
  loading = false,
}: ConfirmDialogProps) {
  const getIcon = () => {
    switch (variant) {
      case 'destructive':
        return (
          <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
        )
      case 'warning':
        return (
          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
        )
      case 'primary':
        return (
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        )
      default:
        return (
          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <Info className="w-5 h-5" />
          </div>
        )
    }
  }

  const getActionButtonClass = () => {
    switch (variant) {
      case 'destructive':
        return 'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500'
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-500'
      case 'primary':
        return 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500'
      default:
        return 'bg-slate-900 hover:bg-slate-800 text-white'
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[460px]">
        <AlertDialogHeader className="flex flex-row items-start gap-3 space-y-0 text-left">
          {getIcon()}
          <div className="space-y-1 flex-1">
            <AlertDialogTitle className="text-base font-bold text-slate-900 leading-tight">
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-600 leading-relaxed">
              {description}
            </AlertDialogDescription>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4 gap-2">
          <AlertDialogCancel disabled={loading} className="text-xs">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            disabled={loading}
            className={`text-xs font-semibold ${getActionButtonClass()}`}
          >
            {loading && <RotateCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
