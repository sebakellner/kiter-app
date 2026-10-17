import { access, lstat, realpath } from 'node:fs/promises'
import { constants, lstatSync, realpathSync, accessSync } from 'node:fs'
import path from 'node:path'
import type { CatalogSample } from '../../../shared/ipc/library.ts'

function sourceComponents(sample: CatalogSample): string[] {
  if (!sample.rootPath) {
    throw new Error('No registered source folder authorizes this sample.')
  }
  const relative = path.relative(sample.rootPath, sample.path)
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('The sample is outside its registered source folder.')
  }
  let current = sample.rootPath
  return [
    current,
    ...relative.split(path.sep).map((part) => {
      current = path.join(current, part)
      return current
    }),
  ]
}

export async function verifyCatalogSource(
  sample: CatalogSample,
): Promise<void> {
  const components = sourceComponents(sample)
  for (const component of components) {
    const info = await lstat(component)
    if (
      info.isSymbolicLink() ||
      (component === sample.path ? !info.isFile() : !info.isDirectory())
    ) {
      throw new Error(
        'The source is not a regular audio file within its registered folder.',
      )
    }
  }
  if (
    (await realpath(sample.rootPath!)) !== sample.rootPath ||
    (await realpath(sample.path)) !== sample.path
  ) {
    throw new Error('The source location changed.')
  }
  await access(sample.path, constants.R_OK)
}

// Only the bounded path chain is checked during a native drag gesture.
export function verifyCatalogSourceSync(sample: CatalogSample): void {
  for (const component of sourceComponents(sample)) {
    const info = lstatSync(component)
    if (
      info.isSymbolicLink() ||
      (component === sample.path ? !info.isFile() : !info.isDirectory())
    ) {
      throw new Error('The source is unavailable.')
    }
  }
  if (
    realpathSync(sample.rootPath!) !== sample.rootPath ||
    realpathSync(sample.path) !== sample.path
  ) {
    throw new Error('The source location changed.')
  }
  accessSync(sample.path, constants.R_OK)
}
