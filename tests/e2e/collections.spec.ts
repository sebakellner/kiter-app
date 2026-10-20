import { test, expect } from './fixtures'
import { seedCollection } from '../support/electron/catalog'

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
