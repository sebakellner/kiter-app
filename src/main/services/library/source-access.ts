import { access, lstat, realpath } from 'node:fs/promises'
import { constants, lstatSync, realpathSync, accessSync } from 'node:fs'
import path from 'node:path'
import type { CatalogSample } from '../../../shared/ipc/library.ts'

interface SourceProbe {
  readonly path: string
  readonly isSymbolicLink: boolean
  readonly isFile: boolean
  readonly isDirectory: boolean
}

interface SourceIdentity {
  readonly root: string
  readonly target: string
}

interface SourceAccessMessages {
  readonly notRegular: string
  readonly locationChanged: string
}

// The native drag gesture needs a synchronous variant, so the I/O differs. The
// rule must not: only these messages are allowed to differ per entry point.
const ASYNC_MESSAGES: SourceAccessMessages = {
  notRegular:
    'The source is not a regular audio file within its registered folder.',
  locationChanged: 'The source location changed.',
}

const SYNC_MESSAGES: SourceAccessMessages = {
  notRegular: 'The source is unavailable.',
  locationChanged: 'The source location changed.',
}

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

// The single authorization rule: every component from the registered folder
// down to the file must be a real entry (never a symbolic link, directories
// above the file), and both endpoints must already be their canonical path.
function requireAuthorizedSource(
  probes: readonly SourceProbe[],
  declared: SourceIdentity,
  canonical: SourceIdentity,
  messages: SourceAccessMessages,
): void {
  for (const probe of probes) {
    if (
      probe.isSymbolicLink ||
      (probe.path === declared.target ? !probe.isFile : !probe.isDirectory)
    ) {
      throw new Error(messages.notRegular)
    }
  }
  if (
    canonical.root !== declared.root ||
    canonical.target !== declared.target
  ) {
    throw new Error(messages.locationChanged)
  }
}

export async function verifyCatalogSource(
  sample: CatalogSample,
): Promise<void> {
  const components = sourceComponents(sample)
  const root = components[0]
  const probes: SourceProbe[] = []
  for (const component of components) {
    const info = await lstat(component)
    probes.push({
      path: component,
      isSymbolicLink: info.isSymbolicLink(),
      isFile: info.isFile(),
      isDirectory: info.isDirectory(),
    })
  }
  requireAuthorizedSource(
    probes,
    { root, target: sample.path },
    { root: await realpath(root), target: await realpath(sample.path) },
    ASYNC_MESSAGES,
  )
  await access(sample.path, constants.R_OK)
}

// Only the bounded path chain is checked during a native drag gesture.
export function verifyCatalogSourceSync(sample: CatalogSample): void {
  const components = sourceComponents(sample)
  const root = components[0]
  const probes = components.map<SourceProbe>((component) => {
    const info = lstatSync(component)
    return {
      path: component,
      isSymbolicLink: info.isSymbolicLink(),
      isFile: info.isFile(),
      isDirectory: info.isDirectory(),
    }
  })
  requireAuthorizedSource(
    probes,
    { root, target: sample.path },
    { root: realpathSync(root), target: realpathSync(sample.path) },
    SYNC_MESSAGES,
  )
  accessSync(sample.path, constants.R_OK)
}
