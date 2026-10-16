import type { ComponentPropsWithRef, JSX } from 'react'

export type CheckboxProps = Omit<ComponentPropsWithRef<'input'>, 'type'>

export function Checkbox(props: CheckboxProps): JSX.Element {
  return <input {...props} type="checkbox" />
}
