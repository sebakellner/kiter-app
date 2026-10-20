import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { Button } from '@renderer/components/ui/Button'
import { useShellNavigation } from './useShellNavigation'

function Shell(): React.JSX.Element {
  useShellNavigation()
  return (
    <>
      <header data-shell-region="header">
        <Button>Header control</Button>
      </header>
      <main data-shell-region="content" tabIndex={-1}>
        <div inert>
          <ul role="grid">
            <li role="row" aria-selected="true" tabIndex={0}>
              Inactive selected row
            </li>
          </ul>
          <Button>Inactive row control</Button>
        </div>
        <Button>Refresh Collection</Button>
      </main>
      <footer data-shell-region="player">
        <Button>Player control</Button>
      </footer>
    </>
  )
}

test('F6 skips inactive descendants and keeps the permanent player reachable during a pending write', async () => {
  const user = userEvent.setup()
  render(<Shell />)
  await user.click(screen.getByRole('button', { name: 'Header control' }))
  await user.keyboard('{F6}')
  expect(
    screen.getByRole('button', { name: 'Refresh Collection' }),
  ).toHaveFocus()
  await user.keyboard('{F6}')
  expect(screen.getByRole('button', { name: 'Player control' })).toHaveFocus()
  await user.keyboard('{Shift>}{F6}{/Shift}')
  expect(
    screen.getByRole('button', { name: 'Refresh Collection' }),
  ).toHaveFocus()
})
