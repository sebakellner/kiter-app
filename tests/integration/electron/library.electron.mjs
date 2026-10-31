import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { app, BrowserWindow, dialog } from 'electron'
import { createWav } from '../../support/fixtures/wav.mjs'
import { waitFor } from '../../support/electron/wait-for.mjs'
import { verifyInstrumentsIpc } from './instruments.scenarios.mjs'
import { verifyCollectionsIpc } from './collections.scenarios.mjs'
import {
  verifyListing,
  verifyMainFrameAuthorization,
  verifyWaveformsAndDragging,
  verifyPlaybackAndStreaming,
  verifyFolderOutcomesAndRevocation,
  verifyLazyWaveforms,
  verifyPackImport,
} from './library.scenarios.mjs'

const LARGE_FOLDER_SAMPLE_COUNT = 100
const FIXTURE_WRITE_BATCH_SIZE = 10

async function createFixtures(directory) {
  const samples = path.join(directory, 'samples')
  const empty = path.join(directory, 'empty')
  const large = path.join(directory, 'large')
  const data = path.join(directory, 'data')
  // Pack mode has its own folder, so its Samples and their Pack membership are
  // unrelated to the folders the other scenarios keep reimporting.
  const packSource = path.join(directory, 'pack source')
  const packSourceNames = ['kick.wav', 'snare.wav']
  const album = path.join(samples, 'folder #1.mp3')
  const wav = createWav()
  for (const folder of [
    path.join(album, 'deep'),
    empty,
    large,
    data,
    packSource,
  ]) {
    await mkdir(folder, { recursive: true })
  }
  for (const name of packSourceNames) {
    await writeFile(path.join(packSource, name), wav)
  }
  for (const relative of [
    'track2.WAV',
    'track10.wav',
    'folder #1.mp3/nested.wav',
    'folder #1.mp3/deep/track2.WAV',
  ]) {
    await writeFile(path.join(samples, relative), wav)
  }
  await writeFile(path.join(samples, 'broken.mp3'), 'invalid audio')
  await writeFile(path.join(samples, 'notes.txt'), '')
  for (
    let offset = 0;
    offset < LARGE_FOLDER_SAMPLE_COUNT;
    offset += FIXTURE_WRITE_BATCH_SIZE
  ) {
    await Promise.all(
      Array.from(
        {
          length: Math.min(
            FIXTURE_WRITE_BATCH_SIZE,
            LARGE_FOLDER_SAMPLE_COUNT - offset,
          ),
        },
        (_, index) =>
          writeFile(path.join(large, `audio${offset + index}.wav`), wav),
      ),
    )
  }
  return {
    directory,
    samples,
    empty,
    large,
    data,
    packSource,
    packSourceNames,
    wav,
    largeSampleCount: LARGE_FOLDER_SAMPLE_COUNT,
    validSample: path.join('folder #1.mp3', 'nested.wav'),
    otherSample: path.join('folder #1.mp3', 'deep', 'track2.WAV'),
    missingSample: 'track10.wav',
    invalidSample: 'broken.mp3',
    expected: [
      'broken.mp3',
      path.join('folder #1.mp3', 'nested.wav'),
      'track10.wav',
      path.join('folder #1.mp3', 'deep', 'track2.WAV'),
      'track2.WAV',
    ],
  }
}

async function run() {
  const directory = process.argv[2]
  let exitCode = 0
  const originalDialog = dialog.showOpenDialog
  let window
  let originalStartDrag
  let onConsoleMessage
  let execute
  const consoleErrors = []
  const selections = []
  let dialogCalls = 0
  const onWindowCreated = (_, createdWindow) => {
    if (window) {
      return
    }
    window = createdWindow
    // Desktop automation may occlude the window (including while the separate
    // authorization fixture owns focus). Keep real media/observer work active.
    window.webContents.setBackgroundThrottling(false)
    onConsoleMessage = (event) => {
      if (event.level === 'error') {
        consoleErrors.push(event.message)
      }
    }
    window.webContents.on('console-message', onConsoleMessage)
  }
  try {
    assert.ok(
      directory && path.isAbsolute(directory),
      'Run through library-runner.mjs with an isolated fixture directory',
    )
    const data = path.join(directory, 'data')
    mkdirSync(data)
    const images = path.join(data, 'library', 'images')
    mkdirSync(images, { recursive: true })
    const interruptedImage = path.join(images, `${randomUUID()}.png`)
    const interruptedTemp = path.join(images, `${randomUUID()}.tmp`)
    const unrelatedImage = path.join(images, 'unrelated.png')
    for (const file of [interruptedImage, interruptedTemp, unrelatedImage]) {
      writeFileSync(file, 'interrupted publication fixture')
    }
    dialog.showOpenDialog = async () => {
      dialogCalls++
      assert.ok(selections.length > 0, 'Unexpected folder dialog')
      const selection = selections.shift()
      if (selection.release) {
        await selection.release
      }
      return {
        canceled: selection.directory === null,
        filePaths:
          typeof selection.directory === 'string' ? [selection.directory] : [],
      }
    }
    app.setPath('userData', data)
    app.on('browser-window-created', onWindowCreated)
    // Load the CommonJS entry before yielding, so protocol registration precedes app readiness.
    createRequire(import.meta.url)('../../../out/main/index.js')
    const fixtures = await createFixtures(directory)
    await app.whenReady()
    await waitFor(
      () => BrowserWindow.getAllWindows().length > 0,
      'window creation',
    )
    assert.equal(
      BrowserWindow.getAllWindows().length,
      1,
      'Only one window should open',
    )
    assert.equal(window, BrowserWindow.getAllWindows()[0])
    assert.equal(
      existsSync(interruptedImage),
      false,
      'Startup reclaims unpublished managed image',
    )
    assert.equal(
      existsSync(interruptedTemp),
      false,
      'Startup reclaims interrupted temporary copy',
    )
    assert.equal(
      existsSync(unrelatedImage),
      true,
      'Startup preserves unrelated files',
    )
    window.setSize(1000, 700)
    const nativeDrags = []
    originalStartDrag = window.webContents.startDrag
    window.webContents.startDrag = (item) => {
      nativeDrags.push(item)
    }
    execute = (code) =>
      window.webContents.executeJavaScript(code, true).catch((cause) => {
        throw new Error(`Renderer script failed: ${code.slice(0, 200)}`, {
          cause,
        })
      })
    await waitFor(
      () => execute('!!document.querySelector("[data-testid=open-folder]")'),
      'renderer initialization',
    )
    await execute(`
      globalThis.libraryTest = { waveformFetches: [], dragErrors: [], unexpectedErrors: [] };
      const state = globalThis.libraryTest;
      const originalFetch = window.fetch;
      const onError = event => state.unexpectedErrors.push(event.message);
      const onRejection = event => state.unexpectedErrors.push(String(event.reason?.message ?? event.reason));
      window.addEventListener("error", onError);
      window.addEventListener("unhandledrejection", onRejection);
      window.fetch = (...args) => {
        if (String(args[0]).startsWith("sample:")) state.waveformFetches.push(String(args[0]));
        return originalFetch.apply(window, args);
      };
      // Counts DOM changes so the harness can wait for the reload a click caused
      // instead of trusting a busy flag that is false before the work starts.
      state.catalogMutations = 0;
      state.catalogLastMutationAt = performance.now();
      state.catalogObserver = new MutationObserver(() => {
        state.catalogMutations += 1;
        state.catalogLastMutationAt = performance.now();
      });
      state.catalogObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
      state.unsubscribeDragErrors = window.api.library.onDragError(error => state.dragErrors.push(error));
      state.dispose = () => {
        state.catalogObserver.disconnect();
        state.unsubscribeDragErrors();
        window.fetch = originalFetch;
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
      };
      void 0;
    `)

    let samples = new Map()
    const refreshSamples = async () => {
      const rows = await execute(`
        Array.from(document.querySelectorAll("[data-sample-id]"), row => ({
          id: row.dataset.sampleId, audioUrl: row.dataset.audioUrl,
          relativePath: (row.querySelector("[data-testid=sample-relative-path]") ?? row.querySelector("[data-testid=sample-name]")).textContent
        }))
      `)
      samples = new Map(rows.map((sample) => [sample.relativePath, sample]))
      return rows
    }
    const sample = (relativePath) => {
      const found = samples.get(relativePath)
      assert.ok(found, `Missing fixture sample: ${relativePath}`)
      return found
    }
    const rowCode = (relativePath) =>
      `document.querySelector(${JSON.stringify(`[data-sample-id="${sample(relativePath).id}"]`)})`
    // Waiting only for "not busy" is a race: those flags are already false before the
    // app starts working, and reopening the same folder changes no visible marker, so
    // a slow machine read the previous state and every caller saw an empty list.
    // Wait instead for the reload this click caused: the DOM must change, rows must be
    // back, and the page must then stay quiet for a moment.
    const QUIET_RELOAD_MS = 250
    const catalogState = () =>
      execute(`
        (() => {
          const state = globalThis.libraryTest
          return {
            mutations: state.catalogMutations,
            quietFor: performance.now() - state.catalogLastMutationAt,
            rows: document.querySelectorAll("[data-sample-id]").length,
          }
        })()
      `)
    const waitForReloadedFolder = async (mutationsBefore) => {
      await waitFor(async () => {
        const state = await catalogState()
        return (
          state.mutations > mutationsBefore &&
          state.rows > 0 &&
          state.quietFor > QUIET_RELOAD_MS
        )
      }, 'folder reload')
    }
    const waitForFolder = async () => {
      await waitFor(
        () =>
          execute(
            'document.querySelector("main").getAttribute("aria-busy") === "false"',
          ),
        'folder reading',
      )
      await waitFor(
        () =>
          execute(
            'document.querySelector("[data-testid=catalog-results]")?.getAttribute("aria-busy") === "false"',
          ),
        'catalog query',
      )
      await refreshSamples()
    }
    // "Open folder" opens the import dialog instead of importing immediately, so
    // the dialog's own controls and phases are the progress this harness waits on.
    // Standalone Samples keeps these journeys on the library, Favorites and
    // playback they assert rather than on Pack creation.
    const IMPORT_DIALOG = 'document.querySelector("dialog[open]")'
    const dialogControl = (selector) =>
      `Array.from((${IMPORT_DIALOG}?.querySelectorAll(${JSON.stringify(selector)})) ?? [])`
    const dialogButton = (label) =>
      `${dialogControl('button')}.find(button => button.textContent.trim() === ${JSON.stringify(label)})`
    const dialogRadio = (label) =>
      `${dialogControl('label')}.find(entry => entry.textContent.trim() === ${JSON.stringify(label)})?.querySelector("input[type=radio]")`
    const waitForDialogDismissal = () =>
      waitFor(() => execute(`!${IMPORT_DIALOG}`), 'import dialog dismissal')
    // The dialog owns folder selection for both import modes, so opening it stays
    // separate from choosing what to import: a scenario that needs Pack mode has
    // to reach the mode choice before the dialog imports anything.
    const openImportDialog = async (directory) => {
      const callsBefore = dialogCalls
      selections.push({ directory })
      await execute(
        'document.querySelector("[data-testid=open-folder]").click()',
      )
      await waitFor(
        () => dialogCalls === callsBefore + 1,
        'folder selection dialog',
      )
    }
    const importStandalone = async () => {
      await waitFor(
        () => execute(`!!(${dialogRadio('Standalone Samples')})`),
        'selected folders in the import dialog',
      )
      const mutationsBefore = (await catalogState()).mutations
      await execute(`(${dialogRadio('Standalone Samples')}).click()`)
      // The confirmation control changes its label only after the mode re-renders,
      // so waiting for that label avoids confirming the default Pack mode.
      await waitFor(
        () => execute(`!!(${dialogButton('Import Samples')})`),
        'standalone Samples mode',
      )
      await execute(`(${dialogButton('Import Samples')}).click()`)
      await waitFor(
        () => execute(`!!(${dialogButton('Close')})`),
        'import results',
      )
      await execute(`(${dialogButton('Close')}).click()`)
      await waitForReloadedFolder(mutationsBefore)
      await waitForFolder()
    }
    // Pack mode is the dialog's other answer to the same folder selection. Its
    // confirmation control is labelled by the mode, so waiting for that label
    // keeps the next click on the action the mode owns.
    const waitForPackMode = async () => {
      await waitFor(
        () => execute(`!!(${dialogRadio('One Pack per folder')})`),
        'selected folders in the import dialog',
      )
      await execute(`(${dialogRadio('One Pack per folder')}).click()`)
      await waitFor(
        () => execute(`!!(${dialogButton('Prepare folders')})`),
        'Pack mode',
      )
    }
    // Folder rows are the entries of the dialog's own lists; the surface also
    // portal-mounts a labelled toast viewport, which is not a row.
    const dialogRows = `${IMPORT_DIALOG}.querySelectorAll("ul[aria-label] > li > section[aria-label]")`
    // Preparing reports one outcome per folder: an editable Pack name, an
    // existing Pack, or a failure. Every such row leaves its pending state with
    // one of those controls, so this waits on the review itself rather than on
    // the copy that distinguishes the outcomes.
    const waitForPackReview = () =>
      waitFor(
        () =>
          execute(`
        (() => {
          const dialog = ${IMPORT_DIALOG}
          if (!dialog || dialog.getAttribute("aria-busy") !== "false") return false
          const rows = Array.from(${dialogRows})
          return rows.length > 0 && rows.every(row =>
            !!row.querySelector("input:not([type=radio]):not(:disabled)") ||
            !!row.querySelector("[role=alert]"))
        })()
      `),
        'prepared folder review',
      )
    const preparePackImport = async () => {
      await waitForPackMode()
      await execute(`(${dialogButton('Prepare folders')}).click()`)
      await waitForPackReview()
    }
    const importAsPack = async (name) => {
      await preparePackImport()
      await waitFor(
        () =>
          execute(
            `!!(${IMPORT_DIALOG}?.querySelector("input:not([type=radio])"))`,
          ),
        'Pack name field',
      )
      // The name field is controlled, so the native value setter plus an input
      // event is what React records as the user's edit.
      await execute(`
        (() => {
          const input = ${IMPORT_DIALOG}.querySelector("input:not([type=radio])")
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
          setter.call(input, ${JSON.stringify(name)})
          input.dispatchEvent(new Event("input", { bubbles: true }))
        })()
      `)
      // The dialog keeps the reviewed name only once it accepts it, and it
      // enables confirmation with that same name, so both are waited for.
      await waitFor(
        () =>
          execute(`
        (() => {
          const input = ${IMPORT_DIALOG}.querySelector("input:not([type=radio])")
          const button = ${dialogButton('Create Packs')}
          return !!input && input.value === ${JSON.stringify(name)} && !!button && !button.disabled
        })()
      `),
        'reviewed Pack name',
      )
      await execute(`(${dialogButton('Create Packs')}).click()`)
      // The results name the Pack the commit returned, so the reviewed name
      // appearing there is what proves the created Pack rather than the review.
      await waitFor(
        () =>
          execute(`
        (() => {
          const dialog = ${IMPORT_DIALOG}
          return !!dialog && !!(${dialogButton('Close')}) &&
            dialog.textContent.includes(${JSON.stringify(`Created Pack “${name}”.`)})
        })()
      `),
        'Pack import results',
      )
      await execute(`(${dialogButton('Close')}).click()`)
      await waitForDialogDismissal()
    }
    const context = {
      fixtures,
      window,
      execute,
      waitFor,
      nativeDrags,
      sample,
      rowCode,
      refreshSamples,
      dialogCalls: () => dialogCalls,
      queueSelection: (directory, release) =>
        selections.push({ directory, release }),
      waitForFolder,
      importStandalone,
      importAsPack,
      preparePackImport,
      openImportDialog,
      waitForDialogDismissal,
      // The dialog's own controls stay here so scenarios select by the label the
      // user reads instead of repeating selector logic.
      dialog: {
        rows: dialogRows,
        button: dialogButton,
      },
      open: async (directory) => {
        await openImportDialog(directory)
        // Cancelling the picker dismisses the dialog without importing, so the
        // previous catalog and its playback stay untouched.
        if (directory === null) {
          await waitForDialogDismissal()
          return
        }
        // A picker that answers without a directory is now reported inside the
        // dialog, which owns folder selection errors.
        if (typeof directory !== 'string') {
          await waitFor(
            () => execute(`!!${IMPORT_DIALOG}?.querySelector("[role=alert]")`),
            'folder selection error',
          )
          await execute(`(${dialogButton('Cancel')}).click()`)
          await waitForDialogDismissal()
          return
        }
        await importStandalone()
      },
      names: async () =>
        (await refreshSamples()).map((item) => item.relativePath),
      preview: (relativePath) =>
        execute(
          `${rowCode(relativePath)}.querySelector("[data-testid=preview-toggle]").click()`,
        ),
      drag: (relativePath) =>
        execute(`${rowCode(relativePath)}.dispatchEvent(new DragEvent("dragstart", {
        bubbles: true, cancelable: true, dataTransfer: new DataTransfer()
      }))`),
      waitForPlaying: async (relativePath) =>
        waitFor(
          () =>
            execute(`
        !document.querySelector("audio").paused && document.querySelector("audio").currentTime > 0.05 &&
        ${rowCode(relativePath)}.querySelector("[data-testid=preview-toggle]").getAttribute("aria-pressed") === "true"
      `),
          `playing ${relativePath}`,
        ),
    }
    const scenarios = [
      ['Instruments IPC contracts and persistence', verifyInstrumentsIpc],
      ['Collections IPC contracts and bounded reads', verifyCollectionsIpc],
      ['recursive listing and folder selection', verifyListing],
      ['main-frame IPC authorization', verifyMainFrameAuthorization],
      ['waveforms and native drag payloads', verifyWaveformsAndDragging],
      ['shared playback and audio streaming', verifyPlaybackAndStreaming],
      ['folder outcomes and revoked access', verifyFolderOutcomesAndRevocation],
      ['lazy waveforms and scrolling', verifyLazyWaveforms],
      ['Pack mode creates a Pack end to end', verifyPackImport],
    ]
    for (const [name, scenario] of scenarios) {
      const started = performance.now()
      try {
        await scenario(context)
        assert.deepEqual(
          consoleErrors,
          [],
          'Unexpected renderer console errors',
        )
        assert.deepEqual(
          await execute('globalThis.libraryTest.unexpectedErrors'),
          [],
          'Unhandled renderer errors',
        )
        assert.equal(
          selections.length,
          0,
          'Every queued folder selection must be consumed',
        )
      } catch (cause) {
        console.error(
          'Renderer media diagnostics:',
          await execute(`(() => {
          const audio = document.querySelector('audio');
          return {
            visibility: document.visibilityState,
            focused: document.hasFocus(),
            audio: audio && {
              paused: audio.paused, ended: audio.ended,
              currentTime: audio.currentTime, readyState: audio.readyState,
              networkState: audio.networkState, errorCode: audio.error?.code,
            },
            waveforms: Array.from(document.querySelectorAll('[data-sample-id]')).slice(0, 8).map(row => ({
              ready: !row.querySelector('canvas[role=img]').hidden,
              status: row.querySelector('.waveform-status')?.textContent,
              error: row.querySelector('[role=alert]')?.textContent,
            })),
          };
        })()`),
        )
        throw new Error(`Scenario failed: ${name}`, { cause })
      }
      console.log(
        `PASS: ${name} (${Math.round(performance.now() - started)} ms)`,
      )
    }
  } catch (error) {
    console.error(error)
    exitCode = 1
  } finally {
    dialog.showOpenDialog = originalDialog
    app.removeListener('browser-window-created', onWindowCreated)
    try {
      if (execute && window && !window.isDestroyed()) {
        await execute(
          'globalThis.libraryTest?.dispose(); delete globalThis.libraryTest; void 0',
        )
      }
    } catch (error) {
      console.error('Electron test cleanup failed:', error)
      exitCode = 1
    } finally {
      if (window && !window.isDestroyed()) {
        if (originalStartDrag) {
          window.webContents.startDrag = originalStartDrag
        }
        if (onConsoleMessage) {
          window.webContents.removeListener('console-message', onConsoleMessage)
        }
      }
    }
    app.once('will-quit', (event) => {
      event.preventDefault()
      app.exit(exitCode)
    })
    app.quit()
  }
}

void run()
