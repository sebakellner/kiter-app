import { test, expect } from './fixtures'
import { LibraryPage } from './pages/library-page'
import { writeFile, rename, realpath, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createWav } from '../support/fixtures/wav.mjs'

test('manual category popover protects drafts, corrects suggestions and persists after restart', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
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
  // Seed a second available category through the real bridge; assignment is UI-driven.
  const created = await kiter.page.evaluate(() =>
    window.api.categories.create({ name: 'Snare' }),
  )
  expect(created.ok).toBe(true)
  const edit = inspector.getByRole('button', {
    name: 'Edit categories',
    exact: true,
  })
  await edit.click()
  const popover = kiter.page.getByRole('dialog', { name: 'Edit categories' })
  await expect(
    popover.getByRole('searchbox', { name: 'Search categories' }),
  ).toBeFocused()
  await popover.getByRole('checkbox', { name: 'Kick', exact: true }).uncheck()
  await popover.getByRole('searchbox', { name: 'Search categories' }).fill('sn')
  await popover.getByRole('checkbox', { name: 'Snare', exact: true }).check()
  await kiter.page.keyboard.press('Escape')
  await expect(
    popover.getByRole('button', { name: 'Stay', exact: true }),
  ).toBeVisible()
  await popover.getByRole('button', { name: 'Stay', exact: true }).click()
  await expect(
    popover.getByRole('checkbox', { name: 'Snare', exact: true }),
  ).toBeChecked()
  // Native close must offer the same draft protection rather than destroying the window.
  await kiter.application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close()
  })
  await expect(
    popover.getByRole('button', { name: 'Save and quit', exact: true }),
  ).toBeVisible()
  await popover.getByRole('button', { name: 'Stay', exact: true }).click()
  await popover.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(popover).toHaveCount(0)
  await expect(edit).toBeFocused()
  await expect(
    inspector.getByRole('region', { name: 'category', exact: true }),
  ).toContainText('Snare')
  await expect(
    inspector.getByRole('button', { name: 'Apply Kick', exact: true }),
  ).toBeEnabled()
  await expect(kiter.page.locator('audio')).not.toHaveAttribute('src')
  await kiter.restart()
  await kiter.page.getByRole('link', { name: 'Samples', exact: true }).click()
  const restartedLibrary = new LibraryPage(kiter.page)
  await restartedLibrary
    .row('kick.wav')
    .getByRole('button', { name: 'Info: kick.wav', exact: true })
    .click()
  const restartedInspector = kiter.page.getByRole('complementary', {
    name: 'Sample info',
  })
  const restartedEdit = restartedInspector.getByRole('button', {
    name: 'Edit categories',
    exact: true,
  })
  const restartedPopover = kiter.page.getByRole('dialog', {
    name: 'Edit categories',
  })
  await expect(
    restartedInspector.getByRole('region', { name: 'category', exact: true }),
  ).toContainText('Snare')
  await restartedEdit.click()
  await kiter.page.setViewportSize({ width: 900, height: 700 })
  await restartedPopover
    .getByRole('searchbox', { name: 'Search categories' })
    .focus()
  await kiter.page.keyboard.press('Tab')
  await expect(
    restartedPopover.getByRole('checkbox', { name: 'Kick', exact: true }),
  ).toBeFocused()
  await restartedPopover
    .getByRole('button', { name: 'Remove Snare', exact: true })
    .click()
  await restartedPopover
    .getByRole('button', { name: 'Save', exact: true })
    .click()
  await expect(restartedPopover).toHaveCount(0)
  await restartedEdit.click()
  await expect(
    restartedPopover.getByRole('checkbox', { name: 'Snare', exact: true }),
  ).not.toBeChecked()
  await restartedPopover
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  expect(await readFile(path.join(kiter.samples, 'kick.wav'))).toEqual(
    createWav(8),
  )
})

test('Sample classification suggests automatically and persists explicit application without changing playback', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'Info: kick.wav', exact: true })
    .click()
  const inspector = kiter.page.getByRole('complementary', {
    name: 'Sample info',
  })
  await expect(
    inspector.getByRole('button', { name: 'Apply Kick', exact: true }),
  ).toBeEnabled()
  await inspector.getByText('Why these suggestions?', { exact: true }).click()
  await expect(
    inspector.getByRole('list', { name: 'Classification evidence' }),
  ).toContainText('Kick')
  await expect(
    inspector.getByRole('heading', { name: 'Categories', exact: true }),
  ).toBeVisible()
  await expect(inspector).toContainText('Creates Kick when applied.')
  await expect(inspector).toContainText('Cataloged location:')
  await expect(inspector).toContainText('Matched clue: kick (name)')
  await inspector
    .getByRole('button', { name: 'Apply Kick', exact: true })
    .click()
  await expect(inspector).toContainText('Classifications saved.')
  await expect(
    inspector.getByRole('button', { name: 'Apply Kick', exact: true }),
  ).toHaveCount(0)
  await inspector.getByRole('button', { name: 'Close inspector' }).click()
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'Info: kick.wav', exact: true })
    .click()
  await expect(
    inspector.getByRole('region', { name: 'category', exact: true }),
  ).toContainText('Kick')
  await expect(kiter.page.locator('audio')).not.toHaveAttribute('src')
  const categories = await kiter.page.evaluate(() =>
    window.api.categories.list(),
  )
  expect(categories.ok).toBe(true)
  if (categories.ok) {
    expect(categories.data.total).toBe(1)
  }
  const invalid = await kiter.page.evaluate(() =>
    window.api.classification.prepareSample({
      sampleId: '/arbitrary/file.wav',
    }),
  )
  expect(invalid).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
})

test('history restores distinct Samples contexts and sidebar uses the latest destination context', async ({
  kiter,
}) => {
  for (let index = 0; index < 53; index++) {
    await writeFile(
      path.join(kiter.empty, `sample-${String(index).padStart(2, '0')}.wav`),
      createWav(0.1),
    )
  }
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.empty)
  await library.openFolder()
  const first = library.row('sample-10.wav')
  await first
    .getByRole('button', { name: 'Info: sample-10.wav', exact: true })
    .click()
  const main = kiter.page.locator('#main-content')
  await main.evaluate((element) => {
    element.scrollTop = 400
  })
  await expect
    .poll(() => main.evaluate((element) => element.scrollTop))
    .toBe(400)
  const inspector = kiter.page.getByRole('complementary', {
    name: 'Sample info',
  })
  await kiter.page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(inspector).toHaveCount(0)
  await kiter.page.getByRole('link', { name: 'Samples', exact: true }).click()
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await expect(first).toBeFocused()
  await expect(inspector).toContainText('sample-10.wav')
  await expect
    .poll(() => main.evaluate((element) => element.scrollTop))
    .toBe(400)
  await kiter.page
    .getByRole('button', { name: 'Next page', exact: true })
    .click()
  await expect(kiter.page.getByTestId('sample-name')).toHaveCount(3)
  const last = library.row('sample-51.wav')
  await last.click({ position: { x: 5, y: 5 } })
  await inspector.getByRole('button', { name: 'Close inspector' }).click()
  await kiter.page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(
    kiter.page.getByRole('heading', { name: 'Home', exact: true }),
  ).toBeVisible()
  await kiter.page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(kiter.page.getByTestId('sample-name')).toHaveCount(50)
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await expect(first).toBeFocused()
  await expect(inspector).toContainText('sample-10.wav')
  await expect
    .poll(() => main.evaluate((element) => element.scrollTop))
    .toBe(400)
  await kiter.page.getByRole('button', { name: 'Forward', exact: true }).click()
  await kiter.page.getByRole('button', { name: 'Forward', exact: true }).click()
  await expect(kiter.page.getByTestId('sample-name')).toHaveCount(3)
  await expect(last).toHaveAttribute('aria-selected', 'true')
  await expect(last).toBeFocused()
  await expect(inspector).toHaveCount(0)
  await kiter.page.getByRole('checkbox', { name: 'Favorites only' }).check()
  await expect(kiter.page.getByRole('row')).toHaveCount(0)
  await kiter.page.getByRole('button', { name: 'Back', exact: true }).click()
  await kiter.page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(
    kiter.page.getByRole('checkbox', { name: 'Favorites only' }),
  ).not.toBeChecked()
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await kiter.page.getByRole('button', { name: 'Forward', exact: true }).click()
  await kiter.page.getByRole('button', { name: 'Forward', exact: true }).click()
  await expect(
    kiter.page.getByRole('checkbox', { name: 'Favorites only' }),
  ).toBeChecked()
  await expect(kiter.page.getByRole('row')).toHaveCount(0)
})

test('restart clears navigation context while preserving catalog and Favorites', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await library.row('kick.wav').getByTestId('favorite-toggle').click()
  await kiter.page.getByRole('checkbox', { name: 'Favorites only' }).check()
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'Info: kick.wav', exact: true })
    .click()
  await expect(
    kiter.page.getByRole('complementary', { name: 'Sample info' }),
  ).toContainText('kick.wav')
  await kiter.restart()
  await expect(
    kiter.page.getByRole('heading', { name: 'Home', exact: true }),
  ).toBeVisible()
  await kiter.page.getByRole('link', { name: 'Samples', exact: true }).click()
  await expect(kiter.page.getByTestId('sample-name')).toHaveText([
    'kick.wav',
    'snare.wav',
  ])
  await expect(
    kiter.page.locator('[role="row"][aria-selected="true"]'),
  ).toHaveCount(0)
  await expect(
    kiter.page.getByRole('complementary', { name: 'Sample info' }),
  ).toHaveCount(0)
  await expect(
    kiter.page.getByRole('checkbox', { name: 'Favorites only' }),
  ).not.toBeChecked()
  await expect(
    new LibraryPage(kiter.page).row('kick.wav').getByTestId('favorite-toggle'),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('quit closes renderer windows before completing application shutdown', async ({
  kiter,
}) => {
  const observationPath = path.join(kiter.empty, 'quit-windows.txt')
  await kiter.application.evaluate(({ app, BrowserWindow }, filePath) => {
    const { writeFileSync } = process.getBuiltinModule('node:fs')
    // Persist before exit; the debugger may disconnect before evaluate resolves.
    app.once('will-quit', () => {
      writeFileSync(filePath, String(BrowserWindow.getAllWindows().length))
    })
  }, observationPath)

  await kiter.restart()

  expect(await readFile(observationPath, 'utf8')).toBe('0')
  await expect(
    kiter.page.getByRole('heading', { name: 'Home', exact: true }),
  ).toBeVisible()
})

test('history restores a compact inspector without focusing covered content', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await library
    .row('snare.wav')
    .getByRole('button', { name: 'Info: snare.wav', exact: true })
    .click()
  await kiter.page.getByRole('link', { name: 'Home', exact: true }).click()
  await kiter.application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(900, 650),
  )
  await kiter.page.getByRole('button', { name: 'Back', exact: true }).click()
  const inspector = kiter.page.getByRole('complementary', {
    name: 'Sample info',
  })
  await expect(inspector).toContainText('snare.wav')
  await expect(inspector).toBeFocused()
  await expect(kiter.page.locator('#main-content')).toHaveAttribute('inert', '')
  await inspector.press('Escape')
  await expect(inspector).toHaveCount(0)
  await expect(library.row('snare.wav')).toBeFocused()
  await expect(library.row('snare.wav')).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('restoring Favorites revalidates selection and leaves an open inspector empty', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  const kick = library.row('kick.wav')
  await kick.getByTestId('favorite-toggle').click()
  await kiter.page.getByRole('link', { name: 'Favorites', exact: true }).click()
  await kick
    .getByRole('button', { name: 'Info: kick.wav', exact: true })
    .click()
  await kiter.page.getByRole('link', { name: 'Samples', exact: true }).click()
  await kick.getByTestId('favorite-toggle').click()
  await kiter.page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(kiter.page.getByRole('row')).toHaveCount(0)
  await expect(
    kiter.page.getByRole('complementary', { name: 'Sample info' }),
  ).toContainText('Select a sample to see its information.')
  await expect(
    kiter.page.getByRole('heading', { name: 'Favorites', exact: true }),
  ).toBeFocused()
})

test('read-only inspector follows selection, clears hidden rows and restores focus without interrupting preview', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  const kick = library.row('kick.wav')
  const snare = library.row('snare.wav')
  await kick.click({ position: { x: 5, y: 5 } })
  const inspector = kiter.page.getByRole('complementary', {
    name: 'Sample info',
  })
  await expect(inspector).toHaveCount(0)
  const info = kick.getByRole('button', { name: 'Info: kick.wav', exact: true })
  await info.click()
  await expect(kick).toBeFocused()
  await kick.press('ArrowDown')
  await expect(snare).toBeFocused()
  await expect(inspector).toContainText('snare.wav')
  await snare.press('ArrowUp')
  await expect(kick).toBeFocused()
  await kick.press('F6')
  await expect(
    inspector.getByRole('button', { name: 'Close inspector' }),
  ).toBeFocused()
  await kiter.page.keyboard.press('F6')
  await expect(
    kiter.page.getByRole('region', { name: 'Global player' }).locator('audio'),
  ).toBeFocused()
  await kiter.page.keyboard.press('F6')
  await expect(
    kiter.page.getByRole('button', { name: 'Back', exact: true }),
  ).toBeFocused()
  await kiter.page.keyboard.press('F6')
  await expect(
    kiter.page.getByRole('link', { name: 'Samples', exact: true }),
  ).toBeFocused()
  await kiter.page.keyboard.press('F6')
  await expect(kick).toBeFocused()
  await kick.press('F6')
  await kiter.page.keyboard.press('Shift+F6')
  await expect(kick).toBeFocused()
  await expect(inspector).toContainText('kick.wav')
  await expect(inspector).toContainText(
    await realpath(path.join(kiter.samples, 'kick.wav')),
  )
  await expect(inspector.getByRole('textbox')).toHaveCount(0)
  await kick.getByTestId('sample-name').click()
  const player = kiter.page.locator('audio')
  await expect
    .poll(() =>
      player.evaluate(
        (audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0,
      ),
    )
    .toBe(true)
  const url = await player.getAttribute('src')
  await snare.click({ position: { x: 5, y: 5 } })
  await expect(inspector).toContainText('snare.wav')
  await expect(inspector).not.toContainText('kick.wav')
  await expect(player).toHaveAttribute('src', url!)
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => !audio.paused))
    .toBe(true)
  await inspector.getByRole('button', { name: 'Close inspector' }).click()
  await expect(snare).toBeFocused()
  await expect(snare).toHaveAttribute('aria-selected', 'true')
  const snareInfo = snare.getByRole('button', {
    name: 'Info: snare.wav',
    exact: true,
  })
  await snareInfo.click()
  await expect(snare).toHaveAttribute('aria-selected', 'true')
  await kiter.page.getByRole('checkbox', { name: 'Favorites only' }).check()
  await expect(inspector).toContainText(
    'Select a sample to see its information.',
  )
  await expect(kiter.page.getByRole('row')).toHaveCount(0)
  await expect(
    kiter.page.getByRole('checkbox', { name: 'Favorites only' }),
  ).toBeFocused()
  await inspector.press('Escape')
  await expect(inspector).toHaveCount(0)
  await expect(kiter.page.locator('#main-content')).toBeFocused()
})

test('compact inspector blocks covered regions, keeps the player available and consumes outside clicks', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await library.row('kick.wav').getByTestId('sample-name').click()
  await kiter.application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(900, 650),
  )
  const info = library
    .row('snare.wav')
    .getByRole('button', { name: 'Info: snare.wav', exact: true })
  await info.click()
  const inspector = kiter.page.getByRole('complementary', {
    name: 'Sample info',
  })
  await expect(inspector).toBeFocused()
  await expect(inspector).toContainText('snare.wav')
  await expect(library.row('snare.wav')).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(kiter.page.locator('#main-content')).toHaveAttribute('inert', '')
  const close = inspector.getByRole('button', { name: 'Close inspector' })
  await inspector.press('F6')
  await expect(
    kiter.page.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeFocused()
  await kiter.page.keyboard.press('F6')
  await expect(close).toBeFocused()
  await kiter.page.keyboard.press('Shift+F6')
  await expect(
    kiter.page.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeFocused()
  await close.focus()
  await expect(
    inspector.getByRole('button', { name: 'Apply Snare', exact: true }),
  ).toBeEnabled()
  await kiter.page.keyboard.press('Tab')
  await expect(
    inspector.getByRole('button', { name: 'Edit categories', exact: true }),
  ).toBeFocused()
  await kiter.page.keyboard.press('Tab')
  await expect(
    inspector.getByRole('button', { name: 'Apply Snare', exact: true }),
  ).toBeFocused()
  await kiter.page.keyboard.press('Tab')
  await expect(
    inspector.getByText('Why these suggestions?', { exact: true }),
  ).toBeFocused()
  await kiter.page.keyboard.press('Tab')
  await expect(
    kiter.page.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeFocused()
  await kiter.page.keyboard.press('Shift+Tab')
  await expect(
    inspector.getByText('Why these suggestions?', { exact: true }),
  ).toBeFocused()
  await kiter.page.keyboard.press('Shift+Tab')
  await expect(
    inspector.getByRole('button', { name: 'Apply Snare', exact: true }),
  ).toBeFocused()
  await kiter.page.keyboard.press('Shift+Tab')
  await expect(
    inspector.getByRole('button', { name: 'Edit categories', exact: true }),
  ).toBeFocused()
  await kiter.page.keyboard.press('Shift+Tab')
  await expect(close).toBeFocused()
  await kiter.page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(inspector).toBeVisible()
  await expect
    .poll(() =>
      kiter.page
        .locator('audio')
        .evaluate(
          (audio: HTMLAudioElement) => audio.paused && audio.currentTime === 0,
        ),
    )
    .toBe(true)
  // Click the exposed workspace outside the overlay, consuming the dismissal gesture.
  await kiter.page.mouse.click(220, 150)
  await expect(inspector).toHaveCount(0)
  await expect(library.row('snare.wav')).toBeFocused()
  await expect(library.row('kick.wav')).toHaveAttribute(
    'aria-selected',
    'false',
  )
  await expect(library.row('snare.wav')).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(kiter.page.locator('#main-content')).not.toHaveAttribute(
    'inert',
    '',
  )
})

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
      .getByRole('button', { name: 'Pause snare.wav', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    library
      .row('kick.wav')
      .getByRole('button', { name: 'Play kick.wav', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  await expect(player).toHaveCount(1)
  await kiter.page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect
    .poll(() =>
      player.evaluate((audio: HTMLAudioElement) => ({
        paused: audio.paused,
        time: audio.currentTime,
      })),
    )
    .toEqual({ paused: true, time: 0 })
})

test('Samples and Favorites select independently of playback and keyboard preview resumes in place', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  const kick = library.row('kick.wav')
  const snare = library.row('snare.wav')
  const player = kiter.page.locator('audio')
  await kick.getByTestId('sample-name').click()
  await expect
    .poll(() =>
      player.evaluate(
        (audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0,
      ),
    )
    .toBe(true)
  const url = await player.getAttribute('src')
  await snare.click({ position: { x: 5, y: 5 } })
  await expect(snare).toHaveAttribute('aria-selected', 'true')
  await expect(kick).toHaveAttribute('aria-selected', 'false')
  await expect(player).toHaveAttribute('src', url!)
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => !audio.paused))
    .toBe(true)

  await snare.press('Space')
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(true)
  const pausedTime = await player.evaluate(
    (audio: HTMLAudioElement) => audio.currentTime,
  )
  expect(pausedTime).toBeGreaterThan(0)
  await snare.press('Space')
  await expect
    .poll(() =>
      player.evaluate(
        (audio: HTMLAudioElement, time) =>
          !audio.paused && audio.currentTime >= time,
        pausedTime,
      ),
    )
    .toBe(true)
  await expect(player).toHaveAttribute('src', url!)
  await snare.press('Enter')
  await expect(snare.getByTestId('preview-toggle')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await snare.press('ArrowUp')
  await expect(kick).toBeFocused()
  await expect(kick).toHaveAttribute('aria-selected', 'true')
  await expect(snare.getByTestId('preview-toggle')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await kick.getByTestId('favorite-toggle').click()
  await expect(kick.getByTestId('favorite-toggle')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(kick).toHaveAttribute('aria-selected', 'true')
  await kiter.page.getByRole('link', { name: 'Favorites', exact: true }).click()
  await expect(kick).toHaveAttribute('aria-selected', 'false')
  await kick.click({ position: { x: 5, y: 5 } })
  await expect(kick).toHaveAttribute('aria-selected', 'true')
  await expect(kick.getByTestId('preview-toggle')).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await kick.getByTestId('favorite-toggle').click()
  await expect(kiter.page.getByRole('row')).toHaveCount(0)
})
