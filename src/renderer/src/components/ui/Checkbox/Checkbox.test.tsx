import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Checkbox } from './Checkbox'

test('preserves labeling, refs and native keyboard toggling', async () => {
  const user = userEvent.setup()
  const ref = createRef<HTMLInputElement>()
  const onChange = vi.fn()
  render(
    <label>
      <Checkbox ref={ref} onChange={onChange} />
      Favorites only
    </label>,
  )

  const checkbox = screen.getByRole('checkbox', { name: 'Favorites only' })
  expect(ref.current).toBe(checkbox)
  await user.tab()
  expect(checkbox).toHaveFocus()
  await user.keyboard(' ')
  expect(checkbox).toBeChecked()
  expect(onChange).toHaveBeenCalledOnce()
})

test('preserves native disabled behavior', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<Checkbox aria-label="Favorites only" disabled onChange={onChange} />)

  const checkbox = screen.getByRole('checkbox', { name: 'Favorites only' })
  await user.click(checkbox)
  expect(checkbox).toBeDisabled()
  expect(checkbox).not.toBeChecked()
  expect(onChange).not.toHaveBeenCalled()
})
