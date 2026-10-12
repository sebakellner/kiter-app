import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { app, BrowserWindow, dialog } from 'electron'
import { createWav } from './wav.mjs'
import '../out/main/index.js'

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
    const wav = createWav()
    await writeFile(path.join(dir, 'track2.WAV'), wav)
    await writeFile(path.join(dir, 'track10.wav'), wav)
    await writeFile(path.join(dir, 'broken.mp3'), 'invalid audio')
    await writeFile(path.join(dir, 'notes.txt'), '')
    const empty = path.join(dir, 'empty')
    await mkdir(empty)
    await mkdir(path.join(dir, 'folder.mp3'))
    await writeFile(path.join(dir, 'folder.mp3', 'nested.wav'), wav)
    await mkdir(path.join(dir, 'folder.mp3', 'deep'))
    await writeFile(path.join(dir, 'folder.mp3', 'deep', 'track2.WAV'), wav)
    const expected = [
      'broken.mp3',
      path.join('folder.mp3', 'nested.wav'),
      path.join('folder.mp3', 'deep', 'track2.WAV'),
      'track2.WAV',
      'track10.wav'
    ]

    await app.whenReady()
    await waitFor(() => BrowserWindow.getAllWindows().length > 0, 'window creation')
    assert.equal(BrowserWindow.getAllWindows().length, 1, 'Only one window should open')
    const window = BrowserWindow.getAllWindows()[0]
    window.webContents.on('console-message', (event) => {
      if (event.level === 'error') console.error(`Renderer: ${event.message}`)
    })
    const execute = (code) =>
      window.webContents.executeJavaScript(code, true).catch((cause) => {
        throw new Error(`Renderer script failed: ${code.slice(0, 200)}`, { cause })
      })
    await waitFor(() => execute('!!document.querySelector("button")'), 'renderer initialization')
    assert.equal(await execute('typeof window.api.library.readDir'), 'function')
    assert.equal(await execute('document.querySelector(".audio-files")'), null)
    await execute(`
      globalThis.waveformFetches = [];
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
    assert.ok(await execute('document.body.textContent.includes("5 archivos de audio")'))

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

    await open(path.join(dir, 'missing'))
    assert.ok(
      await execute('document.querySelector(".library-error").textContent.includes("ENOENT")')
    )
    assert.equal(
      await execute('document.querySelector(".library-directory").textContent'),
      `Carpeta: ${dir}`
    )
    assert.deepEqual(await names(), expected)

    await open(empty)
    assert.ok(await execute('document.body.textContent.includes("No hay archivos de audio")'))
    assert.equal(await execute('document.querySelector(".library-error")'), null)
    assert.equal(
      await execute(`fetch(${JSON.stringify(firstUrl)}).then(response => response.status)`),
      403,
      'Previous folders must no longer be available to the audio protocol'
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
      'PASS: recursive listing, waveforms, lazy loading, streaming, playback, stop/switch, errors and cleanup'
    )
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    await rm(dir, { recursive: true, force: true })
    app.exit(process.exitCode ?? 0)
  }
}

void run()
