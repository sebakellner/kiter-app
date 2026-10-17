import { test, expect } from './fixtures'
import { LibraryPage } from './pages/library-page'
import { writeFile, rename, realpath } from 'node:fs/promises'
import path from 'node:path'
import { createWav } from '../support/fixtures/wav.mjs'

test('sidebar destinations support history navigation', async ({ kiter }) => {
  const navigation = kiter.page.getByRole('navigation', {
    name: 'Main navigation',
  })
  for (const destination of [
    'Favorites',
    'Packs',
    'Collections',
    'Categories',
    'Authors',
  ]) {
    const link = navigation.getByRole('link', {
      name: destination,
      exact: true,
    })
    await link.click()
    await expect(
      kiter.page.getByRole('heading', { name: destination, exact: true }),
    ).toBeVisible()
    await expect(link).toHaveAttribute('aria-current', 'page')
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1)
  }

  await kiter.page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(
    kiter.page.getByRole('heading', { name: 'Categories', exact: true }),
  ).toBeVisible()
  await kiter.page.getByRole('button', { name: 'Forward', exact: true }).click()
  await expect(
    kiter.page.getByRole('heading', { name: 'Authors', exact: true }),
  ).toBeVisible()
})

test('starts on Home with an empty permanent player and preserves the view when folder selection is canceled', async ({
  kiter,
}) => {
  await expect(
    kiter.page.getByRole('heading', { name: 'Home', exact: true }),
  ).toBeVisible()
  await expect(
    kiter.page.getByRole('region', { name: 'Global player' }),
  ).toContainText('Choose a sample to preview')
  await expect(
    kiter.page.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeDisabled()
  await kiter.selectFolder(null)
  await new LibraryPage(kiter.page).openFolder()
  await expect(
    kiter.page.getByRole('button', { name: 'Open folder' }),
  ).toBeEnabled()
  await expect(
    kiter.page.getByRole('heading', { name: 'Home', exact: true }),
  ).toBeVisible()
})

test('folder import lists original samples and cancellation preserves the current view', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await expect(kiter.page.getByTestId('sample-name')).toHaveText([
    'kick.wav',
    'snare.wav',
  ])
  const identity = await library.row('kick.wav').getAttribute('data-sample-id')

  await kiter.selectFolder(null)
  await library.openFolder()

  await expect(
    kiter.page.getByRole('button', { name: 'Open folder' }),
  ).toBeEnabled()
  await expect(kiter.page.getByTestId('sample-name')).toHaveText([
    'kick.wav',
    'snare.wav',
  ])
  await expect(library.row('kick.wav')).toHaveAttribute(
    'data-sample-id',
    identity!,
  )
})

test('favorite changes preserve Sample identity across separate Electron processes', async ({
  kiter,
}) => {
  let library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await expect(library.row('kick.wav')).toBeVisible()
  const id = await library.row('kick.wav').getAttribute('data-sample-id')
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'Add favorite: kick.wav', exact: true })
    .click()
  await expect(
    library
      .row('kick.wav')
      .getByRole('button', { name: 'Remove favorite: kick.wav', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await library.filterFavorites()
  await expect(kiter.page.getByTestId('sample-name')).toHaveText(['kick.wav'])

  await kiter.page.getByRole('link', { name: 'Home', exact: true }).click()
  await kiter.page.getByRole('link', { name: 'Samples', exact: true }).click()
  await expect(
    kiter.page.getByRole('checkbox', { name: 'Favorites only' }),
  ).toBeChecked()
  await expect(kiter.page.getByTestId('sample-name')).toHaveText(['kick.wav'])

  await kiter.restart()
  library = new LibraryPage(kiter.page)
  await kiter.page.getByRole('link', { name: 'Favorites', exact: true }).click()
  await expect(kiter.page.getByTestId('sample-name')).toHaveText(['kick.wav'])
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'Play kick.wav', exact: true })
    .click()
  await expect
    .poll(() =>
      kiter.page
        .locator('audio')
        .evaluate(
          (audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0,
        ),
    )
    .toBe(true)
  const url = await library.row('kick.wav').getAttribute('data-audio-url')
  // The event bridge is asynchronous; observe the native payload through an explicit promise.
  const dragResult = kiter.application.evaluate(
    ({ BrowserWindow }) =>
      new Promise<string>((resolve) => {
        BrowserWindow.getAllWindows()[0].webContents.startDrag = ({ file }) =>
          resolve(file)
      }),
  )
  await kiter.page.evaluate(
    (audioUrl) => window.api.library.startDrag(audioUrl!),
    url,
  )
  expect(await dragResult).toBe(
    await realpath(path.join(kiter.samples, 'kick.wav')),
  )
  await kiter.page.getByRole('link', { name: 'Samples', exact: true }).click()

  await expect(library.row('kick.wav')).toHaveAttribute('data-sample-id', id!)
  await expect(
    library
      .row('kick.wav')
      .getByRole('button', { name: 'Remove favorite: kick.wav', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    library
      .row('snare.wav')
      .getByRole('button', { name: 'Add favorite: snare.wav', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
})

test('multiple folders share one catalog and unavailable favorites retain their identity', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'Add favorite: kick.wav', exact: true })
    .click()
  await expect(
    library
      .row('kick.wav')
      .getByRole('button', { name: 'Remove favorite: kick.wav', exact: true }),
  ).toBeEnabled()
  const id = await library.row('kick.wav').getAttribute('data-sample-id')
  await writeFile(path.join(kiter.empty, 'hat.wav'), createWav(1))
  await kiter.selectFolder(kiter.empty)
  await library.openFolder()
  await expect(kiter.page.getByTestId('sample-name')).toHaveText([
    'hat.wav',
    'kick.wav',
    'snare.wav',
  ])
  await expect(library.row('kick.wav')).toHaveAttribute('data-sample-id', id!)
  const original = path.join(kiter.samples, 'kick.wav')
  const moved = path.join(kiter.samples, 'temporarily-moved.wav')
  await rename(original, moved)
  try {
    await kiter.page
      .getByRole('link', { name: 'Favorites', exact: true })
      .click()
    await expect(library.row('kick.wav')).toHaveAttribute('data-sample-id', id!)
    await expect(
      library
        .row('kick.wav')
        .getByRole('button', { name: 'Play kick.wav', exact: true }),
    ).toBeDisabled()
    await expect(library.row('kick.wav')).toContainText('Audio unavailable.')
    await expect(
      library.row('kick.wav').getByRole('button', {
        name: 'Remove favorite: kick.wav',
        exact: true,
      }),
    ).toBeEnabled()
  } finally {
    await rename(moved, original)
  }
  await kiter.page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(
    library
      .row('kick.wav')
      .getByRole('button', { name: 'Play kick.wav', exact: true }),
  ).toBeEnabled()
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'Remove favorite: kick.wav', exact: true })
    .click()
  await expect(kiter.page.getByTestId('sample-name')).toHaveCount(0)
  await kiter.page.getByRole('link', { name: 'Samples', exact: true }).click()
  await expect(
    library
      .row('kick.wav')
      .getByRole('button', { name: 'Add favorite: kick.wav', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
})

test('catalog browsing uses bounded pages', async ({ kiter }) => {
  for (let index = 0; index < 53; index++) {
    await writeFile(
      path.join(kiter.empty, `sample-${String(index).padStart(2, '0')}.wav`),
      createWav(0.1),
    )
  }
  await kiter.selectFolder(kiter.empty)
  await new LibraryPage(kiter.page).openFolder()
  await expect(kiter.page.getByTestId('sample-name')).toHaveCount(50)
  await kiter.page
    .getByRole('button', { name: 'Next page', exact: true })
    .click()
  await expect(kiter.page.getByTestId('sample-name')).toHaveText([
    'sample-50.wav',
    'sample-51.wav',
    'sample-52.wav',
  ])
  await expect(
    kiter.page.getByRole('button', { name: 'Next page', exact: true }),
  ).toBeDisabled()
  await kiter.page
    .getByRole('button', { name: 'Previous page', exact: true })
    .click()
  await expect(kiter.page.getByTestId('sample-name')).toHaveCount(50)
})

test('preview advances, switching keeps one player and stop resets playback', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'Play kick.wav', exact: true })
    .click()
  const player = kiter.page.locator('audio')
  await expect(player).toHaveCount(1)
  await expect
    .poll(() =>
      player.evaluate(
        (audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0,
      ),
    )
    .toBe(true)

  const beforeNavigation = await player.evaluate((audio: HTMLAudioElement) => {
    audio.dataset.navigationMarker = 'same-player'
    return audio.currentTime
  })
  await kiter.page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(
    kiter.page.getByRole('heading', { name: 'Home', exact: true }),
  ).toBeVisible()
  await expect(player).toHaveAttribute('data-navigation-marker', 'same-player')
  await expect
    .poll(() =>
      player.evaluate(
        (audio: HTMLAudioElement, previousTime) =>
          !audio.paused && audio.currentTime > previousTime,
        beforeNavigation,
      ),
    )
    .toBe(true)
  await kiter.page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(library.row('kick.wav')).toBeVisible()
  await expect(player).toHaveAttribute('data-navigation-marker', 'same-player')

  await library
    .row('snare.wav')
    .getByRole('button', { name: 'Play snare.wav', exact: true })
    .click()

  await expect(
    library
      .row('snare.wav')
      .getByRole('button', { name: 'Stop snare.wav', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    library
      .row('kick.wav')
      .getByRole('button', { name: 'Play kick.wav', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  await expect(player).toHaveCount(1)
  await library
    .row('snare.wav')
    .getByRole('button', { name: 'Stop snare.wav', exact: true })
    .click()
  await expect
    .poll(() =>
      player.evaluate((audio: HTMLAudioElement) => ({
        paused: audio.paused,
        time: audio.currentTime,
      })),
    )
    .toEqual({ paused: true, time: 0 })
})
