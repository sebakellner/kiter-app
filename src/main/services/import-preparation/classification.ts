import { createHash } from 'node:crypto'
import path from 'node:path'
import type { DbClient } from '../../db'
import {
  createClassificationRecognizer,
  prepareClassificationReviewRows,
  classificationPackEvidenceId,
} from '../classification/index.ts'
import type {
  RecognitionComponent,
  RecognitionEvidence,
  RecognitionResult,
} from '../classification/index.ts'
import type {
  ClassificationBatchSnapshot,
  ClassificationSubject,
} from '../../../shared/features/classification/batch-schemas.ts'
import {
  importClassificationContextSchema,
  type ImportClassificationContext,
} from '../../../shared/features/classification/import-context-schemas.ts'
import { IpcError } from '../../../shared/ipc/result.ts'
import {
  ClassificationSpool,
  type ClassificationRecord,
  type StagedClassification,
} from './classification-spool.ts'
import { reviewCandidate } from './selection.ts'
import type { PreparationSpool } from './spool.ts'
import type {
  CandidateChoice,
  ImportPreparation,
  PreparationCandidate,
  PreparationRoot,
  ReviewCandidate,
} from './types.ts'

type TargetSnapshot = ClassificationBatchSnapshot['targets'][number]
type SavedTarget = ImportClassificationContext['targets'][number]
type Vocabulary = ImportClassificationContext['vocabulary']
type ContextDatabase = Pick<DbClient, 'readImportClassificationContext'>

export interface ImportClassificationState {
  active: boolean
  revision: number | null
  generation: ClassificationSpool | null
  choices: Map<string, StagedClassification>
  invalidated: Set<string>
  cleanupFailed: boolean
}

export function emptyClassificationState(): ImportClassificationState {
  return {
    active: false,
    revision: null,
    generation: null,
    choices: new Map(),
    invalidated: new Set(),
    cleanupFailed: false,
  }
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function subject(
  kind: 'sample' | 'pack',
  id: string,
  preparationId?: string,
): ClassificationSubject {
  return {
    kind,
    identity: preparationId
      ? { kind: 'import', preparationId, id }
      : { kind: 'catalog', id },
  }
}

function packSubject(
  summary: ImportPreparation,
  root: PreparationRoot,
): ClassificationSubject {
  return root.catalog?.pack
    ? subject('pack', root.catalog.pack.id)
    : subject('pack', root.id, summary.id)
}

function contextKey(target: { kind: string; id: string }): string {
  return JSON.stringify([target.kind, target.id])
}

async function readContext(
  database: ContextDatabase,
  input: Parameters<ContextDatabase['readImportClassificationContext']>[0],
): Promise<ImportClassificationContext> {
  let response: ImportClassificationContext
  try {
    response = await database.readImportClassificationContext(input)
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      if (error.code === 'STALE_REVIEW' || error.code === 'NOT_FOUND') {
        throw new IpcError(
          'STALE_REVIEW',
          'Classification catalog inputs changed. Prepare suggestions again.',
        )
      }
      if (error.code === 'INVALID_INPUT') {
        throw new IpcError(
          'INVALID_INPUT',
          'Classification catalog context exceeds its safety limits.',
        )
      }
    }
    throw error
  }
  const result = importClassificationContextSchema.safeParse(response)
  if (
    !result.success ||
    (input.token && result.data.token !== input.token) ||
    result.data.targets.length !== (input.targets?.length ?? 0) ||
    result.data.targets.some(
      (target, index) =>
        contextKey(target.target) !==
        contextKey(input.targets?.[index] ?? { kind: '', id: '' }),
    )
  ) {
    throw new IpcError(
      'PROTOCOL_ERROR',
      'Classification catalog context is incomplete.',
    )
  }
  return result.data
}

async function loadVocabulary(database: ContextDatabase): Promise<{
  token: string
  vocabulary: Vocabulary
  recognize: (
    input: Parameters<ReturnType<typeof createClassificationRecognizer>>[0],
  ) => RecognitionResult
}> {
  const vocabulary: Vocabulary = []
  const aliases: ImportClassificationContext['aliases'] = []
  let token: string | undefined
  let total: number | undefined
  for (let offset = 0; ; offset += 100) {
    const page = await readContext(database, { offset, token })
    token = page.token
    const nextTotal = Math.max(page.vocabularyTotal, page.aliasTotal)
    if (
      (total !== undefined && total !== nextTotal) ||
      page.vocabulary.length !==
        Math.min(100, Math.max(0, page.vocabularyTotal - offset))
    ) {
      throw new IpcError(
        'PROTOCOL_ERROR',
        'Classification vocabulary pages are incomplete.',
      )
    }
    total = nextTotal
    vocabulary.push(...page.vocabulary)
    aliases.push(...page.aliases)
    if (offset + 100 >= total) {
      break
    }
  }
  return {
    token,
    vocabulary,
    recognize: createClassificationRecognizer(
      vocabulary
        .filter((entry) => entry.state !== 'deleted')
        .map((entry) => ({
          target: { dimension: entry.dimension, key: entry.key },
          name: entry.name,
          aliases: aliases
            .filter((alias) => alias.targetKey === entry.key)
            .map((alias) => alias.term),
        })),
    ),
  }
}

async function savedTargets(
  database: ContextDatabase,
  token: string,
  targets: { kind: 'sample' | 'pack'; id: string }[],
): Promise<Map<string, SavedTarget>> {
  const distinct = [
    ...new Map(targets.map((target) => [contextKey(target), target])).values(),
  ]
  const result = new Map<string, SavedTarget>()
  for (let offset = 0; offset < distinct.length; offset += 100) {
    const page = await readContext(database, {
      targets: distinct.slice(offset, offset + 100),
      token,
    })
    for (const target of page.targets) {
      result.set(contextKey(target.target), target)
    }
  }
  return result
}

function components(
  summary: ImportPreparation,
  candidate: PreparationCandidate,
): RecognitionComponent[] {
  const result = new Map<string, RecognitionComponent>()
  for (const occurrence of candidate.occurrences) {
    const root = summary.roots.find((root) => root.id === occurrence.rootId)
    if (!root) {
      throw new Error('Classification root is missing.')
    }
    const parts = occurrence.relativePath.split(path.sep)
    for (let index = 0; index <= parts.length; index++) {
      const location = path.join(root.location, ...parts.slice(0, index))
      const previous = result.get(location)
      if (!previous || previous.kind === 'root') {
        result.set(location, {
          occurrence: location,
          kind:
            index === parts.length
              ? 'filename'
              : index === 0
                ? 'root'
                : 'folder',
          text: path.basename(location),
          distance: parts.length - index,
          availability: 'observed',
        })
      }
    }
  }
  return [...result.values()].sort((a, b) =>
    a.occurrence < b.occurrence ? -1 : a.occurrence > b.occurrence ? 1 : 0,
  )
}

function evidenceRows(
  evidence: RecognitionEvidence[],
): TargetSnapshot['proposals'][number]['evidence'] {
  return evidence.map((item) =>
    item.kind === 'path'
      ? { ...item, span: [item.span[0], item.span[1]] }
      : { ...item },
  )
}

function makeSnapshot(
  owner: ClassificationSubject,
  state: unknown,
  result: RecognitionResult,
  vocabulary: Vocabulary,
  saved?: SavedTarget,
): TargetSnapshot {
  return {
    subject: owner,
    stateToken: hash(state),
    assignments: saved?.assignments ?? [],
    currentType: saved?.currentType ?? null,
    proposals: result.proposals.map((proposal) => {
      const target = proposal.target
      if (target.dimension === 'sample-type') {
        if (target.key !== 'loop' && target.key !== 'one-shot') {
          throw new Error('Invalid recognized Sample type.')
        }
        return {
          target: { dimension: target.dimension, key: target.key },
          evidence: evidenceRows(proposal.evidence),
          dependencies: [],
        }
      }
      const entry = vocabulary.find(
        (entry) =>
          entry.state !== 'deleted' &&
          entry.dimension === target.dimension &&
          entry.key === target.key,
      )
      if (!entry) {
        throw new Error('Recognized classification binding is missing.')
      }
      return {
        target: {
          dimension: target.dimension,
          key: target.key,
          name: entry.name,
          entityId: entry.entityId,
        },
        evidence: evidenceRows(proposal.evidence),
        dependencies: [],
      }
    }),
    ambiguities: result.ambiguities.map((ambiguity) => ({
      ...ambiguity,
      evidence: ambiguity.evidence.map((item) => ({
        ...item,
        span: [item.span[0], item.span[1]],
      })),
    })),
  }
}

function origin(
  summary: ImportPreparation,
  candidate: ReviewCandidate,
): ClassificationSubject | null {
  if (summary.mode === 'standalone' || candidate.originResolution === 'keep') {
    return candidate.catalog.sample?.packId
      ? subject('pack', candidate.catalog.sample.packId)
      : null
  }
  const root = summary.roots.find(
    (root) => root.id === candidate.destinationRootId,
  )
  return root ? packSubject(summary, root) : null
}

export async function buildImportClassifications(
  database: ContextDatabase,
  summary: ImportPreparation,
  candidates: PreparationSpool,
  choices: ReadonlyMap<string, CandidateChoice>,
  staged: ReadonlyMap<string, StagedClassification>,
  invalidated: ReadonlySet<string>,
): Promise<ClassificationSpool> {
  const generation = await ClassificationSpool.create(candidates.directory)
  try {
    const catalog = await loadVocabulary(database)
    const savedPacks = await savedTargets(
      database,
      catalog.token,
      summary.mode === 'pack'
        ? summary.roots.flatMap((root) =>
            root.catalog?.pack
              ? [{ kind: 'pack', id: root.catalog.pack.id }]
              : [],
          )
        : [],
    )
    const packStates = new Map<
      string,
      { snapshot: TargetSnapshot; rows: ClassificationRecord['rows'] }
    >()
    const recordFor = (
      id: string,
      snapshot: TargetSnapshot,
      dependency?: TargetSnapshot,
    ): ClassificationRecord => {
      const rows = prepareClassificationReviewRows({
        contractVersion: 1,
        targets: dependency ? [dependency, snapshot] : [snapshot],
      }).filter(
        (row) =>
          row.subject.kind === snapshot.subject.kind &&
          row.subject.identity.id === snapshot.subject.identity.id,
      )
      for (const row of rows) {
        const decision = invalidated.has(id)
          ? undefined
          : staged.get(row.proposalKey)
        if (row.reviewable && decision?.fingerprint === row.fingerprint) {
          row.decision = decision.decision
        }
      }
      return {
        id: hash([snapshot.subject.kind, snapshot.subject.identity]),
        stateToken: snapshot.stateToken,
        subject: snapshot.subject,
        rows,
        ambiguities: snapshot.ambiguities,
      }
    }
    if (summary.mode === 'pack') {
      for (const root of summary.roots) {
        const owner = packSubject(summary, root)
        const input = {
          kind: 'pack' as const,
          components: [
            {
              occurrence: root.location,
              text: path.basename(root.location),
              kind: 'root' as const,
              distance: 0,
              availability: 'observed' as const,
            },
          ],
        }
        const snapshot = makeSnapshot(
          owner,
          input,
          catalog.recognize(input),
          catalog.vocabulary,
          root.catalog?.pack
            ? savedPacks.get(
                contextKey({ kind: 'pack', id: root.catalog.pack.id }),
              )
            : undefined,
        )
        const organization = summary.packOrganizations?.[root.id]
        if (!root.catalog?.pack && organization) {
          if (organization.needsReview) {
            throw new IpcError(
              'STALE_REVIEW',
              'Review the new Pack organization choices.',
            )
          }
          const manual = [...organization.instruments, ...organization.genres]
          snapshot.draftAssignments = manual.map((entry) => {
            if (
              !catalog.vocabulary.some(
                (current) =>
                  current.state === 'active' &&
                  current.dimension === entry.kind &&
                  current.key === entry.key &&
                  current.entityId === entry.id &&
                  current.name === entry.name,
              )
            ) {
              throw new IpcError(
                'STALE_REVIEW',
                'A manual Pack classification changed. Review its assignment.',
              )
            }
            return {
              dimension: entry.kind,
              key: entry.key,
              name: entry.name,
              entityId: entry.id,
            }
          })
          if (manual.length) {
            snapshot.stateToken = hash([input, snapshot.draftAssignments])
          }
        }
        const record = recordFor(root.id, snapshot)
        await generation.append(record)
        packStates.set(classificationPackEvidenceId(owner), {
          snapshot,
          rows: record.rows,
        })
      }
    }
    for await (const batch of candidates.batches()) {
      const selected = batch
        .map((candidate) => reviewCandidate(summary, candidate, choices))
        .filter(
          (candidate) => candidate.selected && !candidate.needsSelectionReview,
        )
      const owners = selected.map((candidate) => ({
        candidate,
        origin: origin(summary, candidate),
      }))
      const saved = await savedTargets(
        database,
        catalog.token,
        owners.flatMap(({ candidate, origin }) => [
          ...(candidate.catalog.sample
            ? [{ kind: 'sample' as const, id: candidate.catalog.sample.id }]
            : []),
          ...(origin?.identity.kind === 'catalog'
            ? [{ kind: 'pack' as const, id: origin.identity.id }]
            : []),
        ]),
      )
      for (const { candidate, origin: resultingOrigin } of owners) {
        const owner = candidate.catalog.sample
          ? subject('sample', candidate.catalog.sample.id)
          : subject('sample', candidate.id, summary.id)
        const packId = resultingOrigin
          ? classificationPackEvidenceId(resultingOrigin)
          : null
        const packState = packId ? packStates.get(packId) : undefined
        const savedPack =
          resultingOrigin?.identity.kind === 'catalog'
            ? saved.get(
                contextKey({ kind: 'pack', id: resultingOrigin.identity.id }),
              )
            : undefined
        if (
          packState &&
          savedPack &&
          JSON.stringify(savedPack.assignments) !==
            JSON.stringify(packState.snapshot.assignments)
        ) {
          throw new IpcError(
            'STALE_REVIEW',
            'Pack Genres changed while preparing classifications.',
          )
        }
        const genres = new Set(
          (savedPack?.assignments ?? [])
            .filter((entry) => entry.dimension === 'genre')
            .map((entry) => entry.key),
        )
        for (const assignment of packState?.snapshot.draftAssignments ?? []) {
          if (assignment.dimension === 'genre') {
            genres.add(assignment.key)
          }
        }
        for (const row of packState?.rows ?? []) {
          if (row.target.dimension === 'genre' && row.decision === 'accept') {
            genres.add(row.target.key)
          }
        }
        const input = {
          kind: 'sample' as const,
          components: components(summary, candidate),
          packGenres: packId
            ? [...genres].sort().map((genreKey) => ({ packId, genreKey }))
            : [],
        }
        const snapshot = makeSnapshot(
          owner,
          [
            candidate.file,
            candidate.catalog,
            input.components,
            resultingOrigin,
          ],
          catalog.recognize(input),
          catalog.vocabulary,
          candidate.catalog.sample
            ? saved.get(
                contextKey({ kind: 'sample', id: candidate.catalog.sample.id }),
              )
            : undefined,
        )
        if (packState) {
          for (const proposal of snapshot.proposals) {
            if (
              proposal.target.dimension === 'genre' &&
              genres.has(proposal.target.key) &&
              !packState.snapshot.assignments.some(
                (entry) =>
                  entry.dimension === 'genre' &&
                  entry.key === proposal.target.key,
              )
            ) {
              proposal.dependencies.push({
                subject: packState.snapshot.subject,
                genreKey: proposal.target.key,
              })
            }
          }
        }
        await generation.append(
          recordFor(candidate.id, snapshot, packState?.snapshot),
        )
      }
    }
    // Detect vocabulary edits during a multi-request generation before publication.
    await readContext(database, { token: catalog.token })
    generation.finish()
    return generation
  } catch (error) {
    try {
      await generation.dispose()
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Import classification build and cleanup failed.',
      )
    }
    throw error
  }
}
