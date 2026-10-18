import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { test, expect, vi } from 'vitest'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'
import { AliasUpdates } from './AliasUpdates'

test('checking aliases does not incorporate them until the user explicitly chooses an offer', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  const offer = {
    key: 'category:drums:drum',
    targetName: 'Drums',
    term: 'Drum',
    dimension: 'category' as const,
    token: 'a'.repeat(64),
    blockedReason: null,
  }
  api.classification.listAliasUpdates
    .mockResolvedValueOnce({
      ok: true,
      data: { items: [offer], total: 1, limit: 50, offset: 0 },
    })
    .mockResolvedValueOnce({
      ok: true,
      data: { items: [], total: 0, limit: 50, offset: 0 },
    })
  api.classification.incorporateAlias.mockResolvedValue({
    ok: true,
    data: { key: offer.key },
  })
  const onIncorporated = vi.fn()
  const user = userEvent.setup()
  render(<AliasUpdates onIncorporated={onIncorporated} />)
  await user.click(
    screen.getByRole('button', { name: 'Check vocabulary updates' }),
  )
  expect(await screen.findByText('Drum → Drums (category)')).toBeVisible()
  expect(api.classification.incorporateAlias).not.toHaveBeenCalled()
  await user.click(
    screen.getByRole('button', { name: 'Add alias: Drum → Drums' }),
  )
  expect(await screen.findByText('No new aliases available.')).toBeVisible()
  expect(onIncorporated).toHaveBeenCalledOnce()
  expect(api.classification.incorporateAlias).toHaveBeenCalledWith({
    key: offer.key,
    token: offer.token,
  })
})
