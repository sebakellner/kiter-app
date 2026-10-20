import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { test, expect } from './fixtures'
import { LibraryPage } from './pages/library-page'
import { seedCollection } from '../support/electron/catalog'

test('Collection names and waveforms hand off original audio to native dragging even when ordering is filtered', async ({
  kiter,
}) => {
  const page = kiter.page
  const library = new LibraryPage(page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await expect(page.getByTestId('sample-name')).toHaveCount(2)
  await seedCollection(page, 'Native drag', ['kick.wav', 'snare.wav'])
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await page
    .getByRole('link', { name: 'Open Native drag', exact: true })
    .click()
  await page.getByRole('searchbox', { name: 'Search samples' }).fill('kick')
  await expect(page.getByTestId('sample-name')).toHaveText(['kick.wav'])
  await expect(
    page.getByRole('button', { name: 'Reorder kick.wav', exact: true }),
  ).toBeDisabled()

  // Only the OS handoff is replaced. Real gestures traverse preload and main
  // authorization; this is not evidence of reception by a DAW.
  const nativeDrags = await kiter.application.evaluateHandle(
    ({ BrowserWindow }) => {
      const files: string[] = []
      BrowserWindow.getAllWindows()[0].webContents.startDrag = ({ file }) => {
        files.push(file)
      }
      return files
    },
  )
  try {
    const file = await realpath(path.join(kiter.samples, 'kick.wav'))
    const expectedDrags: string[] = []
    const row = library.row('kick.wav')
    for (const surface of [
      row.getByTestId('sample-name'),
      row.getByRole('img', { name: 'Waveform of kick.wav', exact: true }),
    ]) {
      await expect(surface).toBeVisible()
      await surface.scrollIntoViewIfNeeded()
      const rect = await surface.boundingBox()
      if (!rect) {
        throw new Error('The audio drag surface is unavailable.')
      }
      const x = rect.x + rect.width / 3
      const y = rect.y + rect.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      try {
        await page.mouse.move(x + 80, y, { steps: 10 })
        // Release outside the source so a canceled native drag cannot preview it.
        await page.mouse.move(x, 20, { steps: 5 })
      } finally {
        await page.mouse.up()
      }
      expectedDrags.push(file)
      await expect.poll(() => nativeDrags.jsonValue()).toEqual(expectedDrags)
    }
    // Duration is reported to the row after decoding; do not infer it from the canvas.
    await expect(row.getByTestId('sample-duration')).toHaveText('8.00 s')
    await page
      .getByRole('button', { name: 'Clear search', exact: true })
      .click()
    await expect(page.getByTestId('sample-name')).toHaveText([
      'kick.wav',
      'snare.wav',
    ])
    await expect(page.locator('audio')).not.toHaveAttribute('src')
  } finally {
    await nativeDrags.dispose()
  }
})

test('a Collection handle drop saves the new order and keeps the moved Sample selected and focused', async ({
  kiter,
}) => {
  const page = kiter.page
  const library = new LibraryPage(page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await expect(page.getByTestId('sample-name')).toHaveCount(2)
  await seedCollection(page, 'Manual order', ['kick.wav', 'snare.wav'])
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await page
    .getByRole('link', { name: 'Open Manual order', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Manual order', exact: true }),
  ).toBeFocused()
  await expect(page.getByTestId('sample-name')).toHaveText([
    'kick.wav',
    'snare.wav',
  ])

  const moving = library.row('snare.wav')
  const target = library.row('kick.wav')
  const handle = moving.getByRole('button', {
    name: 'Reorder snare.wav',
    exact: true,
  })
  await expect(handle).toBeEnabled()
  // Native HTML dragging needs a second movement over the destination to deliver
  // dragover consistently. Observe the application's insertion marker before
  // releasing, rather than waiting ten seconds after an unaccepted drop.
  await handle.hover()
  await page.mouse.down()
  try {
    await target.hover({ position: { x: 16, y: 8 } })
    await target.hover({ position: { x: 18, y: 8 } })
    await expect(target).toHaveAttribute('data-order-drop', 'before')
  } finally {
    await page.mouse.up()
  }
  await expect(page.getByTestId('sample-name')).toHaveText([
    'snare.wav',
    'kick.wav',
  ])
  await expect(moving).toHaveAttribute('aria-selected', 'true')
  await expect(moving).toBeFocused()
  await expect(page.locator('audio')).not.toHaveAttribute('src')

  // A fresh navigation reads the saved worker/SQLite order, not just local rows.
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Home', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await page
    .getByRole('link', { name: 'Open Manual order', exact: true })
    .click()
  await expect(page.getByTestId('sample-name')).toHaveText([
    'snare.wav',
    'kick.wav',
  ])
})
