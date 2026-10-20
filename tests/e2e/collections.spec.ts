import { test, expect } from './fixtures'
import { seedCollection } from '../support/electron/catalog'
import { LibraryPage } from './pages/library-page'

test('Collection editing saves through the real bridge and survives a process restart', async ({
  kiter,
}) => {
  const page = kiter.page
  await seedCollection(page, 'Original Collection', [])
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await page
    .getByRole('link', { name: 'Open Original Collection', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Edit Collection', exact: true })
    .click()
  const editor = page.getByRole('dialog', { name: 'Edit Collection' })
  await editor
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Renamed Collection')
  await editor
    .getByRole('textbox', { name: 'Description (optional)', exact: true })
    .fill('Session textures')
  await page.keyboard.press('Escape')
  await expect(
    editor.getByRole('button', { name: 'Save and close' }),
  ).toBeVisible()
  await editor.getByRole('button', { name: 'Stay', exact: true }).click()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Renamed Collection', level: 1 }),
  ).toBeVisible()
  await kiter.restart()
  await kiter.page
    .getByRole('link', { name: 'Collections', exact: true })
    .click()
  await kiter.page
    .getByRole('link', { name: 'Open Renamed Collection', exact: true })
    .click()
  await expect(
    kiter.page.getByText('Session textures', { exact: true }),
  ).toBeVisible()
})

test('reviewed Collection deletion preserves playing audio, Favorites and other memberships after restart', async ({
  kiter,
}) => {
  const page = kiter.page
  const library = new LibraryPage(page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  await expect(page.getByTestId('sample-name')).toHaveCount(2)
  await seedCollection(page, 'Delete these picks', ['kick.wav'])
  await seedCollection(page, 'Keep these picks', ['kick.wav'])
  await library
    .row('kick.wav')
    .getByRole('button', { name: /favorite/i })
    .click()
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await page
    .getByRole('link', { name: 'Open Delete these picks', exact: true })
    .click()
  const identity = await library.row('kick.wav').getAttribute('data-sample-id')
  await library
    .row('kick.wav')
    .getByRole('button', { name: 'Play kick.wav', exact: true })
    .click()
  await expect
    .poll(() =>
      page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused),
    )
    .toBe(false)
  const source = await page.locator('audio').getAttribute('src')
  await page
    .getByRole('button', { name: 'Delete Collection', exact: true })
    .click()
  const alert = page.getByRole('alertdialog', { name: 'Delete Collection?' })
  await expect(
    alert.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeFocused()
  await expect(alert).toContainText('1 Sample reference')
  await alert.getByText('View Sample references', { exact: true }).click()
  await expect(
    alert.getByRole('region', { name: 'Sample references' }),
  ).toContainText('kick.wav')
  await alert
    .getByRole('button', { name: 'Delete Collection', exact: true })
    .click()
  await expect(alert).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Collections', level: 1 }),
  ).toBeVisible()
  await expect(page.locator('audio')).toHaveAttribute('src', source!)
  await expect
    .poll(() =>
      page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused),
    )
    .toBe(false)
  await kiter.restart()
  await kiter.page
    .getByRole('link', { name: 'Collections', exact: true })
    .click()
  await expect(
    kiter.page.getByRole('link', {
      name: 'Open Delete these picks',
      exact: true,
    }),
  ).toHaveCount(0)
  await kiter.page
    .getByRole('link', { name: 'Open Keep these picks', exact: true })
    .click()
  const row = new LibraryPage(kiter.page).row('kick.wav')
  await expect(row).toHaveAttribute('data-sample-id', identity!)
  await expect(
    row.getByRole('button', { name: /remove.*favorite/i }),
  ).toBeVisible()
})

test('Escape followed by a backdrop click preserves draft review and discard releases native modality', async ({
  kiter,
}) => {
  const page = kiter.page
  await seedCollection(page, 'Existing Collection', [])
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await page
    .getByRole('button', { name: 'Create Collection', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Create Collection' })
  await dialog
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Protected draft')
  const viewport = await page.locator('body').boundingBox()
  if (!viewport) {
    throw new Error('The application viewport is unavailable.')
  }
  // Repetition is the regression: Chromium can make later native Escape
  // requests non-cancelable. jsdom cannot establish that modal behavior.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.keyboard.press('Escape')
    await expect(
      dialog.getByRole('button', { name: 'Stay', exact: true }),
    ).toBeVisible()
    await page.mouse.click(
      viewport.x + viewport.width - 4,
      viewport.y + viewport.height - 4,
    )
    await expect(dialog).toBeVisible()
  }
  await expect(
    dialog.getByRole('textbox', { name: 'Name', exact: true }),
  ).toHaveValue('Protected draft')
  await expect(
    dialog.getByRole('button', { name: 'Stay', exact: true }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Stay', exact: true }).click()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await dialog
    .getByRole('button', { name: 'Discard changes', exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  await page
    .getByRole('link', { name: 'Open Existing Collection', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Existing Collection', level: 1 }),
  ).toBeVisible()
})

test('a native close request protects a Collection draft and staying allows creation through the real bridge', async ({
  kiter,
}) => {
  const page = kiter.page
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await page
    .getByRole('button', { name: 'Create Collection', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Create Collection' })
  const name = dialog.getByRole('textbox', { name: 'Name', exact: true })
  await name.fill('Protected draft')
  await kiter.application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close()
  })
  await expect(
    dialog.getByRole('button', { name: 'Save and quit' }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Stay', exact: true }).click()
  await expect(name).toHaveValue('Protected draft')
  await name.press(
    process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter',
  )
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Protected draft', level: 1 }),
  ).toBeFocused()
  await expect(
    page.getByText('This Collection is empty.', { exact: false }),
  ).toBeVisible()
})
