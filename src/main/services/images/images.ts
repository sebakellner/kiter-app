import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import {
  lstat,
  mkdir,
  open,
  opendir,
  realpath,
  unlink,
  link,
} from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { DbClient } from '../../db/index.ts'
import type {
  ImageAsset,
  ImageTarget,
  ImageReferenceRequest,
} from '../../../shared/domain/imageAsset.ts'
import {
  IMAGE_MAX_BYTES,
  isImageTarget,
  isNullableAssetId,
  isImageAsset,
} from '../../../shared/domain/imageAsset.ts'
import { DomainValidationError } from '../../../shared/domain/validation.ts'
import { validateImage } from './validation.ts'

type ImageDatabase = Pick<
  DbClient,
  | 'publishImage'
  | 'setImageReference'
  | 'getImage'
  | 'listImages'
  | 'claimImageCleanup'
  | 'finishImageCleanup'
>

export interface ImageRecoveryReport {
  removed: number
  failures: Array<{
    assetId: string | null
    code: 'CLEANUP_FAILED' | 'IMAGE_UNAVAILABLE'
  }>
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function rejectSymlinks(path: string): Promise<void> {
  let current = resolve(path)
  while (true) {
    if ((await lstat(current)).isSymbolicLink()) {
      throw new DomainValidationError(
        'Symbolic links are not accepted for managed images.',
      )
    }
    const parent = dirname(current)
    if (parent === current) {
      return
    }
    current = parent
  }
}

export class ManagedImages {
  private queue: Promise<unknown> = Promise.resolve()
  private closed = false
  private readonly directory: string
  private readonly database: ImageDatabase

  private constructor(directory: string, database: ImageDatabase) {
    this.directory = directory
    this.database = database
  }

  static async open(
    userData: string,
    database: ImageDatabase,
  ): Promise<ManagedImages> {
    // Electron owns userData; canonicalize it once (macOS temporary roots can
    // themselves have system aliases), then reject links in managed directories.
    const base = await realpath(userData)
    const library = join(base, 'library')
    const directory = join(library, 'images')
    for (const path of [library, directory]) {
      await mkdir(path, { recursive: true })
      const info = await lstat(path)
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error('Managed image storage is unavailable.')
      }
    }
    return new ManagedImages(directory, database)
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error('Managed images are shutting down.'))
    }
    const result = this.queue.then(async () => {
      await rejectSymlinks(this.directory)
      return operation()
    })
    this.queue = result.catch(() => undefined)
    return result
  }

  async close(): Promise<void> {
    this.closed = true
    await this.queue
  }

  replace(
    target: ImageTarget,
    expectedAssetId: string | null,
    selectedPath: string,
  ): Promise<ImageAsset> {
    return this.run(async () => {
      if (!isImageTarget(target) || !isNullableAssetId(expectedAssetId)) {
        throw new DomainValidationError('Invalid image target.')
      }
      // Paths are accepted only by this main-only API, after local selection.
      const canonicalPath = await realpath(selectedPath)
      await rejectSymlinks(resolve(selectedPath))
      const source = await open(
        canonicalPath,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      )
      let bytes: Buffer
      try {
        const info = await source.stat()
        if (!info.isFile() || info.size < 1 || info.size > IMAGE_MAX_BYTES) {
          throw new DomainValidationError(
            'Choose an image no larger than 10 MiB.',
          )
        }
        const buffer = Buffer.alloc(IMAGE_MAX_BYTES + 1)
        let length = 0
        while (length < buffer.length) {
          const read = await source.read(
            buffer,
            length,
            buffer.length - length,
            null,
          )
          if (read.bytesRead === 0) {
            break
          }
          length += read.bytesRead
        }
        bytes = buffer.subarray(0, length)
      } finally {
        await source.close()
      }
      const validated = await validateImage(bytes)
      const id = randomUUID()
      const asset: ImageAsset = {
        id,
        storageKey: `${id}.${validated.extension}`,
        mimeType: validated.mimeType,
        width: validated.width,
        height: validated.height,
        byteSize: bytes.length,
        state: 'ready',
      }
      const temporary = join(this.directory, `${id}.tmp`)
      const destination = join(this.directory, asset.storageKey)
      const output = await open(temporary, 'wx', 0o600)
      try {
        await output.writeFile(bytes)
        await output.sync()
      } finally {
        await output.close()
      }
      // Hard-link publication is exclusive and atomic on this same directory.
      // Interrupted temp/publication files are reclaimed by reconciliation.
      await link(temporary, destination)
      await unlink(temporary)
      return this.database.publishImage({ target, expectedAssetId, asset })
    })
  }

  setReference(
    input: ImageReferenceRequest,
  ): Promise<{ assetId: string | null }> {
    return this.run(async () => {
      if (input.assetId !== null) {
        const asset = await this.database.getImage(input.assetId)
        if (!asset || asset.state !== 'ready') {
          throw new Error('The managed image is unavailable.')
        }
        await this.checkFile(asset)
      }
      return this.database.setImageReference(input)
    })
  }

  private async checkFile(asset: ImageAsset): Promise<void> {
    if (!isImageAsset(asset)) {
      throw new Error('Invalid managed image metadata.')
    }
    const info = await lstat(join(this.directory, asset.storageKey))
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size !== asset.byteSize
    ) {
      throw new Error('The managed image is unavailable.')
    }
  }

  reconcile(): Promise<ImageRecoveryReport> {
    return this.run(async () => {
      const report: ImageRecoveryReport = { removed: 0, failures: [] }
      let after: string | null = null
      while (true) {
        const page = await this.database.listImages(after)
        if (page.length === 0) {
          break
        }
        for (const asset of page) {
          let failureCode: 'CLEANUP_FAILED' | 'IMAGE_UNAVAILABLE' =
            'CLEANUP_FAILED'
          try {
            const claim = await this.database.claimImageCleanup(asset.id)
            if (!claim) {
              failureCode = 'IMAGE_UNAVAILABLE'
              await this.checkFile(asset)
              continue
            }
            if (!isImageAsset(claim) || claim.state !== 'cleanup_pending') {
              throw new Error('Invalid cleanup claim')
            }
            await this.removeFile(claim.storageKey)
            await this.database.finishImageCleanup(claim.id)
            report.removed++
          } catch {
            report.failures.push({
              assetId: asset.id,
              code: failureCode,
            })
          }
        }
        after = page[page.length - 1].id
      }
      const directory = await opendir(this.directory)
      for await (const entry of directory) {
        // Only UUID filenames owned by this workflow are eligible. Leave all
        // unknown entries, links and directories untouched and report them.
        const match =
          /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(png|jpg|webp|tmp)$/.exec(
            entry.name,
          )
        if (!match) {
          continue
        }
        try {
          const asset = await this.database.getImage(match[1])
          if (asset && asset.storageKey === entry.name) {
            continue
          }
          await this.removeFile(entry.name)
          report.removed++
        } catch {
          report.failures.push({ assetId: match[1], code: 'CLEANUP_FAILED' })
        }
      }
      return report
    })
  }

  private async removeFile(key: string): Promise<void> {
    const path = join(this.directory, key)
    try {
      const info = await lstat(path)
      if (!info.isFile() || info.isSymbolicLink()) {
        throw new Error('Unsafe managed image entry.')
      }
      await unlink(path)
    } catch (error) {
      if (!isMissing(error)) {
        throw error
      }
    }
  }
}
