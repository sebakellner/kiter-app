import { test, expect } from './fixtures'
import { LibraryPage } from './pages/library-page'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createWav } from '../support/fixtures/wav.mjs'
import { seedClassifiedSample } from '../support/electron/catalog'

test('local search reads saved metadata and relative paths and restores independent destination queries', async ({
  kiter,
}) => {
  const page = kiter.page
  const folder = path.join(kiter.samples, 'Textures')
  await mkdir(folder)
  const hatPath = path.join('Textures', 'Ópen_Hat.wav')
  await writeFile(path.join(folder, 'Ópen_Hat.wav'), createWav(0.1))
  const library = new LibraryPage(page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await expect(page.getByTestId('sample-name')).toHaveCount(3)
  await seedClassifiedSample(page, 'snare.wav')
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await page.getByRole('link', { name: 'Samples', exact: true }).click()

  const search = page.getByRole('searchbox', { name: 'Search samples' })
  const names = page.getByTestId('sample-name')
  await search.fill('snare KICK HOUSE')
  await expect(names).toHaveText(['snare.wav'])
  await expect(search).toBeFocused()
  await search.fill('TEXTURES open')
  await expect(names).toHaveText(['Ópen_Hat.wav'])
  await expect(page.getByTestId('sample-relative-path')).toHaveText(hatPath)
  await expect(page.getByTestId('sample-relative-path')).toBeHidden()
  await library
    .row('Ópen_Hat.wav')
    .getByRole('button', { name: 'More actions: Ópen_Hat.wav', exact: true })
    .click()
  await page
    .getByRole('menuitem', { name: 'Add to Collection', exact: true })
    .click()
  const picker = page.getByRole('dialog', {
    name: 'Add to Collection',
    exact: true,
  })
  await expect(picker.getByText('Ópen_Hat.wav', { exact: true })).toBeVisible()
  await expect(picker.getByText(hatPath, { exact: true })).toBeVisible()
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('link', { name: 'Favorites', exact: true }).click()
  await expect(search).toHaveValue('')
  await search.fill('house kick')
  await expect(names).toHaveText(['snare.wav'])
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(search).toHaveValue('TEXTURES open')
  await expect(names).toHaveText(['Ópen_Hat.wav'])
  await expect(page.getByTestId('sample-relative-path')).toHaveText(hatPath)
  await expect(page.getByTestId('sample-relative-path')).toBeHidden()
  await page.getByRole('button', { name: 'Forward', exact: true }).click()
  await expect(search).toHaveValue('house kick')
  await expect(names).toHaveText(['snare.wav'])
  await expect(page.locator('audio')).not.toHaveAttribute('src')
})

test('search resets pagination and clears hidden selection without unloading the paused player', async ({
  kiter,
}) => {
  for (let index = 0; index < 51; index++) {
    await writeFile(
      path.join(kiter.empty, `sample-${String(index).padStart(2, '0')}.wav`),
      createWav(index === 50 ? 8 : 0.1),
    )
  }
  const page = kiter.page
  const library = new LibraryPage(page)
  await kiter.selectFolder(kiter.empty)
  await library.openFolder()
  await expect(page.getByTestId('sample-name')).toHaveCount(50)
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(page.getByTestId('sample-name')).toHaveText(['sample-50.wav'])
  await expect(
    page.getByRole('button', { name: 'Next page', exact: true }),
  ).toBeDisabled()
  const row = library.row('sample-50.wav')
  await library.inspect('sample-50.wav')
  await row
    .getByRole('button', { name: 'Play sample-50.wav', exact: true })
    .click()
  const player = page.locator('audio')
  await expect
    .poll(() =>
      player.evaluate(
        (audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0,
      ),
    )
    .toBe(true)
  await row
    .getByRole('button', { name: 'Pause sample-50.wav', exact: true })
    .click()
  const source = await player.getAttribute('src')

  const search = page.getByRole('searchbox', { name: 'Search samples' })
  await search.fill('sample-01')
  await expect(page.getByTestId('sample-name')).toHaveText(['sample-01.wav'])
  await expect(
    page.getByRole('button', { name: 'Previous page', exact: true }),
  ).toBeDisabled()
  await expect(search).toBeFocused()
  await expect(
    page.getByRole('complementary', { name: 'Sample info' }),
  ).toContainText('Select a sample to see its information.')
  await expect(page.getByRole('row', { selected: true })).toHaveCount(0)
  await expect(player).toHaveAttribute('src', source!)
  await expect
    .poll(() =>
      player.evaluate(
        (audio: HTMLAudioElement) => audio.paused && audio.currentTime > 0,
      ),
    )
    .toBe(true)
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(page.getByTestId('sample-name')).toHaveCount(50)
})
