import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { waitFor } from './support/electron/wait-for.mjs'
import Database from 'better-sqlite3'
import { app, BrowserWindow, dialog } from 'electron'

const [phase, directory] = process.argv.slice(2)
assert.ok(['save', 'remove', 'verify'].includes(phase) && directory)
app.setPath('userData', path.join(directory, 'data'))
let cancelNext = false
let releaseCancel
dialog.showOpenDialog = async () => {
  const canceled = cancelNext
  cancelNext = false
  if (canceled) {
    await new Promise((resolve) => {
      releaseCancel = resolve
    })
  }
  return {
    canceled,
    filePaths: canceled ? [] : [path.join(directory, 'samples')],
  }
}

async function run() {
  let failed = false
  try {
    await import('../out/main/index.js')
    await app.whenReady()
    await waitFor(
      () => BrowserWindow.getAllWindows().length === 1,
      'application window',
    )
    const window = BrowserWindow.getAllWindows()[0]
    const execute = (code) => window.webContents.executeJavaScript(code, true)
    await waitFor(
      () => execute('!!document.querySelector("[data-testid=open-folder]")'),
      'renderer',
    )
    await execute('document.querySelector("[data-testid=open-folder]").click()')
    await waitFor(
      () =>
        execute('!!document.querySelector("[data-testid=favorite-toggle]")'),
      'catalog import',
    )
    const id = await execute(
      'document.querySelector("[data-sample-id]").dataset.sampleId',
    )
    const identityFile = path.join(directory, 'expected-id.txt')
    if (phase === 'save') {
      await writeFile(identityFile, id)
      assert.equal(
        await execute(
          'document.querySelector("[data-testid=favorite-toggle]").getAttribute("aria-pressed")',
        ),
        'false',
      )
      // Revoke the UI's sample to exercise a real failed IPC write without optimistic success.
      await execute(
        `window.api.library.importFolder(${JSON.stringify(path.join(directory, 'empty'))}).then(result => { if (!result.ok) throw new Error(result.error.message); })`,
      )
      await execute(
        'document.querySelector("[data-testid=favorite-toggle]").click()',
      )
      await waitFor(
        () =>
          execute('!!document.querySelector("[data-sample-id] [role=alert]")'),
        'favorite write failure',
      )
      assert.equal(
        await execute(
          'document.querySelector("[data-testid=favorite-toggle]").getAttribute("aria-pressed")',
        ),
        'false',
      )
      assert.ok(
        await execute(
          'document.querySelector("[data-sample-id] [role=alert]").textContent.includes("Invalid or inactive sample")',
        ),
      )
      assert.equal(
        await execute(
          'document.querySelector("[data-testid=favorite-toggle]").disabled',
        ),
        false,
      )
      await execute(
        'document.querySelector("[data-testid=open-folder]").click()',
      )
      await waitFor(
        () =>
          execute(
            '!!document.querySelector("[data-testid=favorite-toggle]") && !document.querySelector("[data-testid=open-folder]").disabled',
          ),
        'reload after error',
      )
    } else {
      assert.equal(
        id,
        await readFile(identityFile, 'utf8'),
        'Sample UUID must survive a fresh process',
      )
      assert.equal(
        await execute(
          'document.querySelector("[data-testid=favorite-toggle]").getAttribute("aria-pressed")',
        ),
        phase === 'remove' ? 'true' : 'false',
      )
    }
    await execute(
      'document.querySelector("[data-testid=favorites-filter]").click()',
    )
    if (phase !== 'remove') {
      assert.equal(
        await execute('document.querySelectorAll("[data-sample-id]").length'),
        0,
      )
      assert.ok(
        await execute(
          'document.body.textContent.includes("No favorites in this folder yet.")',
        ),
      )
      await execute(
        'document.querySelector("[data-testid=favorites-filter]").click()',
      )
    }
    if (phase !== 'verify') {
      const lock =
        phase === 'save'
          ? new Database(path.join(directory, 'data', 'db', 'kiter.sqlite'))
          : null
      try {
        lock?.exec('BEGIN IMMEDIATE')
        await execute(
          'document.querySelector("[data-testid=favorite-toggle]").click(); document.querySelector("[data-testid=favorite-toggle]").click()',
        )
        if (phase === 'save') {
          await waitFor(
            () =>
              execute(
                'document.querySelector("[data-testid=favorite-toggle]").disabled',
              ),
            'pending write',
          )
          cancelNext = true
          await execute(
            'document.querySelector("[data-testid=open-folder]").click()',
          )
          await waitFor(
            () =>
              execute(
                'document.querySelector("main").getAttribute("aria-busy") === "true" && !document.querySelector("[data-testid=favorite-toggle]")',
              ),
            'unmounted row during folder selection',
          )
          releaseCancel()
          await waitFor(
            () =>
              execute(
                '!!document.querySelector("[data-testid=favorite-toggle]") && !document.querySelector("[data-testid=open-folder]").disabled',
              ),
            'canceled folder selection',
          )
        }
      } finally {
        lock?.exec('ROLLBACK')
        lock?.close()
      }
      await waitFor(
        () =>
          execute(
            phase === 'save'
              ? 'document.querySelector("[data-testid=favorite-toggle]")?.getAttribute("aria-pressed") === "true" && !document.querySelector("[data-testid=favorite-toggle]").disabled'
              : 'document.querySelectorAll("[data-sample-id]").length === 0',
          ),
        'favorite commit',
      )
      if (phase === 'save') {
        await execute(
          'document.querySelector("[data-testid=favorites-filter]").click()',
        )
        assert.equal(
          await execute('document.querySelectorAll("[data-sample-id]").length'),
          1,
        )
      }
    }
    const rejection = await execute(
      'window.api.library.setFavorite("not-authorized", true)',
    )
    assert.deepEqual(
      rejection,
      {
        ok: false,
        error: { code: 'INVALID_INPUT', message: 'Invalid or inactive sample' },
      },
      'Unknown IDs must be rejected',
    )
    const invalidBoolean = await execute(
      `window.api.library.setFavorite(${JSON.stringify(id)}, "true")`,
    )
    assert.deepEqual(
      invalidBoolean,
      {
        ok: false,
        error: { code: 'INVALID_INPUT', message: 'Invalid or inactive sample' },
      },
      'Non-boolean favorite state must be rejected',
    )
    console.log(`PASS: favorites restart phase ${phase}`)
  } catch (error) {
    console.error(error)
    failed = true
  } finally {
    app.once('will-quit', (event) => {
      event.preventDefault()
      app.exit(failed ? 1 : 0)
    })
    app.quit()
  }
}

void run()
