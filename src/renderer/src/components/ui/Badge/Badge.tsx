import type { ComponentPropsWithRef, JSX } from 'react'
import './Badge.css'

export type BadgeProps = ComponentPropsWithRef<'span'>

export function Badge({ className, ...props }: BadgeProps): JSX.Element {
  return (
    <span
      {...props}
      className={className ? `ui-badge ${className}` : 'ui-badge'}
    />
  )
}
