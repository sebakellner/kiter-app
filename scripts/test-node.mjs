import { glob } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const files = []
for (const pattern of [
  'src/**/*.test.ts',
  'src/**/*.test.mjs',
  'tests/**/*.test.ts',
  'tests/**/*.test.mjs',
]) {
  for await (const file of glob(pattern)) {
    files.push(file)
  }
}
if (files.length === 0) {
  throw new Error('No Node tests discovered')
}
const result = spawnSync(
  process.execPath,
  [
    '--experimental-strip-types',
    '--test',
    ...process.argv.slice(2),
    ...files.sort(),
  ],
  {
    stdio: 'inherit',
  },
)
if (result.error) {
  throw result.error
}
process.exitCode = result.status ?? 1
