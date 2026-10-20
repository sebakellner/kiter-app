import type { Locator, Page } from '@playwright/test'

export class LibraryPage {
  constructor(readonly page: Page) {}

  async openFolder(): Promise<void> {
    // This starts the workflow, including cancellation/failure cases. Callers must
    // await their expected result before interacting with imported files.
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
}
