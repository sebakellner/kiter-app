import { createRef } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Card } from './Card'

test('Card composes cover content, metadata and independent actions without implicit button semantics', async () => {
  const user = userEvent.setup()
  const onOpen = vi.fn()
  render(
    <Card role="group" aria-labelledby="card-name">
      <div role="img" aria-label="Cover placeholder">
        No cover
      </div>
      <h2 id="card-name">Session Picks</h2>
      <p>0 Samples</p>
      <button onClick={onOpen}>Open</button>
    </Card>,
  )
  const card = screen.getByRole('group', { name: 'Session Picks' })
  expect(
    within(card).getByRole('img', { name: 'Cover placeholder' }),
  ).toBeVisible()
  expect(within(card).getByText('0 Samples')).toBeVisible()
  await user.click(within(card).getByRole('heading'))
  expect(onOpen).not.toHaveBeenCalled()
  await user.click(within(card).getByRole('button', { name: 'Open' }))
  expect(onOpen).toHaveBeenCalledOnce()
  expect(within(card).getAllByRole('button')).toHaveLength(1)
})

test('Card preserves native refs, focus, selection attributes and consumer event handlers', async () => {
  const user = userEvent.setup()
  const ref = createRef<HTMLDivElement>()
  const onClick = vi.fn()
  const onKeyDown = vi.fn()
  const { rerender } = render(
    <div role="grid" aria-label="Selections">
      <Card
        ref={ref}
        role="row"
        aria-selected={false}
        tabIndex={0}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <div role="gridcell">Session Picks</div>
      </Card>
    </div>,
  )
  const card = screen.getByRole('row')
  expect(ref.current).toBe(card)
  await user.tab()
  expect(card).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(onKeyDown).toHaveBeenCalledOnce()
  expect(onClick).not.toHaveBeenCalled()
  await user.click(card)
  expect(onClick).toHaveBeenCalledOnce()
  expect(card).toHaveAttribute('aria-selected', 'false')
  rerender(
    <div role="grid" aria-label="Selections">
      <Card ref={ref} role="row" aria-selected={true} tabIndex={0}>
        <div role="gridcell">Session Picks</div>
      </Card>
    </div>,
  )
  expect(card).toHaveAttribute('aria-selected', 'true')
})
