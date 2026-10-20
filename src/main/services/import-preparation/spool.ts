import { createHash } from 'node:crypto'
import { readFile, writeFile, rm, lstat } from 'node:fs/promises'
import path from 'node:path'
import { spooledCandidateSchema } from './schemas.ts'
import { PREPARATION_LIMITS, type PreparationCandidate } from './types.ts'

export class PreparationLimitError extends Error {}

// Only generated files under an exclusively owned mkdtemp directory are removed.
export class PreparationSpool {
  count = 0
  private bytes = 0
  private readonly directory: string
  private readonly preparationId: string

  constructor(directory: string, preparationId: string) {
    this.directory = directory
    this.preparationId = preparationId
  }

  candidateId(location: string): string {
    return createHash('sha256')
      .update(this.preparationId)
      .update('\0')
      .update(location)
      .digest('hex')
  }

  async read(id: string): Promise<PreparationCandidate | null> {
    if (!/^[a-f0-9]{64}$/u.test(id)) {
      throw new Error('Invalid spool identifier.')
    }
    const filename = path.join(this.directory, `${id}.json`)
    try {
      const info = await lstat(filename)
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.size > PREPARATION_LIMITS.spoolBytes
      ) {
        throw new Error('Invalid preparation spool file.')
      }
      const candidate = spooledCandidateSchema.parse(
        JSON.parse(await readFile(filename, 'utf8')),
      )
      if (
        candidate.id !== id ||
        candidate.catalog.canonicalPath !== candidate.file.path ||
        this.candidateId(candidate.file.path) !== id
      ) {
        throw new Error('Invalid preparation spool identity.')
      }
      return candidate
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return null
      }
      throw error
    }
  }

  async write(
    candidate: PreparationCandidate,
    existing: PreparationCandidate | null,
  ): Promise<void> {
    const contents = JSON.stringify(candidate)
    const previousBytes = existing
      ? Buffer.byteLength(JSON.stringify(existing))
      : 0
    const bytes =
      this.bytes +
      Buffer.byteLength(contents) -
      previousBytes +
      (existing ? 0 : 64)
    if (
      (!existing && this.count >= PREPARATION_LIMITS.candidates) ||
      bytes > PREPARATION_LIMITS.spoolBytes
    ) {
      throw new PreparationLimitError(
        'Import preparation exceeds its safety limit.',
      )
    }
    await writeFile(
      path.join(this.directory, `${candidate.id}.json`),
      contents,
      { mode: 0o600 },
    )
    if (!existing) {
      await writeFile(
        path.join(this.directory, `${this.count}.index`),
        candidate.id,
        { flag: 'wx', mode: 0o600 },
      )
      this.count++
    }
    this.bytes = bytes
  }

  async page(offset: number, limit: number): Promise<PreparationCandidate[]> {
    const items: PreparationCandidate[] = []
    for (let i = offset; i < Math.min(this.count, offset + limit); i++) {
      const id = await readFile(path.join(this.directory, `${i}.index`), 'utf8')
      const candidate = await this.read(id)
      if (!candidate) {
        throw new Error('Import preparation is incomplete.')
      }
      items.push(candidate)
    }
    return items
  }

  async dispose(): Promise<void> {
    await rm(this.directory, { recursive: true, force: true })
  }

  async *batches(): AsyncGenerator<PreparationCandidate[]> {
    for (let offset = 0; offset < this.count; offset += 100) {
      yield await this.page(offset, 100)
    }
  }
}
