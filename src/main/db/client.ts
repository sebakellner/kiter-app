import { join } from 'node:path'
import { WorkerTransport } from './client/worker-transport.ts'
import type { ClientCore } from './client/core.ts'
import { createClientCore } from './client/core.ts'
import type { ImportsCommands } from './client/imports.ts'
import { importsCommands } from './client/imports.ts'
import type { RecognitionCommands } from './client/recognition.ts'
import { recognitionCommands } from './client/recognition.ts'
import type { ClassificationCommands } from './client/classification.ts'
import { classificationCommands } from './client/classification.ts'
import type { PacksCommands } from './client/packs.ts'
import { packsCommands } from './client/packs.ts'
import type { CollectionsCommands } from './client/collections.ts'
import { collectionsCommands } from './client/collections.ts'
import type { SamplesCommands } from './client/samples.ts'
import { samplesCommands } from './client/samples.ts'
import type { AssetsCommands } from './client/assets.ts'
import { assetsCommands } from './client/assets.ts'
import type { LibraryCommands } from './client/library.ts'
import { libraryCommands } from './client/library.ts'
import type { ProfileCommands } from './client/profile.ts'
import { profileCommands } from './client/profile.ts'

export type DbClient = ClientCore &
  ImportsCommands &
  RecognitionCommands &
  ClassificationCommands &
  PacksCommands &
  CollectionsCommands &
  SamplesCommands &
  AssetsCommands &
  LibraryCommands &
  ProfileCommands

export const DbClient = {
  // `fromTransport` composes the worker transport, which tests can supply
  // directly.
  fromTransport(transport: WorkerTransport): DbClient {
    const core = createClientCore(transport)
    return {
      ...core,
      ...importsCommands(core.request),
      ...recognitionCommands(core.request),
      ...classificationCommands(core.request),
      ...packsCommands(core.request),
      ...collectionsCommands(core.request),
      ...samplesCommands(core.request),
      ...assetsCommands(core.request),
      ...libraryCommands(core.request, transport),
      ...profileCommands(core.request, transport),
    }
  },

  async open(
    filename: string,
    options: {
      backupDirectory?: string
      imagesDirectory?: string
      restoreFrom?: string
    } = {},
  ): Promise<DbClient> {
    return DbClient.fromTransport(
      await WorkerTransport.open(filename, {
        workerPath: join(__dirname, 'dbWorker.js'),
        migrationsFolder: join(__dirname, 'migrations'),
        ...options,
      }),
    )
  },
}
