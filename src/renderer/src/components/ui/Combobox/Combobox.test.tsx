import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { Combobox } from './Combobox'

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
})

const options = [
  { value: 'kick', label: 'Kick' },
  { value: 'snare', label: 'Snare', disabled: true },
  { value: 'clap', label: 'Clap' },
]

function MultipleExample(): React.JSX.Element {
  const [value, setValue] = useState<string[]>([])
  const [query, setQuery] = useState('')
  return (
    <>
      <Combobox
        aria-label="Instruments"
        listLabel="Available instruments"
        multiple
        options={options.filter((option) =>
          option.label.toLowerCase().includes(query),
        )}
        value={value}
        onValueChange={setValue}
        query={query}
        onQueryChange={setQuery}
      />
      <button type="button">Next control</button>
    </>
  )
}

test('multi-select keeps focus and query, skips disabled options and closes only its popup on Escape', async () => {
  const outerKey = vi.fn()
  const user = userEvent.setup()
  render(
    <div onKeyDown={outerKey}>
      <MultipleExample />
    </div>,
  )
  const input = screen.getByRole('combobox', { name: 'Instruments' })
  await user.click(input)
  await user.keyboard('{ArrowDown}{Enter}{ArrowDown}{Enter}')
  expect(screen.getByRole('option', { name: 'Kick' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(screen.getByRole('option', { name: 'Clap' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(screen.getByRole('option', { name: 'Snare' })).toHaveAttribute(
    'aria-selected',
    'false',
  )
  expect(input).toHaveFocus()
  await user.type(input, 'ki')
  expect(input).toHaveValue('ki')
  await user.click(screen.getByRole('option', { name: 'Kick' }))
  expect(screen.getByRole('option', { name: 'Kick' })).toHaveAttribute(
    'aria-selected',
    'false',
  )
  expect(input).toHaveValue('ki')
  expect(input).toHaveFocus()
  outerKey.mockClear()
  await user.keyboard('{Escape}')
  expect(input).toHaveAttribute('aria-expanded', 'false')
  expect(outerKey).not.toHaveBeenCalled()
  await user.tab()
  expect(screen.getByRole('button', { name: 'Next control' })).toHaveFocus()
})

test('single selection closes the list and loading or disabled results cannot be selected', async () => {
  const user = userEvent.setup()
  const change = vi.fn()
  const props = {
    'aria-label': 'Instrument',
    listLabel: 'Available instruments',
    options,
    value: null,
    onValueChange: change,
    query: '',
    onQueryChange: vi.fn(),
  }
  const { rerender } = render(<Combobox {...props} />)
  const input = screen.getByRole('combobox', { name: 'Instrument' })
  await user.click(input)
  await user.click(screen.getByRole('option', { name: 'Snare' }))
  expect(change).not.toHaveBeenCalled()
  await user.click(screen.getByRole('option', { name: 'Kick' }))
  expect(change).toHaveBeenCalledWith('kick')
  expect(input).toHaveAttribute('aria-expanded', 'false')
  rerender(<Combobox {...props} loading />)
  await user.click(input)
  expect(screen.getByRole('status')).toHaveTextContent('Loading options')
  change.mockClear()
  await user.keyboard('{ArrowDown}{Enter}')
  expect(change).not.toHaveBeenCalled()
  rerender(<Combobox {...props} options={[]} />)
  expect(screen.getByRole('status')).toHaveTextContent('No options found.')
})
