import type { ToastProps } from './Toast'

export type ToastInput = Pick<ToastProps, 'message' | 'variant'> & {
  operationId?: string
}

export type ToastNotice = ToastInput & { id: number }

interface ToastState {
  toasts: ToastNotice[]
  nextId: number
}

type ToastAction =
  { type: 'show'; toast: ToastInput } | { type: 'dismiss'; id: number }

export const initialToastState: ToastState = { toasts: [], nextId: 1 }

// Provider-local and bounded. Success never replaces an unresolved error.
export function toastReducer(
  state: ToastState,
  action: ToastAction,
): ToastState {
  if (action.type === 'dismiss') {
    return {
      ...state,
      toasts: state.toasts.filter(({ id }) => id !== action.id),
    }
  }
  const input = action.toast
  const toasts = state.toasts.filter(
    (toast) =>
      !input.operationId ||
      toast.operationId !== input.operationId ||
      (toast.variant === 'error' && input.variant !== 'error'),
  )
  if (toasts.length >= 5) {
    const removable = toasts.findIndex((toast) => toast.variant !== 'error')
    if (removable === -1) {
      return state
    }
    toasts.splice(removable, 1)
  }
  return {
    toasts: [...toasts, { ...input, id: state.nextId }],
    nextId: state.nextId + 1,
  }
}
