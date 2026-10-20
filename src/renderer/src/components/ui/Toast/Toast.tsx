import { useEffect, useRef, useState } from 'react'
import { Button } from '../Button'
import './Toast.css'

export interface ToastProps {
  message: string
  variant?: 'success' | 'info' | 'error'
  duration?: number
  onDismiss: () => void
}

export function Toast({
  message,
  variant = 'success',
  duration = 5000,
  onDismiss,
}: ToastProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const remaining = useRef(duration)
  const dismiss = useRef(onDismiss)
  useEffect(() => {
    dismiss.current = onDismiss
  }, [onDismiss])
  useEffect(() => {
    if (variant === 'error' || hovered || focused) {
      return
    }
    const started = Date.now()
    const timer = window.setTimeout(() => dismiss.current(), remaining.current)
    return () => {
      window.clearTimeout(timer)
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - started),
      )
    }
  }, [variant, hovered, focused])

  return (
    <div
      className="ui-toast"
      data-variant={variant}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onDismiss()
        }
      }}
    >
      <p role={variant === 'error' ? 'alert' : 'status'} aria-atomic="true">
        {message}
      </p>
      <Button
        variant="ghost"
        aria-label={`Dismiss notification: ${message}`}
        onClick={onDismiss}
      >
        ×
      </Button>
    </div>
  )
}
