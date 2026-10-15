import type { ComponentPropsWithRef, JSX } from 'react'
import './Button.css'

export type ButtonProps = ComponentPropsWithRef<'button'>

export function Button({
  type = 'button',
  className,
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      {...props}
      type={type}
      className={className ? `ui-button ${className}` : 'ui-button'}
    />
  )
}
