import type { ComponentPropsWithRef, JSX } from 'react'
import './Select.css'

export type SelectProps = ComponentPropsWithRef<'select'>

export function Select({ className, ...props }: SelectProps): JSX.Element {
  return (
    <select
      {...props}
      className={className ? `ui-select ${className}` : 'ui-select'}
    />
  )
}
