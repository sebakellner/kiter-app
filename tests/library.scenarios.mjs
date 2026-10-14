import assert from 'node:assert/strict'
import { realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'

export async function verifyListingAndStyles(ctx) {
  const { execute, fixtures, waitFor } = ctx
  assert.equal(await execute('typeof window.api.library.importFolder'), 'function')
  assert.equal(await execute('typeof window.api.library.startDrag'), 'function')
  assert.equal(await execute('document.querySelectorAll("[data-sample-id]").length'), 0)
  let releaseDialog
  ctx.queueSelection(
    fixtures.samples,
    new Promise((resolve) => {
      releaseDialog = resolve
    })
  )
  const previousCalls = ctx.dialogCalls()
  try {
    await execute(
      'document.querySelector("[data-testid=open-folder]").click(); document.querySelector("[data-testid=open-folder]").click()'
    )
    await waitFor(() => ctx.dialogCalls() === previousCalls + 1, 'pending folder dialog')
    assert.equal(
      await execute('document.querySelector("[data-testid=open-folder]").disabled'),
      true
    )
  } finally {
    releaseDialog()
  }
  await ctx.waitForFolder()
  assert.equal(
    ctx.dialogCalls(),
    previousCalls + 1,
    'Repeated clicks must not open concurrent dialogs'
  )
  assert.deepEqual(await ctx.names(), fixtures.expected)
  assert.ok(await execute('document.body.textContent.includes("5 audio files")'))
  assert.ok(
    await execute(`
    Array.from(document.querySelectorAll("button")).every(button => {
      const style = getComputedStyle(button);
      return button.type === "button" && button.classList.contains("ui-button") &&
        style.paddingTop === "8px" && style.paddingRight === "16px" && style.cursor === "pointer";
    })
  `),
    'Library buttons must preserve native semantics and their colocated styles'
  )
  assert.deepEqual(
    await execute(`
    ({
      libraryPadding: getComputedStyle(document.querySelector("main")).padding,
      libraryMaxWidth: getComputedStyle(document.querySelector("main")).maxWidth,
      rowWrapping: getComputedStyle(${ctx.rowCode(fixtures.validSample)}).overflowWrap,
      favoriteMargin: getComputedStyle(${ctx.rowCode(fixtures.validSample)}.querySelector("[data-testid=favorite-toggle]")).marginBottom,
      previewMargin: getComputedStyle(${ctx.rowCode(fixtures.validSample)}.querySelector("[data-testid=preview-toggle]")).marginBottom,
      playerLabelMargin: getComputedStyle(document.querySelector(".preview-player p")).marginBottom
    })
  `),
    {
      libraryPadding: '24px',
      libraryMaxWidth: '960px',
      rowWrapping: 'anywhere',
      favoriteMargin: '0px',
      previewMargin: '0px',
      playerLabelMargin: '8px'
    },
    'Colocated library styles must preserve layout and cascade overrides'
  )
}

export async function verifyMainFrameAuthorization(ctx) {
  const { fixtures, execute, waitFor } = ctx
  await ctx.open(fixtures.samples)
  await writeFile(
    path.join(fixtures.directory, 'ipc-frame.html'),
    '<iframe src="ipc-child.html"></iframe>'
  )
  await writeFile(path.join(fixtures.directory, 'ipc-child.html'), '<p>Local IPC test frame</p>')
  const frameWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      sandbox: false
    }
  })
  let subframeDrags = 0
  let dragRequestReceived = false
  frameWindow.webContents.startDrag = () => {
    subframeDrags++
  }
  const onSubframeDrag = (event) => {
    if (event.sender === frameWindow.webContents) dragRequestReceived = true
  }
  ipcMain.on('library:start-drag', onSubframeDrag)
  try {
    await frameWindow.loadFile(path.join(fixtures.directory, 'ipc-frame.html'))
    await waitFor(
      () =>
        frameWindow.webContents.mainFrame.frames.some((frame) =>
          frame.url.endsWith('ipc-child.html')
        ),
      'local child frame'
    )
    const child = frameWindow.webContents.mainFrame.frames.find((frame) =>
      frame.url.endsWith('ipc-child.html')
    )
    const sample = ctx.sample(fixtures.validSample)
    const requests = [
      ['dialog:open-folder'],
      ['library:import-folder', { directory: fixtures.samples }],
      ['library:set-favorite', { id: sample.id, favorite: true }]
    ]
    const previousDialogCalls = ctx.dialogCalls()
    const outcomes = await child.executeJavaScript(`
      Promise.all(${JSON.stringify(requests)}.map(async ([channel, ...args]) => {
        try {
          const result = await require("electron").ipcRenderer.invoke(channel, ...args);
          return { channel, accepted: result.ok, message: result.error?.message, code: result.error?.code };
        } catch (error) {
          return { channel, accepted: false, message: error.message };
        }
      }))
    `)
    for (const outcome of outcomes) {
      assert.equal(outcome.accepted, false, `${outcome.channel} must reject subframes`)
      assert.match(outcome.message, /Unauthorized IPC request/)
      assert.equal(outcome.code, 'UNAUTHORIZED')
    }
    assert.equal(ctx.dialogCalls(), previousDialogCalls, 'Rejected frames must not open dialogs')
    await child.executeJavaScript(
      `require("electron").ipcRenderer.send("library:start-drag", ${JSON.stringify(sample.audioUrl)})`
    )
    await waitFor(() => dragRequestReceived, 'rejected subframe drag')
    assert.equal(subframeDrags, 0, 'Rejected frames must not start native dragging')
    assert.equal(
      await execute(
        `${ctx.rowCode(fixtures.validSample)}.querySelector("[data-testid=favorite-toggle]").getAttribute("aria-pressed")`
      ),
      'false'
    )
  } finally {
    ipcMain.removeListener('library:start-drag', onSubframeDrag)
    frameWindow.destroy()
  }
}

export async function verifyWaveformsAndDragging(ctx) {
  const { fixtures, execute, waitFor, nativeDrags } = ctx
  await ctx.open(fixtures.samples)
  await execute(`${ctx.rowCode(fixtures.validSample)}.scrollIntoView()`)
  await waitFor(
    () => execute(`!${ctx.rowCode(fixtures.validSample)}.querySelector("canvas[role=img]").hidden`),
    'waveform decoding'
  )
  assert.equal(
    await execute(
      `${ctx.rowCode(fixtures.validSample)}.querySelector("[data-testid=sample-duration]").textContent`
    ),
    '2.00 s'
  )
  assert.ok(
    await execute(`
    (() => {
      const canvas = ${ctx.rowCode(fixtures.validSample)}.querySelector("canvas[role=img]");
      return Array.from(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data)
        .some((value, index) => index % 4 === 3 && value > 0);
    })()
  `),
    'Canvas must contain a waveform'
  )
  await execute(`${ctx.rowCode(fixtures.invalidSample)}.scrollIntoView()`)
  await waitFor(
    () => execute(`!!${ctx.rowCode(fixtures.invalidSample)}.querySelector("[role=alert]")`),
    'unsupported audio error'
  )
  assert.ok(
    await execute(
      `${ctx.rowCode(fixtures.invalidSample)}.querySelector("[role=alert]").textContent.includes("Unable to generate the waveform")`
    )
  )
  assert.equal(
    await execute('fetch("sample://audio/not-authorized").then(response => response.status)'),
    403
  )
  assert.ok(
    await execute(
      'Array.from(document.querySelectorAll("[data-sample-id]")).every(row => row.draggable)'
    )
  )
  const beforeDrag = nativeDrags.length
  assert.equal(
    await ctx.drag(fixtures.validSample),
    false,
    'HTML dragging must be canceled in favor of native dragging'
  )
  await waitFor(() => nativeDrags.length === beforeDrag + 1, 'native file drag IPC')
  assert.equal(
    nativeDrags[beforeDrag].file,
    await realpath(path.join(fixtures.samples, fixtures.validSample))
  )
  assert.equal(nativeDrags[beforeDrag].icon.isEmpty(), false)
  assert.deepEqual(nativeDrags[beforeDrag].icon.getSize(), { width: 64, height: 64 })
  const errorsBefore = await execute('globalThis.libraryTest.dragErrors.length')
  await execute('window.api.library.startDrag("file:///not-a-library-sample.wav")')
  await waitFor(
    () => execute(`globalThis.libraryTest.dragErrors.length === ${errorsBefore + 1}`),
    'unauthorized drag error'
  )
  assert.equal(nativeDrags.length, beforeDrag + 1, 'Arbitrary file paths must not be dragged')
  await execute(`${ctx.rowCode(fixtures.missingSample)}.scrollIntoView()`)
  await waitFor(
    () =>
      execute(`!${ctx.rowCode(fixtures.missingSample)}.querySelector("canvas[role=img]").hidden`),
    'waveform before file removal'
  )
  const removedFile = path.join(fixtures.samples, fixtures.missingSample)
  try {
    await rm(removedFile)
    await ctx.drag(fixtures.missingSample)
    await waitFor(
      () => execute(`!!${ctx.rowCode(fixtures.missingSample)}.querySelector("[role=alert]")`),
      'missing sample drag error'
    )
    assert.equal(nativeDrags.length, beforeDrag + 1)
    assert.ok(
      await execute(
        `${ctx.rowCode(fixtures.missingSample)}.querySelector("[role=alert]").textContent.includes("ENOENT")`
      )
    )
  } finally {
    await writeFile(removedFile, fixtures.wav)
  }
  await ctx.drag(fixtures.missingSample)
  await waitFor(() => nativeDrags.length === beforeDrag + 2, 'dragging restored sample')
  assert.equal(
    await execute(`${ctx.rowCode(fixtures.missingSample)}.querySelector("[role=alert]") !== null`),
    false
  )
}

export async function verifyPlaybackAndStreaming(ctx) {
  const { fixtures, execute, waitFor } = ctx
  await ctx.open(fixtures.samples)
  await execute(`
    document.querySelector("audio").muted = true;
    ${ctx.rowCode(fixtures.validSample)}.querySelector("[data-testid=preview-toggle]").click();
    ${ctx.rowCode(fixtures.otherSample)}.querySelector("[data-testid=preview-toggle]").click();
    ${ctx.rowCode(fixtures.validSample)}.querySelector("[data-testid=preview-toggle]").click();
  `)
  await ctx.waitForPlaying(fixtures.validSample)
  assert.equal(await execute('document.querySelectorAll("audio").length'), 1)
  assert.equal(
    await execute(
      'document.querySelectorAll("[data-testid=preview-toggle][aria-pressed=true]").length'
    ),
    1
  )
  const firstUrl = ctx.sample(fixtures.validSample).audioUrl
  assert.equal(
    await execute('document.querySelector("audio").src'),
    firstUrl,
    'Rapid switching must leave only the final sample playing'
  )
  assert.equal(
    await execute('document.querySelector("[data-testid=preview-error]") !== null'),
    false
  )
  await execute('document.querySelector("audio").pause()')
  await waitFor(
    () => execute('!document.querySelector("[data-testid=preview-toggle][aria-pressed=true]")'),
    'pausing with native controls'
  )
  await execute('document.querySelector("audio").play()')
  await ctx.waitForPlaying(fixtures.validSample)
  const range =
    await execute(`fetch(${JSON.stringify(firstUrl)}, { headers: { Range: "bytes=0-43" } })
    .then(async response => ({ status: response.status, bytes: (await response.arrayBuffer()).byteLength }))`)
  assert.deepEqual(range, { status: 206, bytes: 44 }, 'Audio access must support ranged playback')
  const suffix =
    await execute(`fetch(${JSON.stringify(firstUrl)}, { headers: { Range: "bytes=-44" } })
    .then(async response => ({ status: response.status, bytes: (await response.arrayBuffer()).byteLength }))`)
  assert.deepEqual(suffix, { status: 206, bytes: 44 })
  const head = await execute(`fetch(${JSON.stringify(firstUrl)}, { method: "HEAD" })
    .then(async response => ({ status: response.status, bytes: (await response.arrayBuffer()).byteLength }))`)
  assert.deepEqual(head, { status: 200, bytes: 0 })
  assert.equal(
    await execute(
      `fetch(${JSON.stringify(firstUrl)}, { headers: { Range: "bytes=999999999-" } }).then(response => response.status)`
    ),
    416
  )
  await ctx.preview(fixtures.otherSample)
  await ctx.waitForPlaying(fixtures.otherSample)
  assert.notEqual(await execute('document.querySelector("audio").src'), firstUrl)
  assert.equal(
    await execute(
      'document.querySelectorAll("[data-testid=preview-toggle][aria-pressed=true]").length'
    ),
    1
  )
  await ctx.preview(fixtures.otherSample)
  assert.ok(await execute('document.querySelector("audio").paused'))
  assert.equal(await execute('document.querySelector("audio").currentTime'), 0)
  await ctx.preview(fixtures.validSample)
  await ctx.waitForPlaying(fixtures.validSample)
  await execute(
    'document.querySelector("audio").currentTime = document.querySelector("audio").duration - 0.04'
  )
  await waitFor(
    () =>
      execute(
        'document.querySelector("audio").ended && !document.querySelector("[data-testid=preview-toggle][aria-pressed=true]")'
      ),
    'playback ending'
  )
  await ctx.preview(fixtures.invalidSample)
  await waitFor(
    () =>
      execute(
        `!!${ctx.rowCode(fixtures.invalidSample)}.querySelector("[data-testid=preview-error][role=alert]")`
      ),
    'preview format error'
  )
  await ctx.preview(fixtures.validSample)
  await ctx.waitForPlaying(fixtures.validSample)
  assert.equal(
    await execute('document.querySelector("[data-testid=preview-error]") !== null'),
    false
  )
}

export async function verifyFolderOutcomesAndRevocation(ctx) {
  const { fixtures, execute, waitFor, nativeDrags } = ctx
  await ctx.open(fixtures.samples)
  await execute('document.querySelector("audio").muted = true')
  await ctx.preview(fixtures.validSample)
  await ctx.waitForPlaying(fixtures.validSample)
  const previousUrl = ctx.sample(fixtures.validSample).audioUrl
  await execute('void (globalThis.libraryTest.previousAudio = document.querySelector("audio"))')
  await ctx.open(null)
  assert.deepEqual(await ctx.names(), fixtures.expected)
  assert.ok(
    await execute(
      'globalThis.libraryTest.previousAudio.paused && !globalThis.libraryTest.previousAudio.hasAttribute("src")'
    )
  )
  const beforeDrag = nativeDrags.length
  await ctx.drag(fixtures.validSample)
  await waitFor(() => nativeDrags.length === beforeDrag + 1, 'dragging after cancellation')
  await ctx.open(undefined)
  assert.ok(
    await execute(
      'document.querySelector("[data-testid=library-error]").textContent.includes("did not return a directory")'
    )
  )
  assert.deepEqual(await ctx.names(), fixtures.expected)
  await ctx.open(path.join(fixtures.samples, 'missing'))
  assert.ok(
    await execute(
      'document.querySelector("[data-testid=library-error]").textContent.includes("ENOENT")'
    )
  )
  assert.equal(
    await execute('document.querySelector("[data-testid=library-directory]").textContent'),
    `Folder: ${fixtures.samples}`
  )
  assert.deepEqual(await ctx.names(), fixtures.expected)
  await ctx.open(fixtures.empty)
  assert.ok(await execute('document.body.textContent.includes("No audio files")'))
  assert.equal(
    await execute('document.querySelector("[data-testid=library-error]") !== null'),
    false
  )
  assert.equal(
    await execute(`fetch(${JSON.stringify(previousUrl)}).then(response => response.status)`),
    403,
    'Previous folders must no longer be available'
  )
  const errorsBefore = await execute('globalThis.libraryTest.dragErrors.length')
  await execute(`window.api.library.startDrag(${JSON.stringify(previousUrl)})`)
  await waitFor(
    () => execute(`globalThis.libraryTest.dragErrors.length === ${errorsBefore + 1}`),
    'revoked drag source'
  )
  assert.equal(nativeDrags.length, beforeDrag + 1, 'Previous libraries must not remain draggable')
  await execute(`
    globalThis.libraryTest.unsubscribeDragErrors();
    globalThis.libraryTest.dragBarrierCount = 0;
    globalThis.libraryTest.unsubscribeBarrier = window.api.library.onDragError(() => globalThis.libraryTest.dragBarrierCount++);
    window.api.library.startDrag(${JSON.stringify(previousUrl)});
  `)
  try {
    await waitFor(
      () => execute('globalThis.libraryTest.dragBarrierCount === 1'),
      'processed event after unsubscription'
    )
    assert.equal(
      await execute('globalThis.libraryTest.dragErrors.length'),
      errorsBefore + 1,
      'Unsubscribed listeners must not receive events'
    )
  } finally {
    await execute('globalThis.libraryTest.unsubscribeBarrier(); void 0')
  }
}

export async function verifyLazyWaveforms(ctx) {
  const { fixtures, execute, waitFor } = ctx
  const lastSample = `audio${fixtures.largeSampleCount - 1}.wav`
  await execute('globalThis.libraryTest.waveformFetches.length = 0')
  await ctx.open(fixtures.large)
  assert.equal((await ctx.names()).length, fixtures.largeSampleCount)
  await execute('window.scrollTo(0, 0)')
  await waitFor(
    () =>
      execute(`
    (() => {
      const visible = Array.from(document.querySelectorAll("canvas[role=img]")).filter(canvas => {
        const rect = canvas.parentElement.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      });
      return visible.length > 0 && visible.every(canvas => !canvas.hidden);
    })()
  `),
    'visible waveforms'
  )
  const initialFetches = await execute('globalThis.libraryTest.waveformFetches.length')
  assert.ok(
    initialFetches > 0 && initialFetches < 20,
    'Initial waveforms must be bounded to visible rows and prefetch'
  )
  assert.ok(
    await execute(`${ctx.rowCode(lastSample)}.querySelector("canvas[role=img]").hidden`),
    'Distant samples must not be decoded initially'
  )
  assert.ok(
    await execute('document.documentElement.scrollHeight > window.innerHeight'),
    'Long lists must be scrollable'
  )
  await execute('window.scrollTo(0, document.documentElement.scrollHeight)')
  assert.ok(await execute('window.scrollY > 0'), 'Scrolling must not be blocked')
  await waitFor(
    () => execute(`!${ctx.rowCode(lastSample)}.querySelector("canvas[role=img]").hidden`),
    'waveforms after scrolling'
  )
  const finalFetches = await execute('globalThis.libraryTest.waveformFetches.length')
  assert.ok(
    finalFetches > initialFetches && finalFetches < fixtures.largeSampleCount,
    'Scrolling must load new rows without eagerly decoding the whole library'
  )
}
