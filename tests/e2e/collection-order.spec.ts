import { writeFile, readFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { test, expect } from './fixtures'
import { LibraryPage } from './pages/library-page'
import { createWav } from '../support/fixtures/wav.mjs'
import type { Page } from '@playwright/test'

async function dragSample(
  library: LibraryPage,
  name: string,
  targetName: string,
  placement: 'before' | 'after',
): Promise<void> {
  const target = library.row(targetName)
  const rect = await target.boundingBox()
  if (!rect) {
    throw new Error('The drop destination is unavailable.')
  }
  await library
    .row(name)
    .getByRole('button', { name: `Reorder ${name}`, exact: true })
    .dragTo(target, {
      targetPosition: {
        x: 16,
        y: placement === 'before' ? 8 : rect.height - 8,
      },
    })
}

async function keyboardMove(
  page: Page,
  library: LibraryPage,
  name: string,
  direction: 'up' | 'down',
): Promise<void> {
  await library.row(name).focus()
  await page.keyboard.press('Shift+F10')
  const action = page.getByRole('menuitem', {
    name: direction === 'up' ? 'Move up' : 'Move down',
    exact: true,
  })
  await action.focus()
  await page.keyboard.press('Enter')
}

test('Collection drag ordering preserves selection and playback, disables filtered drops and survives restart', async ({
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
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'More actions: kick.wav' })
    .click()
  await page
    .getByRole('menuitem', { name: 'Add to Collection', exact: true })
    .click()
  let picker = page.getByRole('dialog', { name: 'Add to Collection' })
  await picker
    .getByRole('button', { name: 'Create Collection', exact: true })
    .click()
  const creator = page.getByRole('dialog', { name: 'Create Collection' })
  await creator
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Manual order')
  await creator.getByRole('button', { name: 'Create', exact: true }).click()
  picker = page.getByRole('dialog', { name: 'Add to Collection' })
  await picker.getByRole('button', { name: 'Add Sample', exact: true }).click()
  await expect(
    picker.getByRole('region', { name: 'Collection results' }),
  ).toContainText('1 added')
  await picker.getByRole('button', { name: 'Done', exact: true }).click()
  await library
    .row('snare.wav')
    .getByRole('button', { name: 'More actions: snare.wav' })
    .click()
  await page
    .getByRole('menuitem', { name: 'Add to Collection', exact: true })
    .click()
  picker = page.getByRole('dialog', { name: 'Add to Collection' })
  await picker.getByRole('checkbox', { name: /^Manual order/ }).check()
  await picker.getByRole('button', { name: 'Add Sample', exact: true }).click()
  await expect(
    picker.getByRole('region', { name: 'Collection results' }),
  ).toContainText('1 added')
  await picker.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await page
    .getByRole('link', { name: 'Open Manual order', exact: true })
    .click()
  await expect(page.getByTestId('sample-name')).toHaveText([
    'kick.wav',
    'snare.wav',
  ])
  await expect(
    page.getByRole('heading', { name: 'Manual order', exact: true }),
  ).toBeFocused()
  const handle = library
    .row('snare.wav')
    .getByRole('button', { name: 'Reorder snare.wav', exact: true })
  await expect(handle).toBeEnabled()
  await expect(
    page.getByRole('button', { name: 'Move up', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Move down', exact: true }),
  ).toHaveCount(0)
  await library
    .row('snare.wav')
    .getByRole('button', { name: 'Info: snare.wav', exact: true })
    .click()
  const selectedId = await library
    .row('snare.wav')
    .getAttribute('data-sample-id')
  const inspector = page.getByRole('complementary', { name: 'Sample info' })
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
  await dragSample(library, 'snare.wav', 'kick.wav', 'before')
  await expect(page.getByTestId('sample-name')).toHaveText([
    'snare.wav',
    'kick.wav',
  ])
  await expect(library.row('snare.wav')).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(library.row('snare.wav')).toHaveAttribute(
    'data-sample-id',
    selectedId!,
  )
  await expect(inspector).toContainText('snare.wav')
  await expect(library.row('snare.wav')).toBeFocused()
  await expect(player).toHaveAttribute('src', source!)
  await expect
    .poll(() =>
      player.evaluate(
        (audio: HTMLAudioElement) => audio.paused && audio.currentTime > 0,
      ),
    )
    .toBe(true)

  const search = page.getByRole('searchbox', { name: 'Search samples' })
  await search.fill('s')
  await expect(handle).toBeDisabled()
  await expect(
    page.getByText('Clear search and filters to change the saved order.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  const types = page.getByRole('combobox', { name: 'Sample type', exact: true })
  await types.selectOption('unknown')
  await expect(page.getByTestId('sample-name')).toHaveText([
    'snare.wav',
    'kick.wav',
  ])
  await expect(handle).toBeDisabled()
  await page.getByRole('button', { name: 'Clear all', exact: true }).click()
  await expect(handle).toBeEnabled()
  await expect(
    library
      .row('snare.wav')
      .getByRole('img', { name: 'Waveform of snare.wav', exact: true }),
  ).toBeVisible()
  const original = path.join(kiter.samples, 'snare.wav')
  const missing = path.join(kiter.samples, 'temporarily-moved.wav')
  await rename(original, missing)
  try {
    await page
      .getByRole('button', { name: 'Refresh Collection', exact: true })
      .click()
    await expect(
      library
        .row('snare.wav')
        .getByRole('button', { name: 'Play snare.wav', exact: true }),
    ).toBeDisabled()
    await expect(handle).toBeEnabled()
    await dragSample(library, 'snare.wav', 'kick.wav', 'after')
    await expect(page.getByTestId('sample-name')).toHaveText([
      'kick.wav',
      'snare.wav',
    ])
    await expect(library.row('snare.wav')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(library.row('snare.wav')).toBeFocused()
  } finally {
    await rename(missing, original)
  }
  await keyboardMove(page, library, 'snare.wav', 'up')
  await expect(page.getByTestId('sample-name')).toHaveText([
    'snare.wav',
    'kick.wav',
  ])
  await expect(player).toHaveAttribute('src', source!)
  await kiter.restart()
  await kiter.page
    .getByRole('link', { name: 'Collections', exact: true })
    .click()
  await kiter.page
    .getByRole('link', { name: 'Open Manual order', exact: true })
    .click()
  await expect(kiter.page.getByTestId('sample-name')).toHaveText([
    'snare.wav',
    'kick.wav',
  ])
  const restarted = new LibraryPage(kiter.page)
  await expect(
    restarted.row('kick.wav').getByTestId('favorite-toggle'),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(restarted.row('snare.wav')).toHaveAttribute(
    'data-sample-id',
    selectedId!,
  )
  await expect(kiter.page.getByRole('row', { selected: true })).toHaveCount(0)
  expect(await readFile(path.join(kiter.samples, 'kick.wav'))).toEqual(
    createWav(8),
  )
  expect(await readFile(path.join(kiter.samples, 'snare.wav'))).toEqual(
    createWav(8),
  )
})

test('Collection drops reject concurrent changes and keyboard move actions still cross page boundaries', async ({
  kiter,
}) => {
  const page = kiter.page
  for (let index = 0; index < 52; index++) {
    await writeFile(
      path.join(kiter.empty, `sample-${String(index).padStart(2, '0')}.wav`),
      createWav(0.1),
    )
  }
  const library = new LibraryPage(page)
  await kiter.selectFolder(kiter.empty)
  await library.openFolder()
  await expect(
    page.getByRole('heading', { name: 'Samples', exact: true }),
  ).toBeFocused()
  // Seed the larger fixture through real typed APIs. Every order change under
  // test uses the UI; no worker, SQLite or authorization boundary is mocked.
  const fixture = await page.evaluate(async () => {
    const catalog = await window.api.library.list({ limit: 100 })
    const collection = await window.api.collections.create({
      name: 'Paged order',
    })
    if (!catalog.ok || !collection.ok) {
      throw new Error('Unable to create the paging fixture.')
    }
    for (const sample of catalog.data.items) {
      const assigned = await window.api.collections.setMembership({
        collectionId: collection.data.id,
        sampleId: sample.id,
        assigned: true,
      })
      if (!assigned.ok) {
        throw new Error('Unable to seed a Collection member.')
      }
    }
    return {
      collectionId: collection.data.id,
      firstId: catalog.data.items[0].id,
    }
  })
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await page
    .getByRole('link', { name: 'Open Paged order', exact: true })
    .click()
  await expect(page.getByTestId('sample-name')).toHaveCount(50)
  await expect(
    page.getByRole('heading', { name: 'Paged order', exact: true }),
  ).toBeFocused()
  const moving = library.row('sample-49.wav')
  await moving.click({ position: { x: 4, y: 4 } })
  // A second writer changes the saved sequence after this page's snapshot.
  await page.evaluate(async ({ collectionId, firstId }) => {
    const current = await window.api.library.list({ collectionId })
    if (!current.ok || !current.data.collectionOrderToken) {
      throw new Error('Missing current order token.')
    }
    const changed = await window.api.collections.moveSample({
      collectionId,
      sampleId: firstId,
      direction: 'down',
      token: current.data.collectionOrderToken,
    })
    if (!changed.ok) {
      throw new Error('Unable to simulate a concurrent order change.')
    }
  }, fixture)
  await dragSample(library, 'sample-49.wav', 'sample-48.wav', 'before')
  await expect(page.getByRole('alert')).toContainText(
    'The Collection order changed.',
  )
  await expect(page.getByTestId('sample-name')).toHaveText([
    'sample-01.wav',
    'sample-00.wav',
    ...Array.from(
      { length: 48 },
      (_, index) => `sample-${String(index + 2).padStart(2, '0')}.wav`,
    ),
  ])
  await expect(
    page.getByRole('button', { name: 'Previous page', exact: true }),
  ).toBeDisabled()
  await expect(moving).toHaveAttribute('aria-selected', 'true')
  await keyboardMove(page, library, 'sample-49.wav', 'down')
  await expect(page.getByTestId('sample-name')).toHaveText([
    'sample-49.wav',
    'sample-51.wav',
  ])
  await expect(moving).toHaveAttribute('aria-selected', 'true')
  await expect(moving).toBeFocused()
  await keyboardMove(page, library, 'sample-49.wav', 'up')
  await expect(page.getByTestId('sample-name')).toHaveCount(50)
  await expect(moving).toHaveAttribute('aria-selected', 'true')
  await expect(moving).toBeFocused()
  await expect(
    page.getByRole('button', { name: 'Previous page', exact: true }),
  ).toBeDisabled()
  await expect(page.locator('audio')).not.toHaveAttribute('src')
})
