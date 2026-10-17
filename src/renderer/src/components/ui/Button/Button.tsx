import type { ComponentPropsWithRef, ElementType, JSX } from 'react'
import './Button.css'

export type ButtonProps<T extends ElementType = 'button'> = {
  as?: T
  className?: string
} & Omit<ComponentPropsWithRef<T>, 'as' | 'className'>

export function Button<T extends ElementType = 'button'>({
  as,
  className,
  ...props
}: ButtonProps<T>): JSX.Element {
  const Component = as ?? 'button'

  return (
    <Component
      {...(Component === 'button' ? { type: 'button' } : {})}
      {...props}
      className={className ? `ui-button ${className}` : 'ui-button'}
    />
  )
}
