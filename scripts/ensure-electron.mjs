// Restores the Electron binary when a previous install left the package without
// it. The download cache keeps the zip, so this only has to extract it.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const electronDir = fileURLToPath(
  new URL('../node_modules/electron', import.meta.url),
)
const installer = join(electronDir, 'install.js')
const executableName =
  process.platform === 'win32' ? 'electron.exe' : 'electron'
const overrideDistPath = process.env.ELECTRON_OVERRIDE_DIST_PATH
const skipDownload = process.env.ELECTRON_SKIP_BINARY_DOWNLOAD

function readExecutablePath() {
  if (overrideDistPath) {
    const overridden = join(overrideDistPath, executableName)
    return existsSync(overridden) ? overridden : null
  }
  try {
    const relative = readFileSync(join(electronDir, 'path.txt'), 'utf-8').trim()
    if (relative.length === 0) {
      return null
    }
    const executable = join(electronDir, 'dist', relative)
    return existsSync(executable) ? executable : null
  } catch {
    return null
  }
}

if (overrideDistPath || skipDownload) {
  // A custom binary location or an explicit opt-out is the developer's setup,
  // not a broken install: reinstalling would ignore it. Leave the outcome to
  // electron-vite instead of blocking a configuration that already worked.
  process.exit(0)
}

if (!existsSync(installer)) {
  console.error(
    '[ensure-electron] Electron is not installed. Run `pnpm install` first.',
  )
  process.exit(1)
}

if (readExecutablePath() !== null) {
  process.exit(0)
}

console.log(
  '[ensure-electron] Electron binary is missing; restoring it from the local cache.',
)

try {
  execFileSync(process.execPath, [installer], {
    cwd: electronDir,
    stdio: 'inherit',
  })
} catch {
  // The verification below owns the actionable message.
}

if (readExecutablePath() === null) {
  console.error(
    '[ensure-electron] Electron binary is still missing after reinstalling it.',
  )
  console.error(
    '  Retry with `pnpm rebuild electron`, or `node node_modules/electron/install.js`.',
  )
  console.error(
    '  If the download fails, retry against the official mirror: ELECTRON_MIRROR=https://github.com/electron/electron/releases/download/ pnpm rebuild electron',
  )
  process.exit(1)
}
