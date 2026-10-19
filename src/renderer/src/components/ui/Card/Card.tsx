import type { ComponentPropsWithRef, JSX } from 'react'
import './Card.css'

export type CardProps = ComponentPropsWithRef<'div'>

export function Card({ className, ...props }: CardProps): JSX.Element {
  return (
    <div
      {...props}
      className={className ? `ui-card ${className}` : 'ui-card'}
    />
  )
}
