import { test, expect } from './fixtures'
import { LibraryPage } from './pages/library-page'
import { rename } from 'node:fs/promises'
import path from 'node:path'

test('Sample right-click and More actions share preview and Info without changing selection on open', async ({
  kiter,
}) => {
  const page = kiter.page
  const library = new LibraryPage(page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  const kick = library.row('kick.wav')
  const snare = library.row('snare.wav')
  await snare.click({ position: { x: 4, y: 4 } })
  await expect(snare).toHaveAttribute('aria-selected', 'true')
  await kick.click({ button: 'right', position: { x: 4, y: 4 } })
  const menu = page.getByRole('menu', { name: 'Actions for kick.wav' })
  await expect(menu).toBeVisible()
  await expect(
    menu.getByRole('menuitem', { name: 'Play preview' }),
  ).toBeFocused()
  await expect(snare).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('audio')).not.toHaveAttribute('src')
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(kick).toBeFocused()

  const trigger = kick.getByRole('button', { name: 'More actions: kick.wav' })
  await trigger.click()
  await expect(menu.getByRole('menuitem')).toHaveText(['Play preview', 'Info'])
  await menu.getByRole('menuitem', { name: 'Play preview' }).click()
  await expect(menu).toHaveCount(0)
  await expect
    .poll(() =>
      page
        .locator('audio')
        .evaluate(
          (audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0,
        ),
    )
    .toBe(true)
  await expect(snare).toHaveAttribute('aria-selected', 'true')
  await trigger.click()
  await menu.getByRole('menuitem', { name: 'Pause preview' }).click()
  await expect
    .poll(() =>
      page
        .locator('audio')
        .evaluate(
          (audio: HTMLAudioElement) => audio.paused && audio.currentTime > 0,
        ),
    )
    .toBe(true)
  const source = await page.locator('audio').getAttribute('src')
  await trigger.click()
  await menu.getByRole('menuitem', { name: 'Info', exact: true }).click()
  await expect(kick).toHaveAttribute('aria-selected', 'true')
  const inspector = page.getByRole('complementary', { name: 'Sample info' })
  await expect(inspector).toContainText('kick.wav')
  await expect(page.locator('audio')).toHaveAttribute('src', source!)
  await inspector.getByRole('button', { name: 'Close inspector' }).click()
  await expect(kick).toBeFocused()
})

test('Sample menus support keyboard navigation, replace another row menu and dismiss without trapping focus', async ({
  kiter,
}) => {
  const page = kiter.page
  const library = new LibraryPage(page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  const kick = library.row('kick.wav')
  const snare = library.row('snare.wav')
  await kick.focus()
  await page.keyboard.press('Shift+F10')
  let menu = page.getByRole('menu', { name: 'Actions for kick.wav' })
  await expect(
    menu.getByRole('menuitem', { name: 'Play preview' }),
  ).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Info' })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(
    menu.getByRole('menuitem', { name: 'Play preview' }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(kick).toBeFocused()
  const trigger = kick.getByRole('button', { name: 'More actions: kick.wav' })
  await trigger.focus()
  await page.keyboard.press('ArrowUp')
  await expect(menu.getByRole('menuitem', { name: 'Info' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(menu).toHaveCount(0)
  await expect(trigger).not.toBeFocused()
  await trigger.click()
  await snare.click({ button: 'right', position: { x: 4, y: 4 } })
  await expect(page.getByRole('menu')).toHaveCount(1)
  menu = page.getByRole('menu', { name: 'Actions for snare.wav' })
  await expect(menu).toBeVisible()
  const search = page.getByRole('searchbox', { name: 'Search samples' })
  await search.click()
  await expect(menu).toHaveCount(0)
  await expect(search).toBeFocused()
  await search.fill('kick')
  await expect(snare).toHaveCount(0)
  await expect(page.locator('audio')).not.toHaveAttribute('src')
})

test('unavailable Sample context menus retain Info but cannot start playback', async ({
  kiter,
}) => {
  const page = kiter.page
  const library = new LibraryPage(page)
  await kiter.selectFolder(kiter.samples)
  await library.openFolder()
  const original = path.join(kiter.samples, 'snare.wav')
  const moved = path.join(kiter.samples, 'moved-snare.wav')
  await rename(original, moved)
  try {
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    const snare = library.row('snare.wav')
    await expect(
      snare.getByRole('button', { name: 'Play snare.wav', exact: true }),
    ).toBeDisabled()
    await snare.click({ button: 'right', position: { x: 4, y: 4 } })
    const menu = page.getByRole('menu', { name: 'Actions for snare.wav' })
    await expect(
      menu.getByRole('menuitem', { name: 'Play preview' }),
    ).toBeDisabled()
    await expect(menu.getByRole('menuitem', { name: 'Info' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('complementary', { name: 'Sample info' }),
    ).toContainText('snare.wav')
    await expect(page.locator('audio')).not.toHaveAttribute('src')
  } finally {
    await rename(moved, original)
  }
})
