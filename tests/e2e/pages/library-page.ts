import type { Locator, Page } from '@playwright/test'

export class LibraryPage {
  constructor(readonly page: Page) {}

  async openFolder(): Promise<void> {
    await this.page.getByRole('button', { name: 'Open folder' }).click()
  }

  row(name: string): Locator {
    return this.page
      .getByRole('grid', { name: 'Audio files' })
      .getByRole('row')
      .filter({
        has: this.page.getByText(name, { exact: true }),
      })
  }

  async filterFavorites(): Promise<void> {
    await this.page.getByRole('checkbox', { name: 'Favorites only' }).check()
  }
}
