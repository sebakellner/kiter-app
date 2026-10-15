import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron, test as base, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { createWav } from '../support/fixtures/wav.mjs'

type ApplicationFixture = {
  page: Page
  application: ElectronApplication
  samples: string
  empty: string
  restart: () => Promise<void>
  selectFolder: (directory: string | null) => Promise<void>
}

export const test = base.extend<{ kiter: ApplicationFixture }>({
  kiter: async ({ browserName }, provide, testInfo) => {
    expect(browserName).toBe('chromium')
    const directory = await mkdtemp(path.join(tmpdir(), 'kiter-e2e-'))
    const samples = path.join(directory, 'samples')
    const empty = path.join(directory, 'empty')
    const userData = path.join(directory, 'data')
    const audio = createWav(8)
    const errors: string[] = []
    let application: ElectronApplication | undefined
    let page: Page
    let phase = 0
    let tracing = false
    try {
      for (const folder of [samples, empty, userData]) {
        await mkdir(folder)
      }
      await writeFile(path.join(samples, 'kick.wav'), audio)
      await writeFile(path.join(samples, 'snare.wav'), audio)
      const start = async (): Promise<void> => {
        application = await _electron.launch({
          args: [
            fileURLToPath(
              new URL('../support/electron/e2e-entry.mjs', import.meta.url),
            ),
          ],
          cwd: directory,
          env: { ...process.env, KITER_TEST_USER_DATA: userData },
        })
        application.process().stderr?.on('data', (chunk: Buffer) => {
          const output = chunk.toString()
          if (
            /Database shutdown failed|local catalog stopped unexpectedly|Application database startup failed|UnhandledPromiseRejection/.test(
              output,
            )
          ) {
            errors.push(output)
          }
        })
        await application
          .context()
          .tracing.start({ screenshots: true, snapshots: true, sources: true })
        tracing = true
        const observePage = (created: Page): void => {
          created.on('pageerror', (error) => errors.push(error.message))
          created.on('console', (message) => {
            if (message.type() === 'error') {
              errors.push(message.text())
            }
          })
        }
        application.context().pages().forEach(observePage)
        application.context().on('page', observePage)
        page = await application.firstWindow()
        // Media behavior is real; generated audio must remain silent.
        await page.evaluate(() => {
          document.querySelectorAll('audio').forEach((audio) => {
            audio.muted = true
          })
          const observer = new MutationObserver(() => {
            document.querySelectorAll('audio').forEach((audio) => {
              audio.muted = true
            })
          })
          observer.observe(document, { childList: true, subtree: true })
        })
        await expect(
          page.getByRole('button', { name: 'Open folder' }),
        ).toBeVisible()
      }
      const stop = async (): Promise<void> => {
        if (!application) {
          return
        }
        try {
          if (tracing) {
            const tracePath = testInfo.outputPath(`electron-${phase++}.zip`)
            await application.context().tracing.stop({
              path: tracePath,
            })
            await testInfo.attach(`Electron process ${phase} trace`, {
              path: tracePath,
              contentType: 'application/zip',
            })
            tracing = false
          }
        } finally {
          await application.close()
          application = undefined
        }
      }
      await start()
      const fixture: ApplicationFixture = {
        get page() {
          return page
        },
        get application() {
          if (!application) {
            throw new Error('Electron is not running')
          }
          return application
        },
        samples,
        empty,
        restart: async () => {
          await stop()
          await start()
        },
        selectFolder: async (selected) => {
          if (!application) {
            throw new Error('Electron is not running')
          }
          await application.evaluate(({ dialog }, directory) => {
            dialog.showOpenDialog = async () => ({
              canceled: directory === null,
              filePaths: directory === null ? [] : [directory],
            })
          }, selected)
        },
      }
      try {
        await provide(fixture)
      } finally {
        if (testInfo.status !== testInfo.expectedStatus && application) {
          try {
            const screenshot = await page!.screenshot()
            await testInfo.attach('Electron failure', {
              body: screenshot,
              contentType: 'image/png',
            })
          } catch (error) {
            await testInfo.attach('Screenshot capture failed', {
              body: String(error),
              contentType: 'text/plain',
            })
          }
        }
        await stop()
      }
      expect(errors, 'Unexpected Electron or renderer errors').toEqual([])
      for (const name of ['kick.wav', 'snare.wav']) {
        expect(await readFile(path.join(samples, name))).toEqual(audio)
      }
    } finally {
      if (application) {
        await application.close()
      }
      await rm(directory, { recursive: true, force: true })
    }
  },
})

export { expect } from '@playwright/test'
