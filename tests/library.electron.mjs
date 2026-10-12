import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { app, BrowserWindow, dialog } from 'electron'

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
    await writeFile(path.join(dir, 'track2.MP3'), '')
    await writeFile(path.join(dir, 'track10.wav'), '')
    await writeFile(path.join(dir, 'notes.txt'), '')
    const empty = path.join(dir, 'empty')
    await mkdir(empty)
    await mkdir(path.join(dir, 'folder.mp3'))
    await writeFile(path.join(dir, 'folder.mp3', 'nested.mp3'), '')
    await mkdir(path.join(dir, 'folder.mp3', 'deep'))
    await writeFile(path.join(dir, 'folder.mp3', 'deep', 'track2.MP3'), '')
    const expected = [
      path.join('folder.mp3', 'nested.mp3'),
      path.join('folder.mp3', 'deep', 'track2.MP3'),
      'track2.MP3',
      'track10.wav'
    ]

    await import('../out/main/index.js')
    await app.whenReady()
    await waitFor(() => BrowserWindow.getAllWindows().length > 0, 'window creation')
    assert.equal(BrowserWindow.getAllWindows().length, 1, 'Only one window should open')
    const window = BrowserWindow.getAllWindows()[0]
    const execute = (code) => window.webContents.executeJavaScript(code)
    await waitFor(() => execute('!!document.querySelector("button")'), 'renderer initialization')
    assert.equal(await execute('typeof window.api.library.readDir'), 'function')
    assert.equal(await execute('document.querySelector(".audio-files")'), null)

    async function open(selected) {
      selections.push(selected)
      await execute('document.querySelector("button").click()')
      await waitFor(() => execute('!document.querySelector("button").disabled'), 'folder reading')
    }
    const names = () =>
      execute('Array.from(document.querySelectorAll(".audio-files li"), item => item.textContent)')

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
    assert.ok(await execute('document.body.textContent.includes("4 archivos de audio")'))

    await open(null)
    assert.deepEqual(await names(), expected)

    await open(path.join(dir, 'missing'))
    assert.ok(
      await execute('document.querySelector("[role=alert]").textContent.includes("ENOENT")')
    )
    assert.equal(
      await execute('document.querySelector(".library-directory").textContent'),
      `Carpeta: ${dir}`
    )
    assert.deepEqual(await names(), expected)

    await open(empty)
    assert.ok(await execute('document.body.textContent.includes("No hay archivos de audio")'))
    assert.equal(await execute('document.querySelector("[role=alert]")'), null)

    await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        writeFile(path.join(empty, `audio${index}.mp3`), '')
      )
    )
    await open(empty)
    assert.equal((await names()).length, 100)
    assert.ok(
      await execute('document.documentElement.scrollHeight > window.innerHeight'),
      'Long lists must be scrollable'
    )
    await execute('window.scrollTo(0, document.documentElement.scrollHeight)')
    assert.ok(await execute('window.scrollY > 0'), 'Scrolling must not be blocked')
    console.log(
      'PASS: Electron recursive audio listing, IPC, relative paths, cancellation, errors and scrolling'
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
