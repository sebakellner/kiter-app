import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { LibraryPage } from './pages/library-page'
import { readFile, realpath, rename } from 'node:fs/promises'
import path from 'node:path'
import { createWav } from '../support/fixtures/wav.mjs'

async function openPicker(
  page: Page,
  library: LibraryPage,
  name: string,
): Promise<void> {
  await library
    .row(name)
    .getByRole('button', { name: `More actions: ${name}`, exact: true })
    .click()
  await page
    .getByRole('menuitem', { name: 'Add to Collection', exact: true })
    .click()
  await expect(
    page.getByRole('dialog', { name: 'Add to Collection', exact: true }),
  ).toBeVisible()
}

async function createInPicker(page: Page, name: string): Promise<void> {
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
  await creator.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  await creator.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(picker).toBeVisible()
  await expect(
    picker.getByRole('list', { name: 'Selected Collections' }),
  ).toContainText(name)
}

test('Sample menus add to multiple Collections, preserve creation on cancel, report duplicates and remove only the current reference', async ({
  kiter,
}) => {
  const page = kiter.page
  const library = new LibraryPage(page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await expect(
    page.getByRole('heading', { name: 'Samples', exact: true }),
  ).toBeFocused()
  await library.row('kick.wav').getByTestId('favorite-toggle').click()
  await openPicker(page, library, 'kick.wav')
  await createInPicker(page, 'Unused picks')
  await page
    .getByRole('dialog', { name: 'Add to Collection' })
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  const unused = page.getByRole('row').filter({ hasText: 'Unused picks' })
  await expect(unused).toContainText('0 Samples')
  await page.getByRole('link', { name: 'Samples', exact: true }).click()
  await library.row('snare.wav').click({ position: { x: 4, y: 4 } })
  await openPicker(page, library, 'kick.wav')
  await createInPicker(page, 'Session Picks')
  await createInPicker(page, 'Spare Picks')
  await expect(page).toHaveURL(/#\/samples$/)
  let picker = page.getByRole('dialog', { name: 'Add to Collection' })
  await picker.getByRole('button', { name: 'Add Sample', exact: true }).click()
  await expect(
    picker.getByRole('region', { name: 'Collection results' }),
  ).toContainText('2 added, 0 already included, 0 failed.')
  await picker.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(library.row('snare.wav')).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.locator('audio')).not.toHaveAttribute('src')

  await openPicker(page, library, 'kick.wav')
  picker = page.getByRole('dialog', { name: 'Add to Collection' })
  await picker
    .getByRole('searchbox', { name: 'Search Collections' })
    .fill('session')
  await picker.getByRole('checkbox', { name: /^Session Picks/ }).check()
  await picker.getByRole('button', { name: 'Add Sample', exact: true }).click()
  await expect(
    picker.getByRole('region', { name: 'Collection results' }),
  ).toContainText('0 added, 1 already included, 0 failed.')
  await picker.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await expect(
    page.getByRole('row').filter({ hasText: 'Session Picks' }),
  ).toContainText('1 Sample')
  await page
    .getByRole('link', { name: 'Open Session Picks', exact: true })
    .click()
  await expect(page.getByTestId('sample-name')).toHaveText(['kick.wav'])
  const identity = await library.row('kick.wav').getAttribute('data-sample-id')
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'Info: kick.wav', exact: true })
    .click()
  await expect(
    page.getByRole('complementary', { name: 'Sample info' }),
  ).toContainText('kick.wav')
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'Play kick.wav', exact: true })
    .click()
  const player = page.locator('audio')
  await expect
    .poll(() =>
      player.evaluate(
        (audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0,
      ),
    )
    .toBe(true)
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'Pause kick.wav', exact: true })
    .click()
  const source = await player.getAttribute('src')
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'More actions: kick.wav', exact: true })
    .click()
  await page
    .getByRole('menuitem', { name: 'Remove from Collection', exact: true })
    .click()
  await expect(page.getByTestId('sample-name')).toHaveCount(0)
  await expect(
    page.getByText('This Collection is empty.', { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByRole('complementary', { name: 'Sample info' }),
  ).toContainText('Select a sample to see its information.')
  await expect(player).toHaveAttribute('src', source!)
  await expect
    .poll(() =>
      player.evaluate(
        (audio: HTMLAudioElement) => audio.paused && audio.currentTime > 0,
      ),
    )
    .toBe(true)
  await page.getByRole('link', { name: 'Favorites', exact: true }).click()
  await expect(library.row('kick.wav')).toHaveAttribute(
    'data-sample-id',
    identity!,
  )
  await expect(
    library.row('kick.wav').getByTestId('favorite-toggle'),
  ).toHaveAttribute('aria-pressed', 'true')
  await openPicker(page, library, 'kick.wav')
  picker = page.getByRole('dialog', { name: 'Add to Collection' })
  await picker.getByRole('checkbox', { name: /^Session Picks/ }).check()
  await picker.getByRole('button', { name: 'Add Sample', exact: true }).click()
  await expect(
    picker.getByRole('region', { name: 'Collection results' }),
  ).toContainText('1 added, 0 already included, 0 failed.')
  await picker.getByRole('button', { name: 'Done', exact: true }).click()
  await kiter.restart()
  await kiter.page
    .getByRole('link', { name: 'Collections', exact: true })
    .click()
  await expect(
    kiter.page.getByRole('row').filter({ hasText: 'Session Picks' }),
  ).toContainText('1 Sample')
  await expect(
    kiter.page.getByRole('row').filter({ hasText: 'Spare Picks' }),
  ).toContainText('1 Sample')
  await expect(
    kiter.page.getByRole('row').filter({ hasText: 'Unused picks' }),
  ).toContainText('0 Samples')
  await kiter.page
    .getByRole('link', { name: 'Open Spare Picks', exact: true })
    .click()
  await expect(kiter.page.getByTestId('sample-name')).toHaveText(['kick.wav'])
  await expect(new LibraryPage(kiter.page).row('kick.wav')).toHaveAttribute(
    'data-sample-id',
    identity!,
  )
  expect(await readFile(path.join(kiter.samples, 'kick.wav'))).toEqual(
    createWav(8),
  )
})

test('Collection members keep saved insertion order, authorize original-file dragging and retain unavailable references', async ({
  kiter,
}) => {
  const page = kiter.page
  const library = new LibraryPage(page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await expect(
    page.getByRole('heading', { name: 'Samples', exact: true }),
  ).toBeFocused()
  await openPicker(page, library, 'snare.wav')
  await createInPicker(page, 'Ordered Picks')
  let picker = page.getByRole('dialog', { name: 'Add to Collection' })
  await picker.getByRole('button', { name: 'Add Sample', exact: true }).click()
  await expect(
    picker.getByRole('region', { name: 'Collection results' }),
  ).toContainText('1 added')
  await picker.getByRole('button', { name: 'Done', exact: true }).click()
  await openPicker(page, library, 'kick.wav')
  picker = page.getByRole('dialog', { name: 'Add to Collection' })
  await picker.getByRole('checkbox', { name: /^Ordered Picks/ }).check()
  await picker.getByRole('button', { name: 'Add Sample', exact: true }).click()
  await expect(
    picker.getByRole('region', { name: 'Collection results' }),
  ).toContainText('1 added')
  await picker.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await page
    .getByRole('link', { name: 'Open Ordered Picks', exact: true })
    .click()
  await expect(page.getByTestId('sample-name')).toHaveText([
    'snare.wav',
    'kick.wav',
  ])
  const audioUrl = await library.row('kick.wav').getAttribute('data-audio-url')
  const drag = kiter.application.evaluate(
    ({ BrowserWindow }) =>
      new Promise<string>((resolve) => {
        BrowserWindow.getAllWindows()[0].webContents.startDrag = ({ file }) =>
          resolve(file)
      }),
  )
  await page.evaluate((url) => window.api.library.startDrag(url!), audioUrl)
  expect(await drag).toBe(await realpath(path.join(kiter.samples, 'kick.wav')))
  const original = path.join(kiter.samples, 'snare.wav')
  const moved = path.join(kiter.samples, 'temporarily-moved.wav')
  // Wait for the first lazy waveform read before intentionally moving its fixture.
  await expect(
    library
      .row('snare.wav')
      .getByRole('img', { name: 'Waveform of snare.wav' }),
  ).toBeVisible()
  await rename(original, moved)
  try {
    await page
      .getByRole('button', { name: 'Refresh Collection', exact: true })
      .click()
    await expect(
      library
        .row('snare.wav')
        .getByRole('button', { name: 'Play snare.wav', exact: true }),
    ).toBeDisabled()
    await expect(page.getByTestId('sample-name')).toHaveText([
      'snare.wav',
      'kick.wav',
    ])
    await library
      .row('snare.wav')
      .getByRole('button', { name: 'Info: snare.wav', exact: true })
      .click()
    await expect(
      page.getByRole('complementary', { name: 'Sample info' }),
    ).toContainText('snare.wav')
    await library
      .row('snare.wav')
      .getByRole('button', { name: 'More actions: snare.wav', exact: true })
      .click()
    await page
      .getByRole('menuitem', { name: 'Remove from Collection', exact: true })
      .click()
    await expect(page.getByTestId('sample-name')).toHaveText(['kick.wav'])
  } finally {
    await rename(moved, original)
  }
  await page.getByRole('link', { name: 'Samples', exact: true }).click()
  await expect(page.getByTestId('sample-name')).toHaveText([
    'kick.wav',
    'snare.wav',
  ])
  expect(await readFile(original)).toEqual(createWav(8))
})
