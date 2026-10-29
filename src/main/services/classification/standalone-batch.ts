import path from 'node:path'
import type { DbClient } from '../../db'
import {
  classificationDigest as digest,
  serializeClassificationState as serialize,
  targetStateToken,
} from '../../db/operations/classification/target-state.ts'
import { ClassificationBatchReview } from './batch-review.ts'
import { createClassificationRecognizer } from './recognition.ts'
import type {
  RecognitionComponent,
  RecognitionProposal,
  RecognitionTarget,
} from '../classification/index.ts'
import type {
  ClassificationBatchSnapshot,
  ClassificationReviewSummary,
  ClassificationSubject,
} from '../../../shared/features/classification/batch-schemas.ts'
import {
  standaloneClassificationContextRequestSchema,
  standaloneClassificationContextSchema,
  type StandaloneClassificationContext,
} from '../../../shared/features/classification/standalone-context-schemas.ts'
import {
  classificationRejectionMemorySnapshotSchema,
  type ClassificationRejectionMemorySnapshot,
} from '../../../shared/features/classification/rejection-schemas.ts'
import { IpcError } from '../../../shared/ipc/result.ts'

type ContextTarget = StandaloneClassificationContext['targets'][number]
type Vocabulary = StandaloneClassificationContext['vocabulary']
type SnapshotTarget = ClassificationBatchSnapshot['targets'][number]
type SnapshotEvidence = SnapshotTarget['proposals'][number]['evidence'][number]

// The worker context read pages vocabulary and aliases 100 rows at a time.
const PAGE = 100

/** Selected existing catalog identity, never an import-local handle. */
export type StandaloneReviewSubject = { kind: 'sample' | 'pack'; id: string }

/** Narrow catalog reads this service needs; the review core performs no I/O. */
export type StandaloneReviewDatabase = Pick<
  DbClient,
  | 'readStandaloneClassificationContext'
  | 'readClassificationRejections'
  | 'executeStandaloneClassificationTarget'
>

export interface StandaloneReview {
  /** Binds the catalog state this snapshot was built from; not an execution
   * capability and invalidated by any later catalog or memory change.
   */
  token: string
  snapshot: ClassificationBatchSnapshot
  review: ClassificationBatchReview
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// Object field order is not significant; arrays keep their owner-defined order.
function stale(): never {
  throw new IpcError(
    'STALE_REVIEW',
    'Classification catalog inputs changed. Prepare the review again.',
  )
}

function protocol(): never {
  throw new IpcError(
    'PROTOCOL_ERROR',
    'Classification catalog context is incomplete.',
  )
}

function invalid(): never {
  throw new IpcError('INVALID_INPUT', 'Invalid classification review scope.')
}

function translate(error: unknown): never {
  if (error instanceof Error && 'code' in error) {
    if (error.code === 'STALE_REVIEW' || error.code === 'NOT_FOUND') {
      stale()
    }
    if (error.code === 'INVALID_INPUT') {
      throw new IpcError(
        'INVALID_INPUT',
        'Classification inputs exceed their safety limits.',
      )
    }
  }
  throw error
}

function parseSubjects(value: unknown): StandaloneReviewSubject[] {
  const parsed = standaloneClassificationContextRequestSchema.safeParse({
    targets: value,
  })
  if (!parsed.success) {
    invalid()
  }
  return parsed.data.targets
}

async function readPage(
  database: StandaloneReviewDatabase,
  input: Parameters<
    StandaloneReviewDatabase['readStandaloneClassificationContext']
  >[0],
): Promise<StandaloneClassificationContext> {
  const request = standaloneClassificationContextRequestSchema.safeParse(input)
  if (!request.success) {
    invalid()
  }
  let response: StandaloneClassificationContext
  try {
    response = await database.readStandaloneClassificationContext(request.data)
  } catch (error) {
    translate(error)
  }
  const parsed = standaloneClassificationContextSchema.safeParse(response)
  if (!parsed.success) {
    protocol()
  }
  const page = parsed.data
  if (
    (request.data.token !== undefined && page.token !== request.data.token) ||
    page.targets.length !== request.data.targets.length ||
    page.targets.some(
      (target, index) =>
        target.target.kind !== request.data.targets[index]?.kind ||
        target.target.id !== request.data.targets[index]?.id,
    )
  ) {
    protocol()
  }
  return page
}

/** A page is complete only when it carries every row its offset still owes. */
function checkPage(
  page: StandaloneClassificationContext,
  offset: number,
): void {
  const vocabulary = Math.min(PAGE, Math.max(0, page.vocabularyTotal - offset))
  const aliases = Math.min(PAGE, Math.max(0, page.aliasTotal - offset))
  if (page.vocabulary.length !== vocabulary || page.aliases.length > aliases) {
    protocol()
  }
}

interface StandaloneContext {
  token: string
  vocabulary: Vocabulary
  aliases: StandaloneClassificationContext['aliases']
  targets: StandaloneClassificationContext['targets']
}

/** Read the bounded vocabulary and the complete target echo, detecting any
 * catalog change between the first and the final page.
 */
async function readContext(
  database: StandaloneReviewDatabase,
  subjects: StandaloneReviewSubject[],
): Promise<StandaloneContext> {
  const header = await readPage(database, { targets: subjects })
  checkPage(header, 0)
  const echo = digest(header.targets)
  const totals = {
    vocabulary: header.vocabularyTotal,
    aliases: header.aliasTotal,
  }
  const vocabulary = [...header.vocabulary]
  const aliases = [...header.aliases]
  const total = Math.max(totals.vocabulary, totals.aliases)
  for (let offset = PAGE; offset < total; offset += PAGE) {
    const page = await readPage(database, {
      targets: subjects,
      token: header.token,
      offset,
    })
    if (
      page.vocabularyTotal !== totals.vocabulary ||
      page.aliasTotal !== totals.aliases ||
      digest(page.targets) !== echo
    ) {
      stale()
    }
    checkPage(page, offset)
    vocabulary.push(...page.vocabulary)
    aliases.push(...page.aliases)
  }
  const confirm = await readPage(database, {
    targets: subjects,
    token: header.token,
    offset: 0,
  })
  if (
    confirm.vocabularyTotal !== totals.vocabulary ||
    confirm.aliasTotal !== totals.aliases ||
    digest(confirm.targets) !== echo
  ) {
    stale()
  }
  checkPage(confirm, 0)
  return { token: header.token, vocabulary, aliases, targets: header.targets }
}

async function readRejections(
  database: StandaloneReviewDatabase,
  subjects: StandaloneReviewSubject[],
): Promise<ClassificationRejectionMemorySnapshot> {
  let response: ClassificationRejectionMemorySnapshot
  try {
    response = await database.readClassificationRejections({
      subjects: subjects.map(catalogSubject),
    })
  } catch (error) {
    translate(error)
  }
  const parsed = classificationRejectionMemorySnapshotSchema.safeParse(response)
  if (!parsed.success) {
    protocol()
  }
  return parsed.data
}

function catalogSubject(
  subject: StandaloneReviewSubject,
): ClassificationSubject {
  return { kind: subject.kind, identity: { kind: 'catalog', id: subject.id } }
}

function orderedComponents(
  components: Map<string, RecognitionComponent>,
): RecognitionComponent[] {
  return [...components.values()].sort((a, b) =>
    compare(a.occurrence, b.occurrence),
  )
}

/** Registered roots and their descendants, one clue per physical location. */
function sampleComponents(item: ContextTarget): RecognitionComponent[] {
  const result = new Map<string, RecognitionComponent>()
  for (const source of item.sources) {
    if (!source.relativePath) {
      continue
    }
    const parts = source.relativePath.split(path.sep)
    for (let index = 0; index <= parts.length; index += 1) {
      const location = path.join(source.rootPath, ...parts.slice(0, index))
      const previous = result.get(location)
      // A nested root re-observed as a folder keeps its nearest definition.
      if (previous && previous.kind !== 'root') {
        continue
      }
      result.set(location, {
        occurrence: location,
        kind:
          index === parts.length ? 'filename' : index === 0 ? 'root' : 'folder',
        text: path.basename(location),
        distance: parts.length - index,
        availability: 'cataloged',
      })
    }
  }
  return orderedComponents(result)
}

/** A Pack contributes its supplying root name only; it has no file observation. */
function rootComponents(item: ContextTarget): RecognitionComponent[] {
  const result = new Map<string, RecognitionComponent>()
  for (const source of item.sources) {
    result.set(source.rootPath, {
      occurrence: source.rootPath,
      kind: 'root',
      text: path.basename(source.rootPath),
      distance: 0,
      availability: 'cataloged',
    })
  }
  return orderedComponents(result)
}

function boundTarget(
  target: RecognitionTarget,
  vocabulary: Vocabulary,
): {
  dimension: 'instrument' | 'genre'
  key: string
  name: string
  entityId: string | null
} {
  const entry = vocabulary.find(
    (item) =>
      item.state !== 'deleted' &&
      item.dimension === target.dimension &&
      item.key === target.key,
  )
  if (!entry || entry.dimension === 'sample-type') {
    protocol()
  }
  return {
    dimension: entry.dimension,
    key: entry.key,
    name: entry.name,
    entityId: entry.entityId,
  }
}

function evidenceRow(
  evidence: RecognitionProposal['evidence'][number],
): SnapshotEvidence {
  return evidence.kind === 'path'
    ? { ...evidence, span: [evidence.span[0], evidence.span[1]] }
    : { ...evidence }
}

function proposalRow(
  proposal: RecognitionProposal,
  vocabulary: Vocabulary,
): SnapshotTarget['proposals'][number] {
  const target = proposal.target
  return {
    target:
      target.dimension === 'sample-type'
        ? {
            dimension: target.dimension,
            key:
              target.key === 'loop' || target.key === 'one-shot'
                ? target.key
                : protocol(),
          }
        : boundTarget(target, vocabulary),
    evidence: proposal.evidence.map(evidenceRow),
    // Standalone Pack Genres are saved before review, so Samples never depend
    // on a decision of the same session; dependency ordering belongs to execution.
    dependencies: [],
  }
}

function snapshotTarget(
  subject: StandaloneReviewSubject,
  item: ContextTarget,
  recognize: ReturnType<typeof createClassificationRecognizer>,
  vocabulary: Vocabulary,
): SnapshotTarget {
  const originPackId = item.originPackId
  const input =
    item.target.kind === 'sample'
      ? {
          kind: 'sample' as const,
          components: sampleComponents(item),
          packGenres:
            originPackId === null
              ? []
              : item.originGenreKeys.map((genreKey) => ({
                  packId: originPackId,
                  genreKey,
                })),
        }
      : { kind: 'pack' as const, components: rootComponents(item) }
  const result = recognize(input)
  return {
    subject: catalogSubject(subject),
    // Read-state digest: any changed identity, evidence or assignment source.
    // The worker recomputes this same function before writing a reviewed decision.
    stateToken: targetStateToken(item),
    currentType: item.currentType,
    assignments: item.assignments.map((assignment) => ({
      dimension: assignment.dimension,
      key: assignment.key,
    })),
    proposals: result.proposals.map((proposal) =>
      proposalRow(proposal, vocabulary),
    ),
    ambiguities: result.ambiguities.map((ambiguity) => ({
      ...ambiguity,
      evidence: ambiguity.evidence.map((evidence) => ({
        ...evidence,
        span: [evidence.span[0], evidence.span[1]],
      })),
    })),
  }
}

function buildSnapshot(
  context: StandaloneContext,
  subjects: StandaloneReviewSubject[],
): ClassificationBatchSnapshot {
  const recognize = createClassificationRecognizer(
    context.vocabulary
      .filter((entry) => entry.state !== 'deleted')
      .map((entry) => ({
        target: { dimension: entry.dimension, key: entry.key },
        name: entry.name,
        aliases: context.aliases
          .filter((alias) => alias.targetKey === entry.key)
          .map((alias) => alias.term),
      })),
  )
  const targets = context.targets.map((item, index) => {
    const subject = subjects[index]
    if (!subject) {
      protocol()
    }
    return snapshotTarget(subject, item, recognize, context.vocabulary)
  })
  targets.sort(
    (a, b) =>
      compare(a.subject.kind, b.subject.kind) ||
      compare(serialize(a.subject), serialize(b.subject)),
  )
  return { contractVersion: 1, targets }
}

/** Compose the authoritative catalog read into a session-only review core.
 * This preparation performs no catalog writes and grants no execution capability.
 */
export async function prepareStandaloneReview(
  database: StandaloneReviewDatabase,
  value: unknown,
): Promise<StandaloneReview> {
  const subjects = parseSubjects(value)
  const context = await readContext(database, subjects)
  const rejections = await readRejections(database, subjects)
  const snapshot = buildSnapshot(context, subjects)
  return {
    token: digest([context.token, snapshot, rejections.token]),
    snapshot,
    review: new ClassificationBatchReview(snapshot, rejections.rejections),
  }
}

/** Reconcile a live review with fresh catalog inputs and rejection memory,
 * preserving only exactly unchanged decisions.
 */
export async function refreshStandaloneReview(
  database: StandaloneReviewDatabase,
  review: ClassificationBatchReview,
  value: unknown,
): Promise<ClassificationReviewSummary & { invalidated: number }> {
  const subjects = parseSubjects(value)
  const context = await readContext(database, subjects)
  const rejections = await readRejections(database, subjects)
  return review.refresh(buildSnapshot(context, subjects), rejections.rejections)
}
