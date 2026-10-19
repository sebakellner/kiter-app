import { test, expect } from './fixtures'
import { LibraryPage } from './pages/library-page'
import type { Locator } from '@playwright/test'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createWav } from '../support/fixtures/wav.mjs'

test('local search finds direct saved Instruments and Genres in Samples and Favorites across restart', async ({
  kiter,
}) => {
  let library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  let inspector = kiter.page.getByRole('complementary', {
    name: 'Sample info',
  })
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'Info: kick.wav', exact: true })
    .click()
  await inspector
    .getByRole('button', { name: 'Apply Kick', exact: true })
    .click()
  await expect(inspector).toContainText('Classifications saved.')
  await library
    .row('snare.wav')
    .getByRole('button', { name: 'Info: snare.wav', exact: true })
    .click()
  await inspector
    .getByRole('button', { name: 'Edit instruments', exact: true })
    .click()
  const instruments = kiter.page.getByRole('dialog', {
    name: 'Edit instruments',
    exact: true,
  })
  await instruments
    .getByRole('searchbox', { name: 'Search instruments' })
    .fill('Kick')
  await instruments.getByRole('checkbox', { name: 'Kick', exact: true }).check()
  await instruments.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(instruments).toHaveCount(0)
  await inspector
    .getByRole('button', { name: 'Edit genres', exact: true })
    .click()
  let genres = kiter.page.getByRole('dialog', {
    name: 'Edit genres',
    exact: true,
  })
  await genres.getByRole('searchbox', { name: 'Search genres' }).fill('House')
  await genres.getByRole('checkbox', { name: 'House', exact: true }).check()
  await genres.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(genres).toHaveCount(0)
  await inspector.getByRole('button', { name: 'Close inspector' }).click()
  await library.row('snare.wav').getByTestId('favorite-toggle').click()

  const search = (): Locator =>
    kiter.page.getByRole('searchbox', { name: 'Search samples' })
  const names = (): Locator => kiter.page.getByTestId('sample-name')
  await search().fill('snare KICK HOUSE')
  await expect(names()).toHaveText(['snare.wav'])
  await expect(search()).toBeFocused()
  await kiter.page
    .getByRole('combobox', { name: 'Sample type', exact: true })
    .selectOption('loop')
  await expect(names()).toHaveCount(0)
  await kiter.page
    .getByRole('combobox', { name: 'Sample type', exact: true })
    .selectOption('unknown')
  await expect(names()).toHaveText(['snare.wav'])
  await kiter.page.getByRole('link', { name: 'Favorites', exact: true }).click()
  await search().fill('house kick')
  await expect(names()).toHaveText(['snare.wav'])
  await expect(kiter.page.locator('audio')).not.toHaveAttribute('src')

  await kiter.restart()
  library = new LibraryPage(kiter.page)
  inspector = kiter.page.getByRole('complementary', { name: 'Sample info' })
  genres = kiter.page.getByRole('dialog', { name: 'Edit genres', exact: true })
  await kiter.page.getByRole('link', { name: 'Samples', exact: true }).click()
  await search().fill('house kick')
  await expect(names()).toHaveText(['snare.wav'])
  await library
    .row('snare.wav')
    .getByRole('button', { name: 'Info: snare.wav', exact: true })
    .click()
  await inspector
    .getByRole('button', { name: 'Edit genres', exact: true })
    .click()
  await genres.getByRole('searchbox', { name: 'Search genres' }).fill('House')
  await genres.getByRole('checkbox', { name: 'House', exact: true }).uncheck()
  await genres.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(genres).toHaveCount(0)
  await inspector.getByRole('button', { name: 'Close inspector' }).click()
  await search().fill('snare house')
  await expect(names()).toHaveCount(0)
  await search().fill('snare kick')
  await expect(names()).toHaveText(['snare.wav'])
})

test('local search matches names and relative paths, intersects filters and restores independent destination queries', async ({
  kiter,
}) => {
  const folder = path.join(kiter.samples, 'Textures')
  await mkdir(folder)
  const original = path.join(folder, 'Ópen_Hat.wav')
  const hatPath = path.join('Textures', 'Ópen_Hat.wav')
  await writeFile(original, createWav(0.1))
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await library.row('kick.wav').getByTestId('favorite-toggle').click()
  await library.row(hatPath).getByTestId('favorite-toggle').click()
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'Info: kick.wav', exact: true })
    .click()
  const inspector = kiter.page.getByRole('complementary', {
    name: 'Sample info',
  })
  await inspector
    .getByRole('button', { name: 'Apply Kick', exact: true })
    .click()
  await expect(inspector).toContainText('Classifications saved.')
  await inspector.getByRole('button', { name: 'Close inspector' }).click()
  await expect(library.row('kick.wav')).toBeFocused()

  const search = kiter.page.getByRole('searchbox', { name: 'Search samples' })
  const names = kiter.page.getByTestId('sample-name')
  await search.fill('TEXTURES open')
  await expect(names).toHaveText([hatPath])
  await expect(search).toBeFocused()
  // A catalog match remains visible even when its original is unavailable.
  await library.row(hatPath).scrollIntoViewIfNeeded()
  await expect(
    library
      .row(hatPath)
      .getByRole('img', { name: `Waveform of ${hatPath}`, exact: true }),
  ).toBeVisible()
  const moved = path.join(folder, 'temporarily-moved.wav')
  await rename(original, moved)
  try {
    await kiter.page
      .getByRole('button', { name: 'Refresh', exact: true })
      .click()
    await expect(
      library
        .row(hatPath)
        .getByRole('button', { name: `Play ${hatPath}`, exact: true }),
    ).toBeDisabled()
    await expect(names).toHaveText([hatPath])
  } finally {
    await rename(moved, original)
  }
  await search.fill('kick')
  await expect(names).toHaveText(['kick.wav'])
  await kiter.page
    .getByRole('combobox', { name: 'Instruments', exact: true })
    .click()
  await kiter.page.getByRole('option', { name: 'Kick', exact: true }).click()
  await kiter.page
    .getByRole('combobox', { name: 'Sample type', exact: true })
    .selectOption('unknown')
  await expect(names).toHaveText(['kick.wav'])
  await search.fill('snare')
  await expect(names).toHaveCount(0)
  await expect(
    kiter.page.getByText('No samples match this search.', { exact: false }),
  ).toBeVisible()
  await kiter.page
    .getByRole('button', { name: 'Clear search', exact: true })
    .click()
  await expect(search).toBeFocused()
  await expect(names).toHaveText(['kick.wav'])
  await expect(
    kiter.page.getByRole('button', {
      name: 'Remove instrument filter: Kick',
      exact: true,
    }),
  ).toBeVisible()
  await search.fill('kick')
  await kiter.page
    .getByRole('button', { name: 'Clear all', exact: true })
    .click()
  await expect(search).toHaveValue('kick')
  await expect(names).toHaveText(['kick.wav'])
  await kiter.page
    .getByRole('combobox', { name: 'Sample type', exact: true })
    .selectOption('unknown')

  await kiter.page.getByRole('link', { name: 'Favorites', exact: true }).click()
  await expect(search).toHaveValue('')
  await search.fill('open')
  await expect(names).toHaveText([hatPath])
  await kiter.page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(search).toHaveValue('kick')
  await expect(
    kiter.page.getByRole('combobox', { name: 'Sample type', exact: true }),
  ).toHaveValue('unknown')
  await expect(names).toHaveText(['kick.wav'])
  await kiter.page.getByRole('button', { name: 'Forward', exact: true }).click()
  await expect(search).toHaveValue('open')
  await expect(names).toHaveText([hatPath])
  await kiter.page.getByRole('link', { name: 'Home', exact: true }).click()
  await kiter.page.getByRole('link', { name: 'Favorites', exact: true }).click()
  await expect(search).toHaveValue('open')
  await expect(names).toHaveText([hatPath])
  await expect(kiter.page.locator('audio')).not.toHaveAttribute('src')
  await kiter.restart()
  await kiter.page.getByRole('link', { name: 'Samples', exact: true }).click()
  await expect(
    kiter.page.getByRole('searchbox', { name: 'Search samples' }),
  ).toHaveValue('')
  await expect(kiter.page.getByTestId('sample-name')).toHaveCount(3)
  expect(await readFile(original)).toEqual(createWav(0.1))
})

test('local search resets pagination and revalidates hidden selection without changing the loaded player', async ({
  kiter,
}) => {
  for (let index = 0; index < 53; index++) {
    await writeFile(
      path.join(kiter.empty, `sample-${String(index).padStart(2, '0')}.wav`),
      createWav(8),
    )
  }
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.empty)
  await library.openFolder()
  await kiter.page
    .getByRole('button', { name: 'Next page', exact: true })
    .click()
  const names = kiter.page.getByTestId('sample-name')
  await expect(names).toHaveCount(3)
  const search = kiter.page.getByRole('searchbox', { name: 'Search samples' })
  await search.fill('s')
  await expect(
    kiter.page.getByText('Type at least 2 characters to search.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(names).toHaveCount(3)
  await search.fill('sample-01')
  await expect(names).toHaveText(['sample-01.wav'])
  await expect(
    kiter.page.getByRole('button', { name: 'Previous page', exact: true }),
  ).toBeDisabled()
  await kiter.page
    .getByRole('button', { name: 'Clear search', exact: true })
    .click()
  await expect(names).toHaveCount(50)
  const row = library.row('sample-10.wav')
  await row
    .getByRole('button', { name: 'Info: sample-10.wav', exact: true })
    .click()
  await row
    .getByRole('button', { name: 'Play sample-10.wav', exact: true })
    .click()
  const player = kiter.page.locator('audio')
  await expect
    .poll(() =>
      player.evaluate(
        (audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0,
      ),
    )
    .toBe(true)
  await row
    .getByRole('button', { name: 'Pause sample-10.wav', exact: true })
    .click()
  const source = await player.getAttribute('src')
  await search.fill('sample-52')
  await expect(names).toHaveText(['sample-52.wav'])
  await expect(search).toBeFocused()
  await expect(
    kiter.page.getByRole('complementary', { name: 'Sample info' }),
  ).toContainText('Select a sample to see its information.')
  await expect(
    kiter.page.locator('[role="row"][aria-selected="true"]'),
  ).toHaveCount(0)
  await expect(player).toHaveAttribute('src', source!)
  await expect
    .poll(() =>
      player.evaluate(
        (audio: HTMLAudioElement) => audio.paused && audio.currentTime > 0,
      ),
    )
    .toBe(true)
})
