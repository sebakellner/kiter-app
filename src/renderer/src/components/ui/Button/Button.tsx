import type { ComponentPropsWithRef, ElementType, JSX } from 'react'
import './Button.css'

export type ButtonProps<T extends ElementType = 'button'> = {
  as?: T
  className?: string
  variant?: 'primary' | 'secondary' | 'ghost'
} & Omit<ComponentPropsWithRef<T>, 'as' | 'className' | 'variant'>

export function Button<T extends ElementType = 'button'>({
  as,
  className,
  variant = 'secondary',
  ...props
}: ButtonProps<T>): JSX.Element {
  const Component = as ?? 'button'

  return (
    <Component
      {...(Component === 'button' ? { type: 'button' } : {})}
      {...props}
      data-variant={variant}
      className={className ? `ui-button ${className}` : 'ui-button'}
    />
  )
}
