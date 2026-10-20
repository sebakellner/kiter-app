import { createHash } from 'node:crypto'
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { z } from 'zod'
import {
  classificationReviewRowSchema,
  type ClassificationReviewRow,
} from '../../../shared/features/classification/batch-schemas.ts'
import { PreparationLimitError } from './spool.ts'
import { classificationRecordSchema } from './schemas.ts'

export const IMPORT_CLASSIFICATION_LIMITS = {
  records: 20032,
  proposals: 100000,
  evidence: 500000,
  bytes: 256 * 1024 * 1024,
  recordBytes: 8 * 1024 * 1024,
} as const

export type ClassificationRecord = z.infer<typeof classificationRecordSchema>
export type StagedClassification = {
  fingerprint: string
  decision: 'accept' | 'reject'
}

export interface ImportClassificationSummary {
  preparationId: string
  revision: number
  classificationToken: string
  targets: number
  proposals: number
  reviewable: number
  ambiguities: number
  requiredCreations: number
  typeReplacements: number
  accepted: number
  rejected: number
  invalidated: number
}

// Immutable generation after publication. Its parent is the owned candidate spool;
// failed nested cleanup remains covered by preparation discard/close.
export class ClassificationSpool {
  private readonly records: {
    id: string
    rows: number
    ambiguities: number
    decisions: number
    digest: string
  }[] = []
  private readonly lookup = new Map<string, string>()
  private readonly recordIndexes = new Map<string, number>()
  private readonly hash = createHash('sha256')
  private bytes = 0
  private evidence = 0
  private ambiguityCount = 0
  private readonly creations = new Set<string>()
  readonly choices = new Map<string, StagedClassification>()
  readonly counts = {
    targets: 0,
    proposals: 0,
    reviewable: 0,
    typeReplacements: 0,
    accepted: 0,
    rejected: 0,
  }
  digest = ''
  private readonly directory: string

  constructor(directory: string) {
    this.directory = directory
  }

  static async create(parent: string): Promise<ClassificationSpool> {
    return new ClassificationSpool(
      await mkdtemp(path.join(parent, 'classification-')),
    )
  }

  async append(record: ClassificationRecord): Promise<void> {
    if (this.digest) {
      throw new Error(
        'Cannot append to a finished import classification generation.',
      )
    }
    const contents = JSON.stringify(record)
    const bytes = Buffer.byteLength(contents)
    const nextBytes = this.bytes + bytes
    const nextEvidence =
      this.evidence +
      record.rows.reduce((sum, row) => sum + row.evidence.length, 0) +
      record.ambiguities.reduce(
        (sum, ambiguity) => sum + ambiguity.evidence.length,
        0,
      )
    if (
      this.records.length >= IMPORT_CLASSIFICATION_LIMITS.records ||
      nextBytes > IMPORT_CLASSIFICATION_LIMITS.bytes ||
      bytes > IMPORT_CLASSIFICATION_LIMITS.recordBytes ||
      nextEvidence > IMPORT_CLASSIFICATION_LIMITS.evidence ||
      this.counts.proposals + record.rows.length >
        IMPORT_CLASSIFICATION_LIMITS.proposals
    ) {
      throw new PreparationLimitError(
        'Import classification exceeds its safety limit.',
      )
    }
    await writeFile(path.join(this.directory, `${record.id}.json`), contents, {
      flag: 'wx',
      mode: 0o600,
    })
    this.bytes = nextBytes
    this.evidence = nextEvidence
    this.recordIndexes.set(record.id, this.records.length)
    this.records.push({
      id: record.id,
      rows: record.rows.length,
      ambiguities: record.ambiguities.length,
      decisions: record.rows.filter((row) => row.decision !== 'unreviewed')
        .length,
      digest: createHash('sha256').update(contents).digest('hex'),
    })
    this.hash.update(contents).update('\n')
    this.counts.targets++
    this.ambiguityCount += record.ambiguities.length
    for (const row of record.rows) {
      if (this.lookup.has(row.proposalKey)) {
        throw new Error('Duplicate import classification proposal.')
      }
      this.lookup.set(row.proposalKey, record.id)
      this.counts.proposals++
      if (row.reviewable) {
        this.counts.reviewable++
        if (
          row.target.dimension !== 'sample-type' &&
          row.target.entityId === null
        ) {
          this.creations.add(
            JSON.stringify([row.target.dimension, row.target.key]),
          )
        }
        if (row.replacesType) {
          this.counts.typeReplacements++
        }
      }
      if (row.decision !== 'unreviewed') {
        this.choices.set(row.proposalKey, {
          fingerprint: row.fingerprint,
          decision: row.decision,
        })
        if (row.decision === 'accept') {
          this.counts.accepted++
        } else {
          this.counts.rejected++
        }
      }
    }
  }

  finish(): void {
    this.digest = this.hash.digest('hex')
  }

  summary(
    preparationId: string,
    revision: number,
    invalidated = 0,
  ): ImportClassificationSummary {
    return {
      preparationId,
      revision,
      ...this.counts,
      classificationToken: createHash('sha256')
        .update(
          JSON.stringify([
            'import-classification-v1',
            preparationId,
            revision,
            this.digest,
          ]),
        )
        .digest('hex'),
      ambiguities: this.ambiguityCount,
      requiredCreations: this.creations.size,
      invalidated,
    }
  }

  private async read(id: string): Promise<ClassificationRecord> {
    const filename = path.join(this.directory, `${id}.json`)
    const info = await lstat(filename)
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size > IMPORT_CLASSIFICATION_LIMITS.recordBytes
    ) {
      throw new Error('Invalid import classification spool file.')
    }
    const contents = await readFile(filename, 'utf8')
    const index = this.recordIndexes.get(id)
    if (
      index === undefined ||
      createHash('sha256').update(contents).digest('hex') !==
        this.records[index].digest
    ) {
      throw new Error('Import classification spool content changed.')
    }
    const record = classificationRecordSchema.parse(JSON.parse(contents))
    if (record.id !== id) {
      throw new Error('Invalid import classification spool identity.')
    }
    return record
  }

  async proposal(
    key: string,
  ): Promise<ClassificationRecord['rows'][number] | undefined> {
    const id = this.lookup.get(key)
    return id
      ? (await this.read(id)).rows.find((row) => row.proposalKey === key)
      : undefined
  }

  async page(
    offset: number,
    limit: number,
    kind: 'proposals' | 'ambiguities' | 'decisions',
  ): Promise<{
    items: ClassificationReviewRow[]
    ambiguities: (ClassificationRecord['ambiguities'][number] & {
      subject: ClassificationRecord['subject']
    })[]
    total: number
    nextOffset: number | null
  }> {
    const items: ClassificationReviewRow[] = []
    const ambiguities: (ClassificationRecord['ambiguities'][number] & {
      subject: ClassificationRecord['subject']
    })[] = []
    let skipped = 0
    for (const entry of this.records) {
      const count =
        kind === 'proposals'
          ? entry.rows
          : kind === 'decisions'
            ? entry.decisions
            : entry.ambiguities
      if (skipped + count <= offset) {
        skipped += count
        continue
      }
      const record = await this.read(entry.id)
      const start = Math.max(0, offset - skipped)
      if (kind !== 'ambiguities') {
        const rows =
          kind === 'decisions'
            ? record.rows.filter((row) => row.decision !== 'unreviewed')
            : record.rows
        items.push(
          ...rows.slice(start, start + limit - items.length).map((row) =>
            classificationReviewRowSchema.parse({
              proposalKey: row.proposalKey,
              target: row.target,
              evidence: row.evidence,
              dependencies: row.dependencies,
              subject: row.subject,
              stateToken: row.stateToken,
              currentType: row.currentType,
              replacesType: row.replacesType,
              evidenceKeys: row.evidenceKeys,
              remembered: row.remembered,
              reviewable: row.reviewable,
              assigned: row.assigned,
              decision: row.decision,
            }),
          ),
        )
      } else {
        ambiguities.push(
          ...record.ambiguities
            .slice(start, start + limit - ambiguities.length)
            .map((ambiguity) => ({
              ...ambiguity,
              subject: record.subject,
            })),
        )
      }
      skipped += count
      if (items.length + ambiguities.length >= limit) {
        break
      }
    }
    const total =
      kind === 'proposals'
        ? this.counts.proposals
        : kind === 'decisions'
          ? this.counts.accepted + this.counts.rejected
          : this.ambiguityCount
    const next = offset + items.length + ambiguities.length
    return { items, ambiguities, total, nextOffset: next < total ? next : null }
  }

  async *batches(): AsyncGenerator<ClassificationRecord[]> {
    for (const record of this.records) {
      yield [await this.read(record.id)]
    }
  }

  async dispose(): Promise<void> {
    await rm(this.directory, { recursive: true, force: true })
  }
}
