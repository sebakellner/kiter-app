import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { waitFor } from '../../support/electron/wait-for.mjs'
import Database from 'better-sqlite3'
import { app, BrowserWindow, dialog } from 'electron'

const [phase, directory] = process.argv.slice(2)
assert.ok(['save', 'remove', 'verify'].includes(phase) && directory)
app.setPath('userData', path.join(directory, 'data'))
let cancelNext = false
let releaseCancel
let dialogCalls = 0
dialog.showOpenDialog = async () => {
  dialogCalls++
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

// "Open folder" opens the import dialog instead of importing at once, so the
// journey selects standalone Samples and dismisses the result; the dialog's own
// controls and phases are the progress it waits on.
const IMPORT_DIALOG = 'document.querySelector("dialog[open]")'
const dialogControl = (selector) =>
  `Array.from((${IMPORT_DIALOG}?.querySelectorAll(${JSON.stringify(selector)})) ?? [])`
const dialogButton = (label) =>
  `${dialogControl('button')}.find(button => button.textContent.trim() === ${JSON.stringify(label)})`
const dialogRadio = (label) =>
  `${dialogControl('label')}.find(entry => entry.textContent.trim() === ${JSON.stringify(label)})?.querySelector("input[type=radio]")`

async function importStandalone(execute, waitFor) {
  await waitFor(
    () => execute(`!!${dialogRadio('Standalone Samples')}`),
    'selected folders in the import dialog',
  )
  await execute(`${dialogRadio('Standalone Samples')}.click()`)
  // The confirmation control changes its label after the mode re-renders, so
  // waiting for that label avoids confirming the default Pack mode.
  await waitFor(
    () => execute(`!!${dialogButton('Import Samples')}`),
    'standalone Samples mode',
  )
  await execute(`${dialogButton('Import Samples')}.click()`)
  await waitFor(() => execute(`!!${dialogButton('Close')}`), 'import results')
  await execute(`${dialogButton('Close')}.click()`)
  await waitFor(() => execute(`!${IMPORT_DIALOG}`), 'import dialog dismissal')
}

async function run() {
  let failed = false
  let window
  const rendererErrors = []
  const onWindowCreated = (_, createdWindow) => {
    createdWindow.webContents.on('console-message', (event) => {
      if (event.level === 'error') {
        rendererErrors.push(event.message)
      }
    })
    createdWindow.webContents.on('preload-error', (_, _preloadPath, error) => {
      rendererErrors.push(`Preload failed: ${error.message}`)
    })
    createdWindow.webContents.on('render-process-gone', (_, details) => {
      rendererErrors.push(`Renderer exited: ${details.reason}`)
    })
  }
  app.on('browser-window-created', onWindowCreated)
  try {
    // Register privileged schemes before yielding to Electron's ready event.
    createRequire(import.meta.url)('../../../out/main/index.js')
    await app.whenReady()
    await waitFor(
      () => BrowserWindow.getAllWindows().length === 1,
      'application window',
    )
    window = BrowserWindow.getAllWindows()[0]
    const execute = (code) => window.webContents.executeJavaScript(code, true)
    await waitFor(
      () =>
        execute(
          'document.readyState === "complete" && !!document.querySelector("[data-testid=open-folder]") && !!window.api?.library',
        ),
      'renderer',
    )
    if (phase === 'save') {
      await execute(
        'document.querySelector("[data-testid=open-folder]").click()',
      )
      await importStandalone(execute, waitFor)
    } else {
      await execute(`document.querySelector('a[href="#/samples"]').click()`)
    }
    await waitFor(async () => {
      const state = await execute(`({
          error: document.querySelector('[data-testid="library-error"]')?.textContent,
          imported: !!document.querySelector('[data-testid="favorite-toggle"]'),
          importing: !!document.querySelector('dialog[open]')
        })`)
      assert.ok(!state.error, `Catalog import failed: ${state.error}`)
      assert.deepEqual(rendererErrors, [], 'Unexpected renderer errors')
      return state.imported && !state.importing
    }, 'catalog import')
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
    await waitFor(
      () =>
        execute(
          'document.querySelector("[data-testid=catalog-results]")?.getAttribute("aria-busy") === "false"',
        ),
      'filtered catalog',
    )
    if (phase !== 'remove') {
      assert.equal(
        await execute('document.querySelectorAll("[data-sample-id]").length'),
        0,
      )
      assert.ok(
        await execute(
          'document.body.textContent.includes("No favorites yet.")',
        ),
      )
      await execute(
        'document.querySelector("[data-testid=favorites-filter]").click()',
      )
      await waitFor(
        () =>
          execute('!!document.querySelector("[data-testid=favorite-toggle]")'),
        'unfiltered catalog',
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
          // The dialog reports its own pending folder selection, so that is the
          // barrier held open while the Favorite write is still pending.
          await waitFor(
            () =>
              execute(
                'document.querySelector("dialog[open]")?.getAttribute("aria-busy") === "true" && document.querySelector("[data-testid=favorite-toggle]").disabled',
              ),
            'pending favorite preserved during folder selection',
          )
          releaseCancel()
          await waitFor(
            () =>
              execute(
                '!!document.querySelector("[data-testid=favorite-toggle]") && !document.querySelector("dialog[open]")',
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
        await waitFor(
          () =>
            execute(
              'document.querySelector("[data-testid=catalog-results]")?.getAttribute("aria-busy") === "false"',
            ),
          'saved favorite filter',
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
    assert.deepEqual(rendererErrors, [], 'Unexpected renderer errors')
    console.log(`PASS: favorites restart phase ${phase}`)
  } catch (error) {
    console.error(error)
    console.error('Favorites phase diagnostics:', {
      phase,
      dialogCalls,
      rendererErrors,
    })
    if (window && !window.isDestroyed()) {
      try {
        const state = await window.webContents.executeJavaScript(`({
          readyState: document.readyState,
          loading: document.querySelector('main')?.getAttribute('aria-busy'),
          importing: !!document.querySelector('dialog[open]'),
          importDialogText: document.querySelector('dialog[open]')?.textContent,
          importError: document.querySelector('[data-testid="library-error"]')?.textContent,
          sampleCount: document.querySelectorAll('[data-sample-id]').length
        })`)
        console.error('Favorites renderer state:', state)
      } catch (diagnosticError) {
        console.error('Unable to inspect favorites renderer:', diagnosticError)
      }
    }
    failed = true
  } finally {
    app.removeListener('browser-window-created', onWindowCreated)
    app.once('will-quit', (event) => {
      event.preventDefault()
      app.exit(failed ? 1 : 0)
    })
    app.quit()
  }
}

void run()
