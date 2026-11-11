import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import type { TitleBarOverlay } from 'electron'
import {
  MACOS_TRAFFIC_LIGHT_GAP,
  MACOS_TRAFFIC_LIGHT_INSET,
  MACOS_TRAFFIC_LIGHT_ROW,
  WINDOW_BACKGROUND_COLOR,
  WINDOW_CONTROL_SYMBOL_COLOR,
  WINDOW_HEADER_BACKGROUND_COLOR,
  WINDOW_HEADER_HEIGHT,
} from '../shared/window-chrome.ts'
import { windowChromeOptions } from './window-chrome.ts'
import type { WindowChromeOptions } from './window-chrome.ts'

const TOKENS = fileURLToPath(new URL('../styles/tokens.css', import.meta.url))

/** Windows must use the object form; the boolean shorthand cannot match the band. */
function requireOverlay(options: WindowChromeOptions): TitleBarOverlay {
  const overlay = options.titleBarOverlay
  if (overlay === undefined || typeof overlay === 'boolean') {
    assert.fail('Windows must use the object form of the title-bar overlay')
  }
  return overlay
}

async function readToken(name: string): Promise<string> {
  const css = await readFile(TOKENS, 'utf8')
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(css)
  assert.ok(match, `${name} is missing from src/styles/tokens.css`)
  return match[1].trim()
}

test('macOS hides the title bar and leaves the traffic lights to Electron', () => {
  const options = windowChromeOptions('darwin')
  const overlay = requireOverlay(options)

  assert.equal(options.titleBarStyle, 'hidden')
  assert.equal(overlay.height, WINDOW_HEADER_HEIGHT)
  // Electron centers the traffic lights only while their margin stays at the
  // system default (window_buttons_proxy.mm). An explicit trafficLightPosition
  // switches to `height - buttonHeight - margin.y`, which pushes the buttons
  // out of the band, so the height is the only thing that may set the centering.
  assert.equal(
    options.trafficLightPosition,
    undefined,
    'an explicit traffic light position stops Electron from centering the buttons',
  )
})

test('the macOS header inset clears the whole traffic light row', () => {
  assert.ok(
    MACOS_TRAFFIC_LIGHT_INSET >
      MACOS_TRAFFIC_LIGHT_ROW + MACOS_TRAFFIC_LIGHT_GAP,
    'header content must start after the traffic lights plus a gap',
  )
})

test('Windows hides the title bar and sizes the native overlay to the header band', () => {
  const options = windowChromeOptions('win32')
  const overlay = requireOverlay(options)

  assert.equal(options.titleBarStyle, 'hidden')
  assert.equal(overlay.height, WINDOW_HEADER_HEIGHT)
  assert.equal(
    overlay.color,
    WINDOW_HEADER_BACKGROUND_COLOR,
    'the overlay must blend into the header instead of splitting it',
  )
  assert.equal(overlay.symbolColor, WINDOW_CONTROL_SYMBOL_COLOR)
  assert.equal(options.trafficLightPosition, undefined)
})

test('Linux keeps the native frame because it is outside the supported targets', () => {
  const options = windowChromeOptions('linux')

  assert.equal(options.titleBarStyle, undefined)
  assert.equal(options.titleBarOverlay, undefined)
  assert.equal(options.trafficLightPosition, undefined)
})

test('every platform paints the window with the page surface', () => {
  for (const platform of ['darwin', 'win32'] as const) {
    assert.equal(
      windowChromeOptions(platform).backgroundColor,
      WINDOW_BACKGROUND_COLOR,
    )
  }
})

test('the window colors mirror the design tokens they duplicate', async () => {
  assert.equal(WINDOW_BACKGROUND_COLOR, await readToken('--color-surface-page'))
  assert.equal(
    WINDOW_HEADER_BACKGROUND_COLOR,
    await readToken('--color-surface-soft'),
  )
  assert.equal(
    WINDOW_CONTROL_SYMBOL_COLOR,
    await readToken('--color-text-secondary'),
  )
})
