import assert from 'node:assert/strict'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { app, BrowserWindow, dialog } from 'electron'
import { createWav } from './wav.mjs'

const selections = []
let dialogCalls = 0
dialog.showOpenDialog = async () => {
  dialogCalls++
  await delay(50)
  assert.ok(selections.length > 0, 'Unexpected folder dialog')
  const selected = selections.shift()
  return { canceled: selected === null, filePaths: selected === null ? [] : [selected] }
}

async function waitFor(check, label) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(25)
  }
  throw new Error(`Timed out: ${label}`)
}

async function run() {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-app-test-'))
  try {
    app.setPath('userData', dir)
    await import('../out/main/index.js')
    const wav = createWav()
    await writeFile(path.join(dir, 'track2.WAV'), wav)
    await writeFile(path.join(dir, 'track10.wav'), wav)
    await writeFile(path.join(dir, 'broken.mp3'), 'invalid audio')
    await writeFile(path.join(dir, 'notes.txt'), '')
    const empty = path.join(dir, 'empty')
    await mkdir(empty)
    const album = path.join(dir, 'folder #1.mp3')
    await mkdir(album)
    await writeFile(path.join(album, 'nested.wav'), wav)
    await mkdir(path.join(album, 'deep'))
    await writeFile(path.join(album, 'deep', 'track2.WAV'), wav)
    const expected = [
      'broken.mp3',
      path.join('folder #1.mp3', 'nested.wav'),
      path.join('folder #1.mp3', 'deep', 'track2.WAV'),
      'track2.WAV',
      'track10.wav'
    ]

    await app.whenReady()
    await waitFor(() => BrowserWindow.getAllWindows().length > 0, 'window creation')
    assert.equal(BrowserWindow.getAllWindows().length, 1, 'Only one window should open')
    const window = BrowserWindow.getAllWindows()[0]
    const nativeDrags = []
    window.webContents.startDrag = (item) => {
      nativeDrags.push(item)
    }
    window.webContents.on('console-message', (event) => {
      if (event.level === 'error') console.error(`Renderer: ${event.message}`)
    })
    const execute = (code) =>
      window.webContents.executeJavaScript(code, true).catch((cause) => {
        throw new Error(`Renderer script failed: ${code.slice(0, 200)}`, { cause })
      })
    await waitFor(() => execute('!!document.querySelector("button")'), 'renderer initialization')
    assert.equal(await execute('typeof window.api.library.readDir'), 'function')
    assert.equal(await execute('typeof window.api.library.startDrag'), 'function')
    assert.equal(await execute('document.querySelector(".audio-files")'), null)
    await execute(`
      globalThis.waveformFetches = [];
      globalThis.dragErrors = [];
      globalThis.unsubscribeDragErrors = window.api.library.onDragError(error => globalThis.dragErrors.push(error));
      const originalFetch = window.fetch.bind(window);
      window.fetch = (...args) => {
        if (String(args[0]).startsWith('sample:')) globalThis.waveformFetches.push(String(args[0]));
        return originalFetch(...args);
      };
      void 0;
    `)

    async function open(selected) {
      selections.push(selected)
      await execute('document.querySelector("button").click()')
      await waitFor(() => execute('!document.querySelector("button").disabled'), 'folder reading')
    }
    const names = () =>
      execute('Array.from(document.querySelectorAll(".sample-name"), item => item.textContent)')

    async function preview(index) {
      await execute(`document.querySelectorAll(".preview-button")[${index}].click()`)
    }
    async function drag(index) {
      return execute(`
        document.querySelectorAll(".audio-files li")[${index}]
          .dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }))
      `)
    }

    selections.push(dir)
    await execute(
      'document.querySelector("button").click(); document.querySelector("button").click()'
    )
    await waitFor(
      () => execute('!document.querySelector("button").disabled'),
      'initial folder reading'
    )
    assert.equal(dialogCalls, 1, 'Repeated clicks must not open concurrent dialogs')
    assert.deepEqual(await names(), expected)
    assert.ok(await execute('document.body.textContent.includes("5 audio files")'))

    await waitFor(
      () => execute('!!document.querySelector("canvas:not([hidden])")'),
      'waveform decoding'
    )
    assert.ok(await execute('document.querySelector(".sample-duration").textContent === "2.00 s"'))
    assert.ok(
      await execute(`
      Array.from(document.querySelector("canvas:not([hidden])").getContext("2d")
        .getImageData(0, 0, 640, 64).data).some((value, index) => index % 4 === 3 && value > 0)
    `),
      'Canvas must contain a waveform'
    )
    await waitFor(
      () => execute('!!document.querySelector(".audio-files li:first-child .sample-error")'),
      'unsupported audio error'
    )
    assert.equal(
      await execute('fetch("sample://audio/not-authorized").then(response => response.status)'),
      403
    )

    assert.ok(
      await execute(
        'Array.from(document.querySelectorAll(".audio-files li")).every(row => row.draggable)'
      )
    )
    assert.equal(await drag(1), false, 'HTML dragging must be canceled in favor of native dragging')
    await waitFor(() => nativeDrags.length === 1, 'native file drag IPC')
    assert.equal(nativeDrags[0].file, await realpath(path.join(album, 'nested.wav')))
    assert.equal(nativeDrags[0].icon.isEmpty(), false)
    assert.deepEqual(nativeDrags[0].icon.getSize(), { width: 64, height: 64 })

    await execute('window.api.library.startDrag("file:///not-a-library-sample.wav")')
    await waitFor(() => execute('globalThis.dragErrors.length === 1'), 'unauthorized drag error')
    assert.equal(nativeDrags.length, 1, 'Arbitrary file paths must not be dragged')

    await execute('document.querySelector(".audio-files li:last-child").scrollIntoView()')
    await waitFor(
      () => execute('!document.querySelector(".audio-files li:last-child canvas").hidden'),
      'last sample waveform before file removal'
    )
    await rm(path.join(dir, 'track10.wav'))
    await drag(4)
    await waitFor(
      () => execute('!!document.querySelector(".audio-files li:last-child .sample-drag-error")'),
      'missing sample drag error'
    )
    assert.equal(nativeDrags.length, 1)
    assert.ok(
      await execute('document.querySelector(".sample-drag-error").textContent.includes("ENOENT")')
    )
    await writeFile(path.join(dir, 'track10.wav'), wav)
    await drag(4)
    await waitFor(() => nativeDrags.length === 2, 'dragging restored sample')
    assert.equal(await execute('document.querySelector(".sample-drag-error")'), null)
    await execute('window.scrollTo(0, 0)')

    await execute('document.querySelector("audio").muted = true')
    await execute(`
      const buttons = document.querySelectorAll(".preview-button");
      buttons[1].click();
      buttons[2].click();
      buttons[1].click();
    `)
    await waitFor(
      () =>
        execute(
          '!document.querySelector("audio").paused && document.querySelector("audio").currentTime > 0.05'
        ),
      'real sample playback'
    )
    assert.equal(await execute('document.querySelectorAll("audio").length'), 1)
    assert.equal(
      await execute('document.querySelectorAll(".preview-button[aria-pressed=true]").length'),
      1
    )
    const firstUrl = await execute('document.querySelector("audio").src')
    assert.equal(
      await execute('document.querySelectorAll(".audio-files li")[1].dataset.audioUrl'),
      firstUrl,
      'Rapid switching must leave only the final sample playing'
    )
    assert.equal(await execute('document.querySelector(".audio-files p.sample-error")'), null)
    await execute('document.querySelector("audio").pause()')
    await waitFor(
      () => execute('!document.querySelector(".preview-button[aria-pressed=true]")'),
      'pausing with native controls'
    )
    await execute('document.querySelector("audio").play()')
    await waitFor(
      () => execute('!!document.querySelector(".preview-button[aria-pressed=true]")'),
      'resuming with native controls'
    )
    const range = await execute(`
      fetch(${JSON.stringify(firstUrl)}, { headers: { Range: "bytes=0-43" } })
        .then(async response => ({ status: response.status, bytes: (await response.arrayBuffer()).byteLength }))
    `)
    assert.deepEqual(range, { status: 206, bytes: 44 }, 'Audio access must support ranged playback')
    const suffix = await execute(`
      fetch(${JSON.stringify(firstUrl)}, { headers: { Range: "bytes=-44" } })
        .then(async response => ({ status: response.status, bytes: (await response.arrayBuffer()).byteLength }))
    `)
    assert.deepEqual(suffix, { status: 206, bytes: 44 })
    const head = await execute(`
      fetch(${JSON.stringify(firstUrl)}, { method: "HEAD" })
        .then(async response => ({ status: response.status, bytes: (await response.arrayBuffer()).byteLength }))
    `)
    assert.deepEqual(head, { status: 200, bytes: 0 })
    assert.equal(
      await execute(
        `fetch(${JSON.stringify(firstUrl)}, { headers: { Range: "bytes=999999999-" } }).then(response => response.status)`
      ),
      416
    )

    await preview(2)
    await waitFor(
      () =>
        execute(
          '!document.querySelector("audio").paused && document.querySelectorAll(".preview-button")[2].getAttribute("aria-pressed") === "true"'
        ),
      'switching samples'
    )
    assert.notEqual(await execute('document.querySelector("audio").src'), firstUrl)
    assert.equal(
      await execute('document.querySelectorAll(".preview-button[aria-pressed=true]").length'),
      1
    )
    await preview(2)
    assert.ok(await execute('document.querySelector("audio").paused'))
    assert.equal(await execute('document.querySelector("audio").currentTime'), 0)

    await preview(1)
    await waitFor(
      () =>
        execute(
          '!document.querySelector("audio").paused && document.querySelector("audio").currentTime > 0.05'
        ),
      'preview replay'
    )
    await execute(
      'document.querySelector("audio").currentTime = document.querySelector("audio").duration - 0.04'
    )
    await waitFor(
      () =>
        execute(
          'document.querySelector("audio").ended && !document.querySelector(".preview-button[aria-pressed=true]")'
        ),
      'playback ending'
    )

    await preview(0)
    await waitFor(
      () => execute('!!document.querySelector(".audio-files li:first-child p.sample-error")'),
      'preview format error'
    )
    await preview(1)
    await waitFor(
      () =>
        execute(
          '!document.querySelector("audio").paused && document.querySelector("audio").currentTime > 0.05'
        ),
      'playback recovery'
    )
    await execute('void (globalThis.previousAudio = document.querySelector("audio"))')

    await open(null)
    assert.deepEqual(await names(), expected)
    assert.ok(
      await execute(
        'globalThis.previousAudio.paused && !globalThis.previousAudio.hasAttribute("src")'
      )
    )
    await drag(1)
    await waitFor(() => nativeDrags.length === 3, 'dragging after folder selection cancellation')

    await open(path.join(dir, 'missing'))
    assert.ok(
      await execute('document.querySelector(".library-error").textContent.includes("ENOENT")')
    )
    assert.equal(
      await execute('document.querySelector(".library-directory").textContent'),
      `Folder: ${dir}`
    )
    assert.deepEqual(await names(), expected)

    await open(empty)
    assert.ok(await execute('document.body.textContent.includes("No audio files")'))
    assert.equal(await execute('document.querySelector(".library-error")'), null)
    assert.equal(
      await execute(`fetch(${JSON.stringify(firstUrl)}).then(response => response.status)`),
      403,
      'Previous folders must no longer be available to the audio protocol'
    )
    const failures = await execute('globalThis.dragErrors.length')
    await execute(`window.api.library.startDrag(${JSON.stringify(firstUrl)})`)
    await waitFor(
      () => execute(`globalThis.dragErrors.length === ${failures + 1}`),
      'revoked drag source'
    )
    assert.equal(nativeDrags.length, 3, 'Previous libraries must not remain draggable')
    await execute('globalThis.unsubscribeDragErrors()')
    await execute(`window.api.library.startDrag(${JSON.stringify(firstUrl)})`)
    await delay(50)
    assert.equal(
      await execute('globalThis.dragErrors.length'),
      failures + 1,
      'Unsubscribed error listeners must not receive events'
    )

    await execute('globalThis.waveformFetches.length = 0')
    await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        writeFile(path.join(empty, `audio${index}.wav`), wav)
      )
    )
    await open(empty)
    assert.equal((await names()).length, 100)
    await waitFor(
      () => execute('!!document.querySelector("canvas:not([hidden])")'),
      'visible waveforms'
    )
    await delay(100)
    assert.ok(
      await execute(
        'globalThis.waveformFetches.length > 0 && globalThis.waveformFetches.length < 20'
      ),
      'Waveforms must only load for visible rows and the small prefetch margin'
    )
    assert.ok(
      await execute('document.documentElement.scrollHeight > window.innerHeight'),
      'Long lists must be scrollable'
    )
    await execute('window.scrollTo(0, document.documentElement.scrollHeight)')
    assert.ok(await execute('window.scrollY > 0'), 'Scrolling must not be blocked')
    await waitFor(
      () => execute('!document.querySelector(".audio-files li:last-child canvas").hidden'),
      'waveforms after scrolling'
    )
    console.log(
      'PASS: recursive listing, waveforms, playback, native drag IPC/payload, access checks and cleanup'
    )
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    app.once('will-quit', () => rmSync(dir, { recursive: true, force: true }))
    app.quit()
  }
}

void run()
