import { createHash, randomUUID } from 'node:crypto'
import type { z } from 'zod'
import {
  CLASSIFICATION_BATCH_LIMITS as limits,
  classificationAcceptAllSchema,
  classificationBatchSnapshotSchema,
  classificationDecisionsSchema,
  classificationEvidenceSchema,
  classificationRejectionsSchema,
  classificationReviewPageSchema,
  classificationSubjectSchema,
} from '../../../shared/features/classification/batch-schemas.ts'
import type {
  ClassificationBatchSnapshot,
  ClassificationBatchDraft,
  ClassificationReviewRow,
  ClassificationRejection,
  ClassificationReviewReference,
  ClassificationReviewSummary,
  ClassificationReviewPage,
  ClassificationAmbiguityRow,
  ClassificationSubject,
} from '../../../shared/features/classification/batch-schemas.ts'
import type { RecognitionTarget } from '../../../shared/domain/recognition.ts'
import { recognitionTokens } from '../../../shared/domain/recognition.ts'
import type { ClassificationStateFields } from '../../../shared/features/classification/state-fields.ts'
import { isEntityId, isRecord } from '../../../shared/domain/validation.ts'
import { IpcError } from '../../../shared/ipc/result.ts'

export type { ClassificationReviewRow } from '../../../shared/features/classification/batch-schemas.ts'

type ReviewRow = ClassificationReviewRow & { fingerprint: string }

/** Reused by spooled import review; each chunk remains bounded by this contract.
 * Global scope tokens and group atomicity belong to its owning coordinator.
 */
export function prepareClassificationReviewRows(
  snapshot: unknown,
  rejections: unknown = [],
  includeRejected = false,
): ReviewRow[] {
  return makeRows(
    normalizeSnapshot(snapshot),
    normalizeRejections(rejections),
    includeRejected,
  )
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new IpcError('INVALID_INPUT', 'Invalid classification review input.')
  }
  return result.data
}

function invalid(): never {
  throw new IpcError(
    'INVALID_INPUT',
    'Inconsistent classification review scope.',
  )
}

// Object field order is not significant; arrays are explicitly ordered by owners.
function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    isRecord(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => compare(a, b)),
        )
      : item,
  )
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function digest(value: unknown): string {
  return createHash('sha256').update(serialize(value)).digest('hex')
}

function subjectKey(subject: ClassificationSubject): string {
  return serialize(subject)
}

function targetKey(target: RecognitionTarget): string {
  return serialize([target.dimension, target.key])
}

function proposalKey(
  subject: ClassificationSubject,
  target: RecognitionTarget,
): string {
  return digest([
    'classification-proposal-v1',
    subject,
    target.dimension,
    target.key,
  ])
}

/** Import-local Pack evidence must not collide with catalog or other drafts. */
export function classificationPackEvidenceId(value: unknown): string {
  const subject = parse(classificationSubjectSchema, value)
  if (subject.kind !== 'pack') {
    invalid()
  }
  return subject.identity.kind === 'catalog'
    ? subject.identity.id
    : serialize([
        'import-pack',
        subject.identity.preparationId,
        subject.identity.id,
      ])
}

/** Evidence identity deliberately excludes rule provenance and display spelling. */
export function classificationEvidenceKey(value: unknown): string {
  const evidence = parse(classificationEvidenceSchema, value)
  if (evidence.kind === 'pack-genre') {
    return digest([
      'classification-evidence-v1',
      'pack-genre',
      evidence.packId,
      evidence.genreKey,
    ])
  }
  const clue = recognitionTokens(evidence.clue, true)
  if (!clue.length) {
    invalid()
  }
  return digest([
    'classification-evidence-v1',
    'path',
    evidence.occurrence,
    clue,
  ])
}

function ordered<T>(values: T[]): T[] {
  return values.sort((a, b) => compare(serialize(a), serialize(b)))
}

function unique<T>(values: T[]): T[] {
  return [...new Map(values.map((value) => [serialize(value), value])).values()]
}

function rejectionScope(
  subject: ClassificationSubject,
  target: RecognitionTarget,
): string {
  return proposalKey(subject, target)
}

function normalizeSnapshot(value: unknown): ClassificationBatchSnapshot {
  const snapshot = parse(classificationBatchSnapshotSchema, value)
  if (Buffer.byteLength(serialize(snapshot), 'utf8') > limits.serializedBytes) {
    invalid()
  }
  let proposalCount = 0
  let evidenceCount = 0
  const subjects = new Set<string>()
  const bindings = new Map<string, string>()
  const preparations = new Set<string>()
  for (const item of snapshot.targets) {
    const key = subjectKey(item.subject)
    if (subjects.has(key)) {
      invalid()
    }
    subjects.add(key)
    if (item.subject.identity.kind === 'import') {
      preparations.add(item.subject.identity.preparationId)
    }
    if (item.subject.kind === 'pack' && item.currentType !== null) {
      invalid()
    }
    const assigned = item.assignments.map(targetKey)
    if (
      new Set(assigned).size !== assigned.length ||
      item.assignments.some((target) => target.dimension === 'sample-type')
    ) {
      invalid()
    }
    ordered(item.assignments)
    const manual = item.draftAssignments ?? []
    if (
      manual.length &&
      (item.subject.kind !== 'pack' || item.subject.identity.kind !== 'import')
    ) {
      invalid()
    }
    if (new Set(manual.map(targetKey)).size !== manual.length) {
      invalid()
    }
    ordered(manual)
    for (const target of manual) {
      if (target.dimension === 'sample-type' || target.entityId === null) {
        invalid()
      }
      const identity = targetKey(target)
      const binding = serialize(target)
      const previous = bindings.get(identity)
      if (previous && previous !== binding) {
        invalid()
      }
      bindings.set(identity, binding)
    }
    const proposals = new Set<string>()
    let types = 0
    for (const proposal of item.proposals) {
      proposalCount++
      evidenceCount += proposal.evidence.length
      const identity = targetKey(proposal.target)
      if (proposals.has(identity)) {
        invalid()
      }
      proposals.add(identity)
      if (proposal.target.dimension === 'sample-type') {
        types++
        if (item.subject.kind !== 'sample' || types > 1) {
          invalid()
        }
      } else {
        const binding = serialize(proposal.target)
        const previous = bindings.get(identity)
        if (previous && previous !== binding) {
          invalid()
        }
        bindings.set(identity, binding)
      }
      if (
        item.subject.kind === 'pack' &&
        proposal.evidence.some(
          (evidence) =>
            evidence.kind !== 'path' || evidence.component !== 'root',
        )
      ) {
        invalid()
      }
      if (
        proposal.evidence.some(
          (evidence) =>
            evidence.kind === 'pack-genre' &&
            (proposal.target.dimension !== 'genre' ||
              evidence.genreKey !== proposal.target.key),
        )
      ) {
        invalid()
      }
      proposal.evidence = ordered(unique(proposal.evidence))
      if (
        unique(proposal.dependencies).length !== proposal.dependencies.length
      ) {
        invalid()
      }
      ordered(proposal.dependencies)
    }
    ordered(item.proposals)
    for (const ambiguity of item.ambiguities) {
      evidenceCount += ambiguity.evidence.length
      ordered(ambiguity.targets)
      ambiguity.evidence = ordered(unique(ambiguity.evidence))
      if (
        (ambiguity.reason === 'contradictory-type') !==
          (ambiguity.dimension === 'sample-type') ||
        (item.subject.kind === 'pack' &&
          (ambiguity.dimension === 'sample-type' ||
            ambiguity.evidence.some(
              (evidence) => evidence.component !== 'root',
            ))) ||
        ambiguity.targets.some(
          (target) => target.dimension !== ambiguity.dimension,
        )
      ) {
        invalid()
      }
    }
    item.ambiguities = ordered(unique(item.ambiguities))
  }
  if (
    proposalCount > limits.proposals ||
    evidenceCount > limits.evidence ||
    preparations.size > 1
  ) {
    invalid()
  }
  // Pack → Sample is the only dependency direction, so cycles cannot be staged.
  for (const item of snapshot.targets) {
    for (const proposal of item.proposals) {
      for (const evidence of proposal.evidence) {
        if (evidence.kind !== 'pack-genre') {
          continue
        }
        const selectedPack = snapshot.targets.find(
          (candidate) =>
            candidate.subject.kind === 'pack' &&
            classificationPackEvidenceId(candidate.subject) === evidence.packId,
        )
        if (!selectedPack) {
          // Unselected catalog Packs can supply existing Genre evidence. An
          // import-local Pack cannot supply evidence outside this draft scope.
          if (!isEntityId(evidence.packId)) {
            invalid()
          }
          continue
        }
        const assigned = selectedPack.assignments.some(
          (assignment) =>
            assignment.dimension === 'genre' &&
            assignment.key === evidence.genreKey,
        )
        if (
          !assigned &&
          !proposal.dependencies.some(
            (dependency) =>
              subjectKey(dependency.subject) ===
                subjectKey(selectedPack.subject) &&
              dependency.genreKey === evidence.genreKey,
          )
        ) {
          invalid()
        }
      }
      for (const dependency of proposal.dependencies) {
        const pack = snapshot.targets.find(
          (candidate) =>
            subjectKey(candidate.subject) === subjectKey(dependency.subject),
        )
        const genre = pack?.proposals.find(
          (candidate) =>
            candidate.target.dimension === 'genre' &&
            candidate.target.key === dependency.genreKey,
        )
        const manualGenre = pack?.draftAssignments?.some(
          (target) =>
            target.dimension === 'genre' && target.key === dependency.genreKey,
        )
        if (
          item.subject.kind !== 'sample' ||
          dependency.subject.kind !== 'pack' ||
          proposal.target.dimension !== 'genre' ||
          (!genre && !manualGenre) ||
          dependency.genreKey !== proposal.target.key ||
          !proposal.evidence.some(
            (evidence) =>
              evidence.kind === 'pack-genre' &&
              evidence.packId ===
                classificationPackEvidenceId(dependency.subject) &&
              evidence.genreKey === dependency.genreKey,
          )
        ) {
          invalid()
        }
      }
    }
  }
  snapshot.targets.sort(
    (a, b) =>
      compare(a.subject.kind, b.subject.kind) ||
      compare(subjectKey(a.subject), subjectKey(b.subject)),
  )
  return snapshot
}

function normalizeRejections(value: unknown): ClassificationRejection[] {
  const records = parse(classificationRejectionsSchema, value)
  if (
    Buffer.byteLength(serialize(records), 'utf8') > limits.serializedBytes ||
    records.reduce((count, record) => count + record.evidenceKeys.length, 0) >
      limits.evidence
  ) {
    invalid()
  }
  for (const record of records) {
    if (
      record.target.dimension === 'sample-type' &&
      (record.subject.kind !== 'sample' ||
        !['loop', 'one-shot'].includes(record.target.key))
    ) {
      invalid()
    }
    record.evidenceKeys = [...new Set(record.evidenceKeys)].sort(compare)
  }
  return ordered(unique(records))
}

function makeRows(
  snapshot: ClassificationBatchSnapshot,
  rejections: ClassificationRejection[],
  includeRejected: boolean,
): ReviewRow[] {
  const memory = new Map<string, Set<string>>()
  for (const record of rejections) {
    const key = rejectionScope(record.subject, record.target)
    const keys = memory.get(key) ?? new Set<string>()
    for (const evidence of record.evidenceKeys) {
      keys.add(evidence)
    }
    memory.set(key, keys)
  }
  const rows: ReviewRow[] = []
  const manualFingerprints = new Map<string, string>()
  for (const item of snapshot.targets) {
    for (const target of item.draftAssignments ?? []) {
      manualFingerprints.set(
        proposalKey(item.subject, target),
        digest([item.subject, item.stateToken, target]),
      )
    }
    for (const proposal of item.proposals) {
      const key = proposalKey(item.subject, proposal.target)
      const evidenceKeys = [
        ...new Set(proposal.evidence.map(classificationEvidenceKey)),
      ].sort(compare)
      const remembered = evidenceKeys.every((evidence) =>
        memory.get(key)?.has(evidence),
      )
      const assigned =
        proposal.target.dimension === 'sample-type'
          ? item.currentType === proposal.target.key
          : item.assignments.some(
              (target) => targetKey(target) === targetKey(proposal.target),
            )
      const draftAssigned = (item.draftAssignments ?? []).some(
        (target) => targetKey(target) === targetKey(proposal.target),
      )
      rows.push({
        ...proposal,
        proposalKey: key,
        subject: item.subject,
        stateToken: item.stateToken,
        currentType: item.currentType,
        replacesType:
          proposal.target.dimension === 'sample-type' &&
          item.currentType !== null &&
          item.currentType !== proposal.target.key,
        evidenceKeys,
        remembered,
        assigned,
        ...(draftAssigned ? { draftAssigned: true } : {}),
        reviewable:
          !assigned && !draftAssigned && (!remembered || includeRejected),
        decision: 'unreviewed',
        fingerprint: digest([
          item.stateToken,
          item.assignments,
          item.currentType,
          proposal,
          ...(item.draftAssignments?.length ? [item.draftAssignments] : []),
        ]),
      })
    }
  }
  const byKey = new Map(rows.map((row) => [row.proposalKey, row]))
  for (const row of rows) {
    row.fingerprint = digest([
      row.fingerprint,
      row.dependencies.map(
        (dependency) =>
          byKey.get(
            proposalKey(dependency.subject, {
              dimension: 'genre',
              key: dependency.genreKey,
            }),
          )?.fingerprint ??
          manualFingerprints.get(
            proposalKey(dependency.subject, {
              dimension: 'genre',
              key: dependency.genreKey,
            }),
          ),
      ),
    ])
  }
  return rows
}

function publicRow(row: ReviewRow): ClassificationReviewRow {
  return structuredClone({
    proposalKey: row.proposalKey,
    subject: row.subject,
    stateToken: row.stateToken,
    target: row.target,
    evidence: row.evidence,
    dependencies: row.dependencies,
    currentType: row.currentType,
    replacesType: row.replacesType,
    evidenceKeys: row.evidenceKeys,
    remembered: row.remembered,
    reviewable: row.reviewable,
    assigned: row.assigned,
    ...(row.draftAssigned ? { draftAssigned: true } : {}),
    decision: row.decision,
  })
}

/** Bounded session-only review core. No catalog reads, writes, IPC or authorization.
 * Only a trusted owner may supply fresh snapshots; exported drafts are not consent
 * to execute and must be revalidated by future durable confirmation/execution.
 */
export class ClassificationBatchReview {
  private readonly reviewId = randomUUID()
  private revision = 1
  private snapshot: ClassificationBatchSnapshot
  private rejections: ClassificationRejection[]
  private rows: ReviewRow[]
  private discarded = false
  private readonly includeRejected: boolean

  constructor(
    snapshot: unknown,
    rejections: unknown = [],
    includeRejected = false,
  ) {
    if (typeof includeRejected !== 'boolean') {
      invalid()
    }
    this.includeRejected = includeRejected
    this.snapshot = normalizeSnapshot(snapshot)
    this.rejections = normalizeRejections(rejections)
    this.rows = makeRows(this.snapshot, this.rejections, includeRejected)
  }

  private assertLive(): void {
    if (this.discarded) {
      throw new IpcError(
        'NOT_FOUND',
        'The classification review was discarded.',
      )
    }
  }

  private reference(): ClassificationReviewReference {
    this.assertLive()
    return {
      reviewId: this.reviewId,
      revision: this.revision,
      token: digest([
        'classification-review-v1',
        this.reviewId,
        this.revision,
        this.snapshot,
        this.rejections,
        this.includeRejected,
        this.rows.map((row) => [row.proposalKey, row.decision]),
      ]),
    }
  }

  private check(reference: ClassificationReviewReference): void {
    const current = this.reference()
    if (
      reference.reviewId !== current.reviewId ||
      reference.revision !== current.revision ||
      reference.token !== current.token
    ) {
      throw new IpcError('STALE_REVIEW', 'Reload the classification review.')
    }
  }

  getReference(): ClassificationReviewReference {
    return this.reference()
  }

  /** Reviewed field digests for one subject, when its snapshot captured them.
   *
   * Explanation only: execution compares these after the enforcing read-state
   * token has already refused the write, so a missing value costs the explanation
   * and never the guard.
   */
  stateFieldsFor(
    subject: ClassificationSubject,
  ): ClassificationStateFields | undefined {
    this.assertLive()
    const key = subjectKey(subject)
    return this.snapshot.targets.find(
      (target) => subjectKey(target.subject) === key,
    )?.stateFields
  }

  getSummary(): ClassificationReviewSummary {
    const reviewable = this.rows.filter((row) => row.reviewable)
    return {
      ...this.reference(),
      contractVersion: 1 as const,
      targets: this.snapshot.targets.length,
      proposals: this.rows.length,
      reviewable: reviewable.length,
      remembered: this.rows.filter((row) => row.remembered).length,
      ambiguities: this.snapshot.targets.reduce(
        (count, item) => count + item.ambiguities.length,
        0,
      ),
      requiredCreations: new Set(
        reviewable
          .filter(
            (row) =>
              row.target.dimension !== 'sample-type' &&
              row.target.entityId === null,
          )
          .map((row) => targetKey(row.target)),
      ).size,
      typeReplacements: reviewable.filter((row) => row.replacesType).length,
      accepted: this.rows.filter((row) => row.decision === 'accept').length,
      rejected: this.rows.filter((row) => row.decision === 'reject').length,
    }
  }

  listProposals(
    request: unknown,
  ): ClassificationReviewPage<ClassificationReviewRow> {
    const input = parse(classificationReviewPageSchema, request)
    this.check(input)
    const end = input.offset + input.limit
    return {
      ...this.reference(),
      items: this.rows.slice(input.offset, end).map(publicRow),
      total: this.rows.length,
      nextOffset: end < this.rows.length ? end : null,
    }
  }

  listAmbiguities(
    request: unknown,
  ): ClassificationReviewPage<ClassificationAmbiguityRow> {
    const input = parse(classificationReviewPageSchema, request)
    this.check(input)
    const items = this.snapshot.targets.flatMap((target) =>
      target.ambiguities.map((ambiguity) => ({
        subject: target.subject,
        ...ambiguity,
      })),
    )
    const end = input.offset + input.limit
    return {
      ...this.reference(),
      items: structuredClone(items.slice(input.offset, end)),
      total: items.length,
      nextOffset: end < items.length ? end : null,
    }
  }

  stage(request: unknown): ClassificationReviewSummary {
    const input = parse(classificationDecisionsSchema, request)
    this.check(input)
    const byKey = new Map(this.rows.map((row) => [row.proposalKey, row]))
    const keys = new Set<string>()
    for (const choice of input.choices) {
      const row = byKey.get(choice.proposalKey)
      if (!row?.reviewable || keys.has(choice.proposalKey)) {
        invalid()
      }
      keys.add(choice.proposalKey)
    }
    // Validate the complete group before publishing any decision.
    for (const choice of input.choices) {
      const row = byKey.get(choice.proposalKey)
      if (row) {
        row.decision = choice.decision
      }
    }
    this.revision++
    return this.getSummary()
  }

  /** The supplied reference covers the whole scope, not a page or local filter. */
  acceptAll(request: unknown): ClassificationReviewSummary {
    const input = parse(classificationAcceptAllSchema, request)
    this.check(input)
    for (const row of this.rows) {
      if (row.reviewable) {
        row.decision = 'accept'
      }
    }
    this.revision++
    return this.getSummary()
  }

  /** Reconcile authoritative inputs, preserving only exactly unchanged decisions. */
  refresh(
    snapshot: unknown,
    rejections: unknown = this.rejections,
  ): ClassificationReviewSummary & { invalidated: number } {
    this.assertLive()
    const nextSnapshot = normalizeSnapshot(snapshot)
    const nextRejections = normalizeRejections(rejections)
    const nextRows = makeRows(
      nextSnapshot,
      nextRejections,
      this.includeRejected,
    )
    const previous = new Map(this.rows.map((row) => [row.proposalKey, row]))
    let invalidated = 0
    for (const row of nextRows) {
      const old = previous.get(row.proposalKey)
      if (
        old &&
        row.reviewable &&
        row.fingerprint === old.fingerprint &&
        row.remembered === old.remembered
      ) {
        row.decision = old.decision
      }
    }
    for (const old of this.rows) {
      if (
        old.decision !== 'unreviewed' &&
        !nextRows.some(
          (row) =>
            row.proposalKey === old.proposalKey &&
            row.decision === old.decision,
        )
      ) {
        invalidated++
      }
    }
    this.snapshot = nextSnapshot
    this.rejections = nextRejections
    this.rows = nextRows
    this.revision++
    return { ...this.getSummary(), invalidated }
  }

  exportDraft(request: unknown): ClassificationBatchDraft {
    this.check(parse(classificationAcceptAllSchema, request))
    const decisions = this.rows.filter((row) => row.decision !== 'unreviewed')
    const byKey = new Map(this.rows.map((row) => [row.proposalKey, row]))
    const dependencyBlocks = decisions
      .filter((row) => row.decision === 'accept')
      .flatMap((row) =>
        row.dependencies
          .filter((dependency) => {
            const upstream = byKey.get(
              proposalKey(dependency.subject, {
                dimension: 'genre',
                key: dependency.genreKey,
              }),
            )
            const manual = this.snapshot.targets.some(
              (target) =>
                subjectKey(target.subject) === subjectKey(dependency.subject) &&
                target.draftAssignments?.some(
                  (assignment) =>
                    assignment.dimension === 'genre' &&
                    assignment.key === dependency.genreKey,
                ),
            )
            return (
              !manual && !upstream?.assigned && upstream?.decision !== 'accept'
            )
          })
          .map((dependency) => ({ proposalKey: row.proposalKey, dependency })),
      )
    const remember: ClassificationRejection[] = decisions
      .filter((row) => row.decision === 'reject')
      .map((row) => ({
        contractVersion: 1,
        subject: row.subject,
        target: { dimension: row.target.dimension, key: row.target.key },
        evidenceKeys: row.evidenceKeys,
      }))
    return structuredClone({
      ...this.reference(),
      contractVersion: 1 as const,
      ...(this.snapshot.targets.some(
        (target) => target.draftAssignments?.length,
      )
        ? {
            explicitAssignments: this.snapshot.targets
              .filter((target) => target.draftAssignments?.length)
              .map((target) => ({
                subject: target.subject,
                assignments: target.draftAssignments ?? [],
              })),
          }
        : {}),
      // Neither this flag nor the review token is an execution capability.
      dependenciesSatisfied: dependencyBlocks.length === 0,
      dependencyBlocks,
      decisions: decisions.map(publicRow),
      rejectionChanges: {
        remember,
        forget: decisions
          .filter((row) => row.decision === 'accept')
          .map((row) => ({
            subject: row.subject,
            target: { dimension: row.target.dimension, key: row.target.key },
          })),
      },
    })
  }

  discard(): void {
    this.discarded = true
    this.snapshot = { contractVersion: 1, targets: [] }
    this.rejections = []
    this.rows = []
  }
}
