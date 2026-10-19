import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, useWatch } from 'react-hook-form'
import { expect, test } from 'vitest'
import { Input } from './Input'

function Example(): React.JSX.Element {
  const { register, control } = useForm({ defaultValues: { name: '' } })
  const value = useWatch({ control, name: 'name' })
  return (
    <>
      <label>
        Name
        <Input {...register('name')} />
      </label>
      <output aria-label="Current name">{value}</output>
    </>
  )
}

test('Input preserves React Hook Form registration and native typing', async () => {
  const user = userEvent.setup()
  render(<Example />)
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Kick')
  expect(
    screen.getByRole('status', { name: 'Current name' }),
  ).toHaveTextContent('Kick')
})

test('Input forwards search semantics, refs and accessible validation attributes', () => {
  const ref = createRef<HTMLInputElement>()
  render(
    <Input
      ref={ref}
      type="search"
      aria-label="Search"
      disabled
      aria-invalid="true"
      aria-describedby="search-error"
      maxLength={120}
    />,
  )
  const input = screen.getByRole('searchbox', { name: 'Search' })
  expect(ref.current).toBe(input)
  expect(input).toBeDisabled()
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveAttribute('aria-describedby', 'search-error')
  expect(input).toHaveAttribute('maxlength', '120')
})
