import type { ComponentPropsWithRef, JSX } from 'react'
import './Input.css'

export type InputProps = ComponentPropsWithRef<'input'>

export function Input({
  className,
  type = 'text',
  ...props
}: InputProps): JSX.Element {
  return (
    <input
      {...props}
      type={type}
      className={className ? `ui-input ${className}` : 'ui-input'}
    />
  )
}
