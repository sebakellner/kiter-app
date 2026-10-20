import { createContext } from 'react'
import type { ToastInput } from './toastState'

export interface ToastContextValue {
  showToast: (toast: ToastInput) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
