import type { BrowserWindowConstructorOptions } from 'electron'
import {
  WINDOW_BACKGROUND_COLOR,
  WINDOW_CONTROL_SYMBOL_COLOR,
  WINDOW_HEADER_BACKGROUND_COLOR,
  WINDOW_HEADER_HEIGHT,
} from '../shared/window-chrome.ts'

export type WindowChromeOptions = Pick<
  BrowserWindowConstructorOptions,
  | 'backgroundColor'
  | 'titleBarStyle'
  | 'titleBarOverlay'
  | 'trafficLightPosition'
>

/**
 * Windows draws the caption buttons with these colours; macOS ignores the
 * colours and uses only the height.
 */
const TITLE_BAR_OVERLAY = {
  color: WINDOW_HEADER_BACKGROUND_COLOR,
  symbolColor: WINDOW_CONTROL_SYMBOL_COLOR,
  height: WINDOW_HEADER_HEIGHT,
} as const

/**
 * The shell draws its own header band, so the native title bar is hidden on the
 * platforms we ship. Every other platform keeps the default frame.
 *
 * macOS centers its traffic lights inside the overlay height. That centering
 * only survives while their margin stays at the system default, so this must
 * not set `trafficLightPosition`: an explicit position switches Electron to
 * `height - buttonHeight - margin.y` and pushes the buttons out of the band.
 *
 * Windows keeps the real caption buttons through the same overlay, which
 * preserves snap layouts, DPI scaling, and accessibility without renderer-drawn
 * controls.
 */
export function windowChromeOptions(
  platform: NodeJS.Platform,
): WindowChromeOptions {
  const chrome: WindowChromeOptions = {
    backgroundColor: WINDOW_BACKGROUND_COLOR,
  }

  if (platform === 'darwin' || platform === 'win32') {
    return {
      ...chrome,
      titleBarStyle: 'hidden',
      titleBarOverlay: { ...TITLE_BAR_OVERLAY },
    }
  }

  return chrome
}
