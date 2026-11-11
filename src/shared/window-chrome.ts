/**
 * Geometry and colors shared by the window process and the renderer.
 *
 * The shell header and the native window chrome must agree on a single band
 * height: the Windows title-bar overlay is drawn by the operating system at
 * exactly this height, and the macOS traffic lights are centered inside it. The
 * numbers live here so the two sides cannot drift apart.
 */

/** Height of the integrated header band, in CSS pixels. */
export const WINDOW_HEADER_HEIGHT = 72

/** macOS draws twelve-pixel traffic light buttons separated by eight-pixel gaps. */
export const MACOS_TRAFFIC_LIGHT_SIZE = 12
export const MACOS_TRAFFIC_LIGHT_GAP = 8

/** Width of the three traffic light buttons with their gaps. */
export const MACOS_TRAFFIC_LIGHT_ROW =
  MACOS_TRAFFIC_LIGHT_SIZE * 3 + MACOS_TRAFFIC_LIGHT_GAP * 2

/**
 * Left padding the renderer keeps so header content clears the traffic lights.
 *
 * macOS places the row itself and Electron only centers it vertically inside
 * the band, so this is a generous floor rather than an exact measurement.
 */
export const MACOS_TRAFFIC_LIGHT_INSET = 88

/** Mirrors `--color-surface-page` in `src/styles/tokens.css`. */
export const WINDOW_BACKGROUND_COLOR = '#08090a'

/** Mirrors `--color-surface-soft` in `src/styles/tokens.css`. */
export const WINDOW_HEADER_BACKGROUND_COLOR = '#15171a'

/** Mirrors `--color-text-secondary` in `src/styles/tokens.css`. */
export const WINDOW_CONTROL_SYMBOL_COLOR = '#bfc0c2'

/** Platforms the shell can adapt its window chrome to. */
export type WindowPlatform = 'darwin' | 'win32' | 'linux' | 'unknown'
