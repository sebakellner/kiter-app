import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, useWatch } from 'react-hook-form'
import { expect, test } from 'vitest'
import { Select } from './Select'

function FormExample(): React.JSX.Element {
  const { register, control } = useForm({ defaultValues: { type: 'unknown' } })
  const value = useWatch({ control, name: 'type' })
  return (
    <>
      <label>
        Sample type
        <Select {...register('type')}>
          <option value="unknown">Unknown</option>
          <option value="loop">Loop</option>
        </Select>
      </label>
      <output aria-label="Saved choice">{value}</output>
    </>
  )
}

test('Select preserves React Hook Form registration and native selection', async () => {
  const user = userEvent.setup()
  render(<FormExample />)
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Sample type' }),
    'loop',
  )
  expect(
    screen.getByRole('status', { name: 'Saved choice' }),
  ).toHaveTextContent('loop')
})

test('Select forwards refs, disabled state and accessible validation attributes', () => {
  const ref = createRef<HTMLSelectElement>()
  render(
    <Select
      ref={ref}
      aria-label="Type"
      disabled
      aria-invalid="true"
      aria-describedby="type-error"
    >
      <option>Unknown</option>
    </Select>,
  )
  const select = screen.getByRole('combobox', { name: 'Type' })
  expect(ref.current).toBe(select)
  expect(select).toBeDisabled()
  expect(select).toHaveAttribute('aria-invalid', 'true')
  expect(select).toHaveAttribute('aria-describedby', 'type-error')
})
