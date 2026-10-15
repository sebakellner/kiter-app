import { app, dialog } from 'electron'
import { createRequire } from 'node:module'

if (!process.env.KITER_TEST_USER_DATA) {
  throw new Error('Missing isolated Electron test userData')
}
app.setPath('userData', process.env.KITER_TEST_USER_DATA)
dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
// Register the production protocols before Electron becomes ready.
createRequire(import.meta.url)('../../../out/main/index.js')
