import { test, expect } from './fixtures'
import { LibraryPage } from './pages/library-page'
import { writeFile, realpath, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createWav } from '../support/fixtures/wav.mjs'
import { seedClassifiedSample } from '../support/electron/catalog'

test('narrow Name cells keep the full accessible filename and badges on one line each without expanding rows', async ({
  kiter,
}) => {
  const name =
    'Deep_Kick_with_a_long_filename_that_must_not_wrap_in_a_narrow_table.wav'
  await writeFile(path.join(kiter.empty, name), createWav(0.1))
  await writeFile(path.join(kiter.empty, 'short.wav'), createWav(0.1))
  const page = kiter.page
  const library = new LibraryPage(page)
  await kiter.selectFolder(kiter.empty)
  await library.openFolder()
  await expect(page.getByTestId('sample-name')).toHaveCount(2)
  await seedClassifiedSample(page, name)
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  const row = library.row(name)
  const categories = row.getByRole('list', { name: 'Sample categories' })
  await expect(categories.getByRole('listitem')).toHaveCount(3)
  await kiter.application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(900, 680),
  )
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(900)
  await expect(page.getByTestId('sample-duration')).toHaveCount(2)

  const layout = await row.evaluate((element) => {
    const filename = element.querySelector<HTMLElement>(
      '[data-testid="sample-name"]',
    )
    const badges = element.querySelector<HTMLElement>(
      '[aria-label="Sample categories"]',
    )
    if (!filename || !badges) {
      throw new Error(
        'The Sample must expose its filename and saved categories.',
      )
    }
    const text = document.createRange()
    text.selectNodeContents(filename)
    const badgeTops = Array.from(
      badges.children,
      (badge) => badge.getBoundingClientRect().top,
    )
    return {
      filenameLines: new Set(
        Array.from(text.getClientRects(), (rect) => Math.round(rect.top)),
      ).size,
      filenameClipped: filename.scrollWidth > filename.clientWidth,
      badgesClipped: badges.scrollWidth > badges.clientWidth,
      badgeLineSpread: Math.max(...badgeTops) - Math.min(...badgeTops),
      rowHeight: element.getBoundingClientRect().height,
    }
  })
  expect(layout.filenameLines).toBe(1)
  expect(layout.filenameClipped).toBe(true)
  expect(layout.badgesClipped).toBe(true)
  expect(layout.badgeLineSpread).toBeLessThan(1)
  const shortHeight = await library
    .row('short.wav')
    .evaluate((element) => element.getBoundingClientRect().height)
  expect(layout.rowHeight).toBe(shortHeight)
  await expect(
    row.getByRole('button', { name: `Preview ${name}`, exact: true }),
  ).toHaveAttribute('title', name)
  await library.inspect(name)
  await expect(
    page.getByRole('complementary', { name: 'Sample info' }),
  ).toContainText(name)
})

test('saving a manual Sample type overrides suggestions and Unknown allows fresh proposals', async ({
  kiter,
}) => {
  await writeFile(path.join(kiter.empty, 'kick_loop.wav'), createWav(0.1))
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.empty)
  await library.openFolder()
  await library.inspect('kick_loop.wav')
  const inspector = kiter.page.getByRole('complementary', {
    name: 'Sample info',
  })
  await inspector
    .getByRole('button', { name: 'Apply Loop', exact: true })
    .click()
  await expect(inspector).toContainText('Classifications saved.')
  await inspector
    .getByRole('button', { name: 'Edit Sample type', exact: true })
    .click()
  let editor = kiter.page.getByRole('dialog', {
    name: 'Edit Sample type',
    exact: true,
  })
  await expect(
    editor.getByRole('combobox', { name: 'Sample type' }),
  ).toHaveValue('loop')
  await editor
    .getByRole('combobox', { name: 'Sample type' })
    .selectOption('one-shot')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(
    inspector.getByRole('button', { name: 'Edit Sample type', exact: true }),
  ).toBeFocused()
  await expect(
    inspector.getByRole('region', { name: 'sample-type', exact: true }),
  ).toContainText('One Shot')
  await expect(
    inspector.getByRole('button', { name: 'Apply Loop', exact: true }),
  ).toHaveCount(0)
  await inspector
    .getByRole('button', { name: 'Edit Sample type', exact: true })
    .click()
  editor = kiter.page.getByRole('dialog', {
    name: 'Edit Sample type',
    exact: true,
  })
  await editor
    .getByRole('combobox', { name: 'Sample type' })
    .selectOption('unknown')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(
    inspector.getByRole('button', { name: 'Apply Loop', exact: true }),
  ).toBeEnabled()
  await expect(kiter.page.locator('audio')).not.toHaveAttribute('src')
  expect(await readFile(path.join(kiter.empty, 'kick_loop.wav'))).toEqual(
    createWav(0.1),
  )
})

test('the Genre editor saves and clears assignments without changing other Sample organization', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await expect(kiter.page.getByTestId('sample-name')).toHaveCount(2)
  await seedClassifiedSample(kiter.page, 'kick.wav')
  await library.inspect('kick.wav')
  const inspector = kiter.page.getByRole('complementary', {
    name: 'Sample info',
  })
  await inspector
    .getByRole('button', { name: 'Edit genres', exact: true })
    .click()
  let editor = kiter.page.getByRole('dialog', {
    name: 'Edit genres',
    exact: true,
  })
  await editor.getByRole('searchbox', { name: 'Search genres' }).fill('house')
  await editor.getByRole('checkbox', { name: 'House', exact: true }).check()
  await editor
    .getByRole('checkbox', { name: 'Tech House', exact: true })
    .check()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(
    inspector.getByRole('button', { name: 'Edit genres', exact: true }),
  ).toBeFocused()
  await expect(
    inspector.getByRole('region', { name: 'genre', exact: true }),
  ).toContainText('House')
  await expect(
    inspector.getByRole('region', { name: 'instrument', exact: true }),
  ).toContainText('Kick')
  await expect(kiter.page.locator('audio')).not.toHaveAttribute('src')
  await expect(
    inspector.getByRole('region', { name: 'genre', exact: true }),
  ).toContainText('Tech House')
  await inspector
    .getByRole('button', { name: 'Edit genres', exact: true })
    .click()
  editor = kiter.page.getByRole('dialog', { name: 'Edit genres', exact: true })
  await editor
    .getByRole('button', { name: 'Remove House', exact: true })
    .click()
  await editor
    .getByRole('button', { name: 'Remove Tech House', exact: true })
    .click()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(
    inspector.getByRole('region', { name: 'genre', exact: true }),
  ).toHaveCount(0)
  await expect(
    inspector.getByRole('region', { name: 'instrument', exact: true }),
  ).toContainText('Kick')
  await kiter.page.getByRole('link', { name: 'Favorites', exact: true }).click()
  await expect(kiter.page.getByTestId('sample-name')).toHaveText(['kick.wav'])
})

test('manual instrument popover protects drafts, corrects suggestions and persists after restart', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await library.inspect('kick.wav')
  const inspector = kiter.page.getByRole('complementary', {
    name: 'Sample info',
  })
  await inspector
    .getByRole('button', { name: 'Apply Kick', exact: true })
    .click()
  await expect(inspector).toContainText('Classifications saved.')
  // Seed a second available instrument through the real bridge; assignment is UI-driven.
  const created = await kiter.page.evaluate(() =>
    window.api.instruments.create({ name: 'Snare' }),
  )
  expect(created.ok).toBe(true)
  const edit = inspector.getByRole('button', {
    name: 'Edit instruments',
    exact: true,
  })
  await edit.click()
  const popover = kiter.page.getByRole('dialog', { name: 'Edit instruments' })
  await expect(
    popover.getByRole('searchbox', { name: 'Search instruments' }),
  ).toBeFocused()
  await popover.getByRole('checkbox', { name: 'Kick', exact: true }).uncheck()
  await popover
    .getByRole('searchbox', { name: 'Search instruments' })
    .fill('sn')
  await popover.getByRole('checkbox', { name: 'Snare', exact: true }).check()
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
    inspector.getByRole('region', { name: 'instrument', exact: true }),
  ).toContainText('Snare')
  await expect(
    inspector.getByRole('button', { name: 'Apply Kick', exact: true }),
  ).toBeEnabled()
  await expect(kiter.page.locator('audio')).not.toHaveAttribute('src')
  await kiter.restart()
  await kiter.page.getByRole('link', { name: 'Samples', exact: true }).click()
  const restartedLibrary = new LibraryPage(kiter.page)
  await restartedLibrary.inspect('kick.wav')
  const restartedInspector = kiter.page.getByRole('complementary', {
    name: 'Sample info',
  })
  await expect(
    restartedInspector.getByRole('region', { name: 'instrument', exact: true }),
  ).toContainText('Snare')
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
  await library.inspect('sample-10.wav')
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

test('Favorite feedback survives navigation and restart preserves saved marks without navigation context', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await library.row('kick.wav').getByTestId('favorite-toggle').click()
  const notifications = kiter.page.getByRole('region', {
    name: 'Notifications',
  })
  await expect(notifications.getByRole('status')).toHaveText(
    '“kick.wav” added to Favorites.',
  )
  await expect(
    notifications.getByRole('button', { name: /Dismiss notification/ }),
  ).not.toBeFocused()
  await kiter.page.getByRole('link', { name: 'Favorites', exact: true }).click()
  await expect(notifications.getByRole('status')).toHaveText(
    '“kick.wav” added to Favorites.',
  )
  await notifications
    .getByRole('button', { name: /Dismiss notification/ })
    .click()
  await expect(notifications.getByRole('status')).toHaveCount(0)
  await kiter.page.getByRole('link', { name: 'Samples', exact: true }).click()
  await kiter.page.getByRole('checkbox', { name: 'Favorites only' }).check()
  await library.inspect('kick.wav')
  await expect(
    kiter.page.getByRole('complementary', { name: 'Sample info' }),
  ).toContainText('kick.wav')
  const observationPath = path.join(kiter.empty, 'quit-windows.txt')
  await kiter.application.evaluate(({ app, BrowserWindow }, filePath) => {
    const { writeFileSync } = process.getBuiltinModule('node:fs')
    app.once('will-quit', () => {
      writeFileSync(filePath, String(BrowserWindow.getAllWindows().length))
    })
  }, observationPath)
  await kiter.restart()
  expect(await readFile(observationPath, 'utf8')).toBe('0')
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
  await new LibraryPage(kiter.page)
    .row('kick.wav')
    .getByTestId('favorite-toggle')
    .click()
  await expect(
    kiter.page
      .getByRole('region', { name: 'Notifications' })
      .getByRole('status'),
  ).toHaveText('“kick.wav” removed from Favorites.')
})

test('history restores a compact inspector without focusing covered content', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await library.inspect('snare.wav')
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
  await library.inspect('kick.wav')
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

test('the inspector follows selection, clears hidden rows and restores focus without interrupting preview', async ({
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
  await library.inspect('kick.wav')
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
  await library.inspect('snare.wav')
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
  await library.inspect('snare.wav')
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
    inspector.getByRole('button', { name: 'Edit instruments', exact: true }),
  ).toBeFocused()
  await kiter.page.keyboard.press('Tab')
  await expect(
    inspector.getByRole('button', { name: 'Edit genres', exact: true }),
  ).toBeFocused()
  await kiter.page.keyboard.press('Tab')
  await expect(
    inspector.getByRole('button', { name: 'Edit Sample type', exact: true }),
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
    inspector.getByRole('button', { name: 'Edit Sample type', exact: true }),
  ).toBeFocused()
  await kiter.page.keyboard.press('Shift+Tab')
  await expect(
    inspector.getByRole('button', { name: 'Edit genres', exact: true }),
  ).toBeFocused()
  await kiter.page.keyboard.press('Shift+Tab')
  await expect(
    inspector.getByRole('button', { name: 'Edit instruments', exact: true }),
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
