import { useCallback, useMemo, useReducer, type ReactNode } from 'react'
import { ToastContext } from './ToastContext'
import { ToastViewport } from './ToastViewport'
import { initialToastState, toastReducer, type ToastInput } from './toastState'

export function ToastProvider({
  children,
}: {
  children: ReactNode
}): React.JSX.Element {
  const [state, dispatch] = useReducer(toastReducer, initialToastState)
  const showToast = useCallback((toast: ToastInput): void => {
    dispatch({ type: 'show', toast })
  }, [])
  const dismiss = useCallback((id: number): void => {
    dispatch({ type: 'dismiss', id })
  }, [])
  const context = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext value={context}>
      {children}
      <ToastViewport toasts={state.toasts} onDismiss={dismiss} />
    </ToastContext>
  )
}
