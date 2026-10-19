import type { ComponentPropsWithRef, JSX } from 'react'
import './Checkbox.css'

export type CheckboxProps = Omit<ComponentPropsWithRef<'input'>, 'type'>

export function Checkbox({ className, ...props }: CheckboxProps): JSX.Element {
  return (
    <input
      {...props}
      type="checkbox"
      className={className ? `ui-checkbox ${className}` : 'ui-checkbox'}
    />
  )
}
