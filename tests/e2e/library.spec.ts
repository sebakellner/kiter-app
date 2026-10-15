import { test, expect } from './fixtures'
import { LibraryPage } from './pages/library-page'

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

  await kiter.restart()
  library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()

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
