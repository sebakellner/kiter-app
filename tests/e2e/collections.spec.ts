import { test, expect } from './fixtures'
import { LibraryPage } from './pages/library-page'

test('Escape followed by a backdrop click keeps Collection draft review visible and releases the modal after discard', async ({
  kiter,
}) => {
  const page = kiter.page
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  const opener = page.getByRole('button', {
    name: 'Create Collection',
    exact: true,
  })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Create Collection' })
  await dialog
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Existing Collection')
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter',
  )
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'Collections' })
    .click()
  await opener.click()
  await dialog
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Protected draft')
  const viewport = await page.locator('body').boundingBox()
  if (!viewport) {
    throw new Error('The application viewport is unavailable.')
  }
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

test('Collections create empty persistent homonyms, protect drafts and open stable details without starting playback', async ({
  kiter,
}) => {
  const page = kiter.page
  await page.getByRole('link', { name: 'Collections', exact: true }).click()
  await expect(
    page.getByText('No Collections yet.', { exact: false }),
  ).toBeVisible()
  const opener = page.getByRole('button', {
    name: 'Create Collection',
    exact: true,
  })
  await opener.click()
  let dialog = page.getByRole('dialog', { name: 'Create Collection' })
  await expect(
    dialog.getByRole('textbox', { name: 'Name', exact: true }),
  ).toBeFocused()
  await dialog
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Discarded draft')
  await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: 'Stay', exact: true }).click()
  await expect(
    dialog.getByRole('textbox', { name: 'Name', exact: true }),
  ).toHaveValue('Discarded draft')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await dialog
    .getByRole('button', { name: 'Discard changes', exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
  await expect(page.getByRole('row')).toHaveCount(0)

  await opener.click()
  dialog = page.getByRole('dialog', { name: 'Create Collection' })
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('nonempty name')
  await dialog
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('  Session Picks  ')
  await dialog
    .getByRole('textbox', { name: 'Description (optional)' })
    .fill('First line\nSecond line')
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter',
  )
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Session Picks', level: 1 }),
  ).toBeFocused()
  await expect(
    page.getByText('First line\nSecond line', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('This Collection is empty.', { exact: false }),
  ).toBeVisible()
  const firstDetail = page.url()
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'Collections' })
    .click()
  const firstRow = page.getByRole('row')
  await expect(firstRow).toContainText('0 Samples')
  await expect(firstRow).toContainText('Collection ID:')
  await firstRow.getByRole('heading', { name: 'Session Picks' }).click()
  await expect(firstRow).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(firstDetail)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(firstRow).toBeFocused()

  await opener.click()
  dialog = page.getByRole('dialog', { name: 'Create Collection' })
  await dialog
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Session Picks')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Session Picks',
  )
  await expect(page).not.toHaveURL(firstDetail)
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'Collections' })
    .click()
  await expect(page.getByRole('row')).toHaveCount(2)
  await expect(page.locator('audio')).not.toHaveAttribute('src')

  await kiter.restart()
  await kiter.page
    .getByRole('link', { name: 'Collections', exact: true })
    .click()
  await expect(kiter.page.getByRole('row')).toHaveCount(2)
  await kiter.page
    .getByRole('row')
    .filter({ hasText: firstDetail.split('/').at(-1)! })
    .getByRole('link', { name: 'Open Session Picks' })
    .click()
  await expect(kiter.page).toHaveURL(firstDetail)
  await expect(
    kiter.page.getByText('First line\nSecond line', { exact: true }),
  ).toBeVisible()
})

test('Collection creation protects a native close request and preserves the existing player through navigation', async ({
  kiter,
}) => {
  const library = new LibraryPage(kiter.page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  const row = library.row('kick.wav')
  await row.getByRole('button', { name: 'Play kick.wav', exact: true }).click()
  const player = kiter.page.locator('audio')
  await expect
    .poll(() =>
      player.evaluate(
        (audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0,
      ),
    )
    .toBe(true)
  await row.getByRole('button', { name: 'Pause kick.wav', exact: true }).click()
  const source = await player.getAttribute('src')
  await kiter.page
    .getByRole('link', { name: 'Collections', exact: true })
    .click()
  await kiter.page
    .getByRole('button', { name: 'Create Collection', exact: true })
    .click()
  const dialog = kiter.page.getByRole('dialog', { name: 'Create Collection' })
  const name = dialog.getByRole('textbox', { name: 'Name', exact: true })
  await name.fill('Protected draft')
  await kiter.page.keyboard.press('F6')
  await expect(name).toBeFocused()
  await kiter.application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close()
  })
  await expect(
    dialog.getByRole('button', { name: 'Save and quit' }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Stay', exact: true }).click()
  await expect(name).toHaveValue('Protected draft')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(
    kiter.page.getByRole('heading', { name: 'Protected draft', level: 1 }),
  ).toBeVisible()
  await expect(player).toHaveAttribute('src', source!)
  await expect
    .poll(() =>
      player.evaluate(
        (audio: HTMLAudioElement) => audio.paused && audio.currentTime > 0,
      ),
    )
    .toBe(true)
  await kiter.restart()
  await kiter.page
    .getByRole('link', { name: 'Collections', exact: true })
    .click()
  await expect(kiter.page.getByRole('row')).toContainText('Protected draft')
})
