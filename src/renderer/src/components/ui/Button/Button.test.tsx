import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, NavLink, useLocation } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { Button } from './Button'

function Location(): React.JSX.Element {
  const { pathname } = useLocation()
  return <output aria-label="Current path">{pathname}</output>
}

test.each(['primary', 'secondary', 'ghost'] as const)(
  '%s button navigates as a link and exposes the active destination',
  async (variant) => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/home']}>
        <Button as={NavLink} variant={variant} to="/samples">
          Samples
        </Button>
        <Location />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Samples' })
    expect(link).toHaveAttribute('href', '/samples')
    expect(link).not.toHaveAttribute('type')
    expect(link).not.toHaveAttribute('variant')
    expect(link).not.toHaveAttribute('aria-current')

    await user.tab()
    expect(link).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(screen.getByLabelText('Current path')).toHaveTextContent('/samples')
    expect(link).toHaveAttribute('aria-current', 'page')
  },
)

test.each(['primary', 'secondary', 'ghost'] as const)(
  '%s button only submits forms when explicitly configured',
  async (variant) => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Button variant={variant}>Action</Button>
        <Button variant={variant} type="submit">
          Save
        </Button>
      </form>,
    )

    await user.click(screen.getByRole('button', { name: 'Action' }))
    expect(onSubmit).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  },
)

test.each(['primary', 'secondary', 'ghost'] as const)(
  '%s button preserves native disabled behavior',
  async (variant) => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button variant={variant} disabled onClick={onClick}>
        Save
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    expect(button).not.toHaveAttribute('variant')
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  },
)
