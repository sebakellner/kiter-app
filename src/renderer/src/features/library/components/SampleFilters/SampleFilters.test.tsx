import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { Category } from '@shared/domain/classification'
import type { Genre } from '@shared/domain/recognition'
import { SampleFilters } from './SampleFilters'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'
import { deferred } from '../../../../../../../tests/support/fixtures/deferred'
import type { IpcResult } from '@shared/ipc/result'
import type { Page } from '@shared/domain/pagination'

function Example(): React.JSX.Element {
  const [value, setValue] = useState<{
    categories: Category[]
    genres: Genre[]
  }>({
    categories: [],
    genres: [],
  })
  return <SampleFilters {...value} onChange={setValue} />
}

test('classification comboboxes retain independent choices and queries, remove chips and clear both groups', async () => {
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
  api.genres.list.mockResolvedValue({
    ok: true,
    data: {
      items: [
        { id: 'house', name: 'House' },
        { id: 'techno', name: 'Techno' },
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
  const genres = screen.getByRole('combobox', { name: 'Genres' })
  await user.click(genres)
  await user.click(await screen.findByRole('option', { name: 'House' }))
  await user.click(screen.getByRole('option', { name: 'Techno' }))
  expect(genres).toHaveFocus()
  await user.type(genres, 'ho')
  await user.click(
    screen.getByRole('button', { name: 'Remove genre filter: House' }),
  )
  expect(genres).toHaveFocus()
  expect(genres).toHaveValue('ho')
  expect(
    screen.getByRole('button', { name: 'Remove category filter: Snare' }),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Clear all' }))
  expect(
    screen.queryByRole('button', { name: 'Remove category filter: Snare' }),
  ).not.toBeInTheDocument()
  expect(input).toHaveValue('ki')
  expect(
    screen.queryByRole('button', { name: 'Remove genre filter: Techno' }),
  ).not.toBeInTheDocument()
  expect(input).toHaveFocus()
  expect(genres).toHaveValue('ho')
})

test('Genre options reject stale searches and preserve selected chips through failure and retry', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
  const pending = deferred<IpcResult<Page<Genre>>>()
  const house = { id: 'house', name: 'House' }
  api.categories.list.mockResolvedValue({
    ok: true,
    data: { items: [], total: 0, limit: 50, offset: 0 },
  })
  api.genres.list.mockResolvedValue({
    ok: true,
    data: { items: [house], total: 1, limit: 50, offset: 0 },
  })
  const user = userEvent.setup()
  render(<Example />)
  const genres = screen.getByRole('combobox', { name: 'Genres' })
  await user.click(genres)
  await user.click(await screen.findByRole('option', { name: 'House' }))
  api.genres.list.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({
    ok: true,
    data: { items: [], total: 0, limit: 50, offset: 0 },
  })
  await user.type(genres, 'xy')
  expect(await screen.findByText('No matching genres.')).toBeVisible()
  await act(async () =>
    pending.resolve({
      ok: true,
      data: { items: [house], total: 1, limit: 50, offset: 0 },
    }),
  )
  expect(
    screen.queryByRole('option', { name: 'House' }),
  ).not.toBeInTheDocument()
  api.genres.list.mockResolvedValueOnce({
    ok: false,
    error: { code: 'STORAGE_FAILED', message: 'Genres unavailable.' },
  })
  await user.type(genres, 'z')
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Genres unavailable.',
  )
  expect(
    screen.getByRole('button', { name: 'Remove genre filter: House' }),
  ).toBeVisible()
  api.genres.list.mockResolvedValue({
    ok: true,
    data: { items: [house], total: 1, limit: 50, offset: 0 },
  })
  await user.click(screen.getByRole('button', { name: 'Retry genres' }))
  await user.click(genres)
  expect(await screen.findByRole('option', { name: 'House' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(genres).toHaveValue('xyz')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
