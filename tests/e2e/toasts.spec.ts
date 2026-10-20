import { test, expect } from './fixtures'
import { LibraryPage } from './pages/library-page'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createWav } from '../support/fixtures/wav.mjs'

test('Favorite toasts report saved changes, survive navigation and do not steal focus', async ({
  kiter,
}) => {
  const page = kiter.page
  const library = new LibraryPage(page)
  await mkdir(path.join(kiter.samples, 'Drums'))
  await writeFile(
    path.join(kiter.samples, 'Drums', 'Soft Kick.wav'),
    createWav(0.1),
  )
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  const row = library.row('Soft Kick.wav')
  const favorite = row.getByRole('button', {
    name: 'Add favorite: Soft Kick.wav',
    exact: true,
  })
  await favorite.click()
  const notifications = page.getByRole('region', { name: 'Notifications' })
  await expect(notifications.getByRole('status')).toHaveText(
    '“Soft Kick.wav” added to Favorites.',
  )
  // The Favorite control is temporarily disabled while saving; the toast must
  // not move focus into its own dismiss control when the reply arrives.
  await expect(
    notifications.getByRole('button', { name: /Dismiss notification/ }),
  ).not.toBeFocused()
  await page.getByRole('link', { name: 'Favorites', exact: true }).click()
  await expect(notifications.getByRole('status')).toHaveText(
    '“Soft Kick.wav” added to Favorites.',
  )
  await new LibraryPage(page)
    .row('Soft Kick.wav')
    .getByRole('button', {
      name: 'Remove favorite: Soft Kick.wav',
      exact: true,
    })
    .click()
  await expect(notifications.getByRole('status')).toHaveText(
    '“Soft Kick.wav” removed from Favorites.',
  )
  await notifications
    .getByRole('button', { name: /Dismiss notification/ })
    .click()
  await expect(notifications.getByRole('status')).toHaveCount(0)
})
