import { test, expect } from './fixtures'
import { LibraryPage } from './pages/library-page'
import { rename } from 'node:fs/promises'
import path from 'node:path'
import { seedCollection } from '../support/electron/catalog'

test('checked Samples include hidden selections when adding to a Collection and memberships survive restart', async ({
  kiter,
}) => {
  const page = kiter.page
  const library = new LibraryPage(page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await expect(page.getByTestId('sample-name')).toHaveCount(2)
  await seedCollection(page, 'Batch Picks', ['kick.wav'])
  await page
    .getByRole('checkbox', { name: 'Select snare.wav', exact: true })
    .check()
  await page
    .getByRole('checkbox', { name: 'Select kick.wav', exact: true })
    .check()
  await page
    .getByRole('searchbox', { name: 'Search samples', exact: true })
    .fill('snare')
  await expect(
    page.getByText('2 selected (1 outside this page)', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Add to Collection', exact: true })
    .click()
  const picker = page.getByRole('dialog', {
    name: 'Add to Collection',
    exact: true,
  })
  await picker.getByText('Review selected Samples (2)', { exact: true }).click()
  await expect(
    picker
      .getByRole('list', { name: 'Selected Samples' })
      .getByRole('listitem'),
  ).toHaveCount(2)
  await picker.getByRole('checkbox', { name: /Batch Picks/ }).check()
  await picker
    .getByRole('button', { name: 'Add 2 Samples', exact: true })
    .click()
  await expect(
    picker.getByRole('region', { name: 'Collection results' }),
  ).toContainText('1 added, 1 already included, 0 failed.')
  await picker.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('audio')).not.toHaveAttribute('src')
  await kiter.restart()
  await kiter.page
    .getByRole('link', { name: 'Collections', exact: true })
    .click()
  await kiter.page
    .getByRole('link', { name: 'Open Batch Picks', exact: true })
    .click()
  await expect(kiter.page.getByTestId('sample-name')).toHaveText([
    'kick.wav',
    'snare.wav',
  ])
  const checkboxes = kiter.page.getByRole('checkbox', { name: /^Select / })
  await expect(checkboxes).toHaveCount(2)
  await expect(checkboxes.nth(0)).not.toBeChecked()
  await expect(checkboxes.nth(1)).not.toBeChecked()
})

test('a Sample menu creates a Collection in the nested picker and adds the acted-on Sample', async ({
  kiter,
}) => {
  const page = kiter.page
  const library = new LibraryPage(page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  const row = library.row('kick.wav')
  await expect(row).toBeVisible()
  const identity = await row.getAttribute('data-sample-id')
  await row
    .getByRole('button', { name: 'More actions: kick.wav', exact: true })
    .click()
  await page
    .getByRole('menuitem', { name: 'Add to Collection', exact: true })
    .click()
  const picker = page.getByRole('dialog', {
    name: 'Add to Collection',
    exact: true,
  })
  await picker
    .getByRole('button', { name: 'Create Collection', exact: true })
    .click()
  const creator = page.getByRole('dialog', {
    name: 'Create Collection',
    exact: true,
  })
  await creator
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Session Picks')
  await creator.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(
    picker.getByRole('list', { name: 'Selected Collections' }),
  ).toContainText('Session Picks')
  await picker.getByRole('button', { name: 'Add Sample', exact: true }).click()
  await expect(
    picker.getByRole('region', { name: 'Collection results' }),
  ).toContainText('1 added, 0 already included, 0 failed.')
  await expect(
    picker.getByRole('region', { name: 'Notifications' }),
  ).toContainText('“kick.wav” added to “Session Picks”.')
  await picker.getByRole('button', { name: 'Done', exact: true }).click()
  const notifications = page.getByRole('region', { name: 'Notifications' })
  await expect(notifications).toContainText(
    '“kick.wav” added to “Session Picks”.',
  )
  await notifications
    .getByRole('button', { name: /Dismiss notification/ })
    .click()
  await expect(notifications.getByRole('status')).toHaveCount(0)
  await expect(page.locator('audio')).not.toHaveAttribute('src')

  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await expect(
    page
      .getByRole('grid', { name: 'Collections', exact: true })
      .getByRole('row', { name: /^Session Picks, Collection / }),
  ).toContainText('1 Sample')
  await page
    .getByRole('link', { name: 'Open Session Picks', exact: true })
    .click()
  await expect(page.getByTestId('sample-name')).toHaveText(['kick.wav'])
  await expect(library.row('kick.wav')).toHaveAttribute(
    'data-sample-id',
    identity!,
  )
})

test('removing an unavailable Collection member preserves its catalog identity and other memberships', async ({
  kiter,
}) => {
  const page = kiter.page
  const library = new LibraryPage(page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await expect(page.getByTestId('sample-name')).toHaveCount(2)
  await seedCollection(page, 'Session Picks', ['snare.wav', 'kick.wav'])
  await seedCollection(page, 'Spare Picks', ['snare.wav'])
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await page
    .getByRole('link', { name: 'Open Session Picks', exact: true })
    .click()
  await expect(page.getByTestId('sample-name')).toHaveText([
    'snare.wav',
    'kick.wav',
  ])
  const row = library.row('snare.wav')
  const identity = await row.getAttribute('data-sample-id')
  await expect(
    row.getByRole('img', { name: 'Waveform of snare.wav', exact: true }),
  ).toBeVisible()
  const original = path.join(kiter.samples, 'snare.wav')
  const moved = path.join(kiter.samples, 'temporarily-moved.wav')
  await rename(original, moved)
  try {
    await page
      .getByRole('button', { name: 'Refresh Collection', exact: true })
      .click()
    await expect(
      row.getByRole('button', { name: 'Play snare.wav', exact: true }),
    ).toBeDisabled()
    await expect(row).toHaveAttribute('data-sample-id', identity!)
    await row
      .getByRole('button', { name: 'More actions: snare.wav', exact: true })
      .click()
    await page
      .getByRole('menuitem', { name: 'Remove from Collection', exact: true })
      .click()
    await expect(page.getByTestId('sample-name')).toHaveText(['kick.wav'])
    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Collections', exact: true })
      .click()
    await page
      .getByRole('link', { name: 'Open Spare Picks', exact: true })
      .click()
    await expect(page.getByTestId('sample-name')).toHaveText(['snare.wav'])
    await expect(library.row('snare.wav')).toHaveAttribute(
      'data-sample-id',
      identity!,
    )
  } finally {
    await rename(moved, original)
  }
})
