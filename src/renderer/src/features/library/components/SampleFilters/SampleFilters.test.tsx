import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { Instrument } from '@shared/domain/classification'
import type { Genre } from '@shared/domain/recognition'
import { SampleFilters } from './SampleFilters'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'
import { deferred } from '../../../../../../../tests/support/fixtures/deferred'
import type { IpcResult } from '@shared/ipc/result'
import type { Page } from '@shared/domain/pagination'
import type { SampleTypeFilter } from '@shared/features/library/schemas'

function Example(): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [value, setValue] = useState<{
    instruments: Instrument[]
    genres: Genre[]
    sampleTypes: SampleTypeFilter
  }>({
    instruments: [],
    genres: [],
    sampleTypes: [],
  })
  return (
    <SampleFilters
      {...value}
      search={search}
      onSearchChange={setSearch}
      onChange={setValue}
    />
  )
}

test('filters retain independent choices and queries, remove chips and clear all groups', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
  api.instruments.list.mockResolvedValue({
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
  const input = screen.getByRole('combobox', { name: 'Instruments' })
  const search = screen.getByRole('searchbox', { name: 'Search samples' })
  expect(search).toHaveAttribute('placeholder', 'Search samples')
  expect(search).toHaveAttribute('maxlength', '500')
  await user.type(search, 'kick')
  expect(input).toHaveAttribute('placeholder', 'Instruments')
  expect(screen.getByRole('combobox', { name: 'Genres' })).toHaveAttribute(
    'placeholder',
    'Genres',
  )
  expect(
    screen.queryByText('Instruments', { selector: 'label' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText('Genres', { selector: 'label' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText('Sample type', { selector: 'label' }),
  ).not.toBeInTheDocument()
  await user.click(input)
  await user.click(await screen.findByRole('option', { name: 'Kick' }))
  await user.click(screen.getByRole('option', { name: 'Snare' }))
  expect(input).toHaveFocus()
  expect(
    screen.getByRole('button', { name: 'Remove instrument filter: Kick' }),
  ).toBeVisible()
  await user.type(input, 'ki')
  expect(input).toHaveValue('ki')
  await user.click(
    screen.getByRole('button', { name: 'Remove instrument filter: Kick' }),
  )
  expect(
    screen.queryByRole('button', { name: 'Remove instrument filter: Kick' }),
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
  const types = screen.getByRole('combobox', { name: 'Sample type' })
  expect(types).toHaveValue('all')
  await user.selectOptions(types, 'loop')
  expect(types).toHaveValue('loop')
  expect(
    screen.getByRole('button', { name: 'Remove Sample type filter: Loops' }),
  ).toBeVisible()
  await user.selectOptions(types, 'one-shot')
  expect(
    screen.queryByRole('button', { name: 'Remove Sample type filter: Loops' }),
  ).not.toBeInTheDocument()
  await user.selectOptions(types, 'unknown')
  expect(types).toHaveValue('unknown')
  expect(
    screen.queryByRole('button', {
      name: 'Remove Sample type filter: One-Shots',
    }),
  ).not.toBeInTheDocument()
  await user.click(
    screen.getByRole('button', { name: 'Remove Sample type filter: Unknown' }),
  )
  expect(types).toHaveValue('all')
  expect(types).toHaveFocus()
  await user.selectOptions(types, 'one-shot')
  expect(
    screen.getByRole('button', { name: 'Remove instrument filter: Snare' }),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Clear all' }))
  expect(
    screen.queryByRole('button', { name: 'Remove instrument filter: Snare' }),
  ).not.toBeInTheDocument()
  expect(input).toHaveValue('ki')
  expect(
    screen.queryByRole('button', { name: 'Remove genre filter: Techno' }),
  ).not.toBeInTheDocument()
  expect(input).toHaveFocus()
  expect(genres).toHaveValue('ho')
  expect(types).toHaveValue('all')
  expect(
    screen.queryByRole('button', {
      name: 'Remove Sample type filter: One-Shots',
    }),
  ).not.toBeInTheDocument()
  expect(search).toHaveValue('kick')
  await user.selectOptions(types, 'unknown')
  await user.click(screen.getByRole('button', { name: 'Clear search' }))
  expect(search).toHaveValue('')
  expect(search).toHaveFocus()
  expect(types).toHaveValue('unknown')
  expect(
    screen.getByRole('button', { name: 'Remove Sample type filter: Unknown' }),
  ).toBeVisible()
})

test('Sample type selector shows its filter name by default and replaces a single choice without refetching vocabulary', async () => {
  const api = createTestApi()
  api.instruments.list.mockResolvedValue({
    ok: true,
    data: { items: [], total: 0, limit: 50, offset: 0 },
  })
  api.genres.list.mockResolvedValue({
    ok: true,
    data: { items: [], total: 0, limit: 50, offset: 0 },
  })
  vi.stubGlobal('api', api)
  const user = userEvent.setup()
  render(<Example />)
  const types = screen.getByRole('combobox', { name: 'Sample type' })
  expect(screen.getByRole('option', { name: 'Sample type' })).toHaveProperty(
    'selected',
    true,
  )
  await user.selectOptions(types, 'loop')
  expect(types).toHaveFocus()
  await user.selectOptions(types, 'unknown')
  expect(types).toHaveValue('unknown')
  expect(
    screen.queryByRole('button', { name: 'Remove Sample type filter: Loops' }),
  ).not.toBeInTheDocument()
  await user.selectOptions(types, 'all')
  expect(types).toHaveValue('all')
  expect(screen.getByRole('option', { name: 'Sample type' })).toHaveProperty(
    'selected',
    true,
  )
  expect(
    screen.queryByRole('button', { name: 'Clear all' }),
  ).not.toBeInTheDocument()
  expect(api.instruments.list).toHaveBeenCalledTimes(1)
  expect(api.genres.list).toHaveBeenCalledTimes(1)
})

test('pending-operation disabling preserves criteria and prevents every filter or clear action', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  api.instruments.list.mockResolvedValue({
    ok: true,
    data: { items: [], total: 0, limit: 50, offset: 0 },
  })
  api.genres.list.mockResolvedValue({
    ok: true,
    data: { items: [], total: 0, limit: 50, offset: 0 },
  })
  const onChange = vi.fn()
  const onSearchChange = vi.fn()
  const user = userEvent.setup()
  render(
    <SampleFilters
      instruments={[{ id: 'kick', name: 'Kick' }]}
      genres={[{ id: 'house', name: 'House' }]}
      sampleTypes={['loop']}
      search="kick"
      disabled
      onChange={onChange}
      onSearchChange={onSearchChange}
    />,
  )
  for (const control of [
    ...screen.getAllByRole('combobox'),
    ...screen.getAllByRole('button'),
    screen.getByRole('searchbox'),
  ]) {
    expect(control).toBeDisabled()
  }
  await user.click(screen.getByRole('button', { name: 'Clear all' }))
  await user.type(screen.getByRole('searchbox'), 'snare')
  expect(screen.getByRole('searchbox')).toHaveValue('kick')
  expect(onChange).not.toHaveBeenCalled()
  expect(onSearchChange).not.toHaveBeenCalled()
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
  api.instruments.list.mockResolvedValue({
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
