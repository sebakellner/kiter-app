import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { Category } from '@shared/domain/classification'
import { CategoryFilter } from './CategoryFilter'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'

function Example(): React.JSX.Element {
  const [value, setValue] = useState<Category[]>([])
  return <CategoryFilter value={value} onChange={setValue} />
}

test('category combobox applies multiple choices, retains search and removes chips without losing focus', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
  api.categories.list.mockResolvedValue({
    ok: true,
    data: {
      items: [
        { id: 'kick', name: 'Kick' },
        { id: 'snare', name: 'Snare' },
      ],
      total: 2,
      limit: 50,
      offset: 0,
    },
  })
  const user = userEvent.setup()
  render(<Example />)
  const input = screen.getByRole('combobox', { name: 'Categories' })
  await user.click(input)
  await user.click(await screen.findByRole('option', { name: 'Kick' }))
  await user.click(screen.getByRole('option', { name: 'Snare' }))
  expect(input).toHaveFocus()
  expect(
    screen.getByRole('button', { name: 'Remove category filter: Kick' }),
  ).toBeVisible()
  await user.type(input, 'ki')
  expect(input).toHaveValue('ki')
  await user.click(
    screen.getByRole('button', { name: 'Remove category filter: Kick' }),
  )
  expect(
    screen.queryByRole('button', { name: 'Remove category filter: Kick' }),
  ).not.toBeInTheDocument()
  expect(input).toHaveFocus()
  await user.click(screen.getByRole('button', { name: 'Clear all' }))
  expect(
    screen.queryByRole('button', { name: 'Remove category filter: Snare' }),
  ).not.toBeInTheDocument()
  expect(input).toHaveValue('ki')
})
