import type { Locator, Page } from '@playwright/test'

export class LibraryPage {
  constructor(readonly page: Page) {}

  // The header control opens the import dialog, so this drives that dialog to a
  // completed standalone import instead of only starting a workflow: pick the
  // mode, confirm it, then dismiss the results. It returns once the catalog holds
  // the imported Samples and the dialog is gone, so callers can interact with
  // imported files directly.
  // Standalone Samples keeps the journeys on the library, Favorites, playback and
  // context menus they assert rather than on Pack creation.
  // Control names below are the dialog's accessible contract, so they change with
  // its copy rather than through a test identifier.
  async openFolder(): Promise<void> {
    await this.page.getByRole('button', { name: 'Open folder' }).click()
    const folders = this.page.getByRole('dialog', { name: 'Import folders' })
    await folders.waitFor()
    // The mode control only exists once the picker answered and its folders
    // reached the dialog, so waiting for it is the selection barrier.
    await folders.getByRole('radio', { name: 'Standalone Samples' }).check()
    // The confirmation control carries the standalone label only after the mode
    // re-renders, which prevents confirming the default Pack mode.
    await folders
      .getByRole('button', { name: 'Import Samples', exact: true })
      .click()
    // The dialog reaches its results phase only after the import finished, and
    // its Close control exists only there: clicking it is the completion barrier.
    const results = this.page.getByRole('dialog', { name: 'Import results' })
    await results.getByRole('button', { name: 'Close', exact: true }).click()
    await results.waitFor({ state: 'detached' })
  }

  row(name: string): Locator {
    return this.page
      .getByRole('grid', { name: 'Audio files' })
      .getByRole('rowgroup', { name: 'Samples' })
      .getByRole('row')
      .filter({
        has: this.page.getByText(name, { exact: true }),
      })
  }

  async inspect(name: string): Promise<void> {
    await this.row(name)
      .getByRole('button', { name: `More actions: ${name}`, exact: true })
      .click()
    await this.page.getByRole('menuitem', { name: 'Info', exact: true }).click()
  }
}
