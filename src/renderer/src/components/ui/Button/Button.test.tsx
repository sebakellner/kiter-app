import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, NavLink, useLocation } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { Button } from './Button'

function Location(): React.JSX.Element {
  const { pathname } = useLocation()
  return <output aria-label="Current path">{pathname}</output>
}

test('navigates as a link and exposes the active destination', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/home']}>
      <Button as={NavLink} to="/samples">
        Samples
      </Button>
      <Location />
    </MemoryRouter>,
  )
  const link = screen.getByRole('link', { name: 'Samples' })
  expect(link).toHaveAttribute('href', '/samples')
  expect(link).not.toHaveAttribute('type')
  expect(link).not.toHaveAttribute('aria-current')

  await user.tab()
  expect(link).toHaveFocus()
  await user.keyboard('{Enter}')

  expect(screen.getByLabelText('Current path')).toHaveTextContent('/samples')
  expect(link).toHaveAttribute('aria-current', 'page')
})

test('only submits forms when explicitly configured as a submit button', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
  render(
    <form onSubmit={onSubmit}>
      <Button>Action</Button>
      <Button type="submit">Save</Button>
    </form>,
  )

  await user.click(screen.getByRole('button', { name: 'Action' }))
  expect(onSubmit).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(onSubmit).toHaveBeenCalledOnce()
})
