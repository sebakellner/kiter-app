import { randomUUID } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import path from 'node:path'
import type { DbClient } from '../../db'
import { IMPORT_PREPARATION_MAX_ROOTS } from '../../../shared/features/imports/schemas.ts'
import {
  DomainValidationError,
  requirePresentationName,
} from '../../../shared/domain/validation.ts'
import { requireDescription } from '../../../shared/domain/presentation.ts'
import { IpcError } from '../../../shared/ipc/result.ts'
import { PreparationSpool, PreparationLimitError } from './spool.ts'
import { addPreparationIssue, discoverPreparationRoots } from './builder.ts'
import {
  candidatePageRequestSchema,
  reviewPageRequestSchema,
  preparationRequestSchema,
  selectionRequestSchema,
  subtreeRequestSchema,
  modeRequestSchema,
  destinationsRequestSchema,
  originDecisionsRequestSchema,
  rootRequestSchema,
  packDetailsRequestSchema,
  classificationReferenceSchema,
  classificationPageSchema,
  classificationStageSchema,
} from './schemas.ts'
import { reviewCandidate, type PreparationDraft } from './selection.ts'
import { changedReviewRoots } from './revalidation.ts'
import { sealReview } from './review.ts'
import { readPreparationPage } from './paging.ts'
import {
  logPreparationFailure,
  preparationFailure,
  type PreparationWorkStage,
} from './errors.ts'
import { suggestPackDetails } from './pack-details.ts'
import { requireSubtreeScope } from './subtree.ts'
import {
  buildImportClassifications,
  emptyClassificationState,
  type ImportClassificationState,
} from './classification.ts'
import type {
  ClassificationSpool,
  ImportClassificationSummary,
  StagedClassification,
} from './classification-spool.ts'
import type { ClassificationDecisionRequest } from '../../../shared/features/classification/batch-schemas.ts'
import type {
  ImportPreparation,
  PreparationRoot,
  PreparationCandidate,
  PreparationRequest,
  PreparationReview,
  PreparationPageRequest,
  PreparationCandidatePage,
  CandidateChoice,
} from './types.ts'

interface Session {
  summary: ImportPreparation
  spool: PreparationSpool
  invalidated: boolean
  disposing: Promise<void> | null
  draft: PreparationDraft
  classification: ImportClassificationState
}

// Instantiate once per owner in main. No renderer paths or audio capabilities.
export class ImportPreparationService {
  private session: Session | null = null
  private pending: Promise<ImportPreparation> | null = null
  private closed = false
  private cleanupPending: PreparationSpool | null = null
  private work: Promise<unknown> | null = null
  private readonly database: Pick<DbClient, 'readImportCatalog'> &
    Partial<Pick<DbClient, 'readImportClassificationContext'>>
  private readonly temporaryParent: string

  constructor(
    database: Pick<DbClient, 'readImportCatalog'> &
      Partial<Pick<DbClient, 'readImportClassificationContext'>>,
    temporaryParent: string,
  ) {
    this.database = database
    this.temporaryParent = temporaryParent
  }

  async prepare(directories: string[]): Promise<ImportPreparation> {
    if (this.closed) {
      throw new IpcError('CLOSING', 'Import preparation is closed.')
    }
    if (this.session || this.pending || this.cleanupPending) {
      throw new DomainValidationError(
        'Discard the current import preparation first.',
      )
    }
    if (
      !Array.isArray(directories) ||
      directories.length === 0 ||
      directories.length > IMPORT_PREPARATION_MAX_ROOTS ||
      directories.some(
        (root) =>
          typeof root !== 'string' ||
          !path.isAbsolute(root) ||
          root.includes('\0'),
      )
    ) {
      throw new DomainValidationError(
        'Select between 1 and 32 absolute source folders.',
      )
    }
    this.pending = this.build([...directories]).then((session) => {
      this.session = session
      return structuredClone(session.summary)
    })
    try {
      return await this.pending
    } catch (error) {
      if (error instanceof IpcError || error instanceof DomainValidationError) {
        throw error
      }
      logPreparationFailure('prepare', error)
      throw preparationFailure(
        'Unable to prepare import. Check folder access and temporary storage.',
        error,
      )
    } finally {
      this.pending = null
    }
  }

  get(preparationId: string): ImportPreparation {
    return structuredClone(this.requireSession(preparationId).summary)
  }

  async prepareClassifications(
    input: PreparationRequest,
  ): Promise<ImportClassificationSummary> {
    const request = this.parse(preparationRequestSchema.strict(), input)
    return this.runWork(request, 'prepare-classifications', async (session) => {
      if (
        !session.summary.mode ||
        session.summary.roots.length === 0 ||
        session.summary.roots.some((root) => root.state === 'blocked')
      ) {
        throw new DomainValidationError(
          'Choose an import mode and complete discovery before classification review.',
        )
      }
      await sealReview(session.summary, session.spool, session.draft.choices)
      const generation = await this.buildClassifications(
        session,
        session.classification.choices,
      )
      return this.publishClassifications(session, generation, true)
    })
  }

  getClassificationSummary(
    input: PreparationRequest,
  ): ImportClassificationSummary {
    const request = this.parse(preparationRequestSchema.strict(), input)
    const session = this.requireSession(request.preparationId, request.revision)
    return this.requireClassifications(session).summary(
      session.summary.id,
      session.summary.revision,
    )
  }

  async listClassifications(
    input: PreparationRequest & {
      classificationToken: string
      kind?: 'proposals' | 'ambiguities' | 'decisions'
      offset?: number
      limit?: number
    },
  ): Promise<
    Awaited<ReturnType<ClassificationSpool['page']>> & {
      revision: number
      classificationToken: string
    }
  > {
    const request = this.parse(classificationPageSchema, input)
    const session = this.requireSession(request.preparationId, request.revision)
    const generation = this.checkClassifications(
      session,
      request.classificationToken,
    )
    try {
      const page = await generation.page(
        request.offset,
        request.limit,
        request.kind,
      )
      this.requireSession(request.preparationId, request.revision)
      if (session.classification.generation !== generation) {
        throw new IpcError('STALE_REVIEW', 'Reload import classifications.')
      }
      return {
        ...page,
        revision: request.revision,
        classificationToken: request.classificationToken,
      }
    } catch (error) {
      this.requireSession(request.preparationId, request.revision)
      if (error instanceof IpcError || error instanceof DomainValidationError) {
        throw error
      }
      logPreparationFailure('read-page', error)
      throw preparationFailure(
        'Unable to read import classifications. Discard and prepare again.',
        error,
      )
    }
  }

  async stageClassifications(
    input: PreparationRequest & {
      classificationToken: string
      choices: ClassificationDecisionRequest['choices']
    },
  ): Promise<ImportClassificationSummary> {
    const request = this.parse(classificationStageSchema, input)
    return this.runWork(request, 'stage-classifications', async (session) => {
      const generation = this.checkClassifications(
        session,
        request.classificationToken,
      )
      const choices = new Map(session.classification.choices)
      const seen = new Set<string>()
      for (const choice of request.choices) {
        const row = await generation.proposal(choice.proposalKey)
        if (!row?.reviewable || seen.has(choice.proposalKey)) {
          throw new DomainValidationError(
            'Choose distinct reviewable import classification proposals.',
          )
        }
        seen.add(choice.proposalKey)
        if (choice.decision === 'unreviewed') {
          choices.delete(choice.proposalKey)
        } else {
          choices.set(choice.proposalKey, {
            fingerprint: row.fingerprint,
            decision: choice.decision,
          })
        }
      }
      return this.publishClassifications(
        session,
        await this.buildClassifications(session, choices),
        true,
        choices,
      )
    })
  }

  async acceptAllClassifications(
    input: PreparationRequest & { classificationToken: string },
  ): Promise<ImportClassificationSummary> {
    const request = this.parse(classificationReferenceSchema, input)
    return this.runWork(
      request,
      'accept-all-classifications',
      async (session) => {
        const generation = this.checkClassifications(
          session,
          request.classificationToken,
        )
        const choices = new Map(session.classification.choices)
        for await (const batch of generation.batches()) {
          for (const record of batch) {
            for (const row of record.rows) {
              if (row.reviewable) {
                choices.set(row.proposalKey, {
                  fingerprint: row.fingerprint,
                  decision: 'accept',
                })
              }
            }
          }
        }
        return this.publishClassifications(
          session,
          await this.buildClassifications(session, choices),
          true,
          choices,
        )
      },
    )
  }

  private requireClassifications(session: Session): ClassificationSpool {
    if (
      !session.classification.generation ||
      session.classification.revision !== session.summary.revision
    ) {
      throw new IpcError(
        'STALE_REVIEW',
        'Prepare import classifications for the current revision.',
      )
    }
    return session.classification.generation
  }

  private checkClassifications(
    session: Session,
    token: string,
  ): ClassificationSpool {
    const generation = this.requireClassifications(session)
    if (
      generation.summary(session.summary.id, session.summary.revision)
        .classificationToken !== token
    ) {
      throw new IpcError('STALE_REVIEW', 'Reload import classifications.')
    }
    return generation
  }

  private async buildClassifications(
    session: Session,
    choices: ReadonlyMap<string, StagedClassification>,
  ): Promise<ClassificationSpool> {
    const read = this.database.readImportClassificationContext
    if (!read) {
      throw new IpcError(
        'PROTOCOL_ERROR',
        'Classification catalog access is unavailable.',
      )
    }
    try {
      return await buildImportClassifications(
        { readImportClassificationContext: read.bind(this.database) },
        session.summary,
        session.spool,
        session.draft.choices,
        choices,
        session.classification.invalidated,
      )
    } catch (error) {
      if (error instanceof AggregateError) {
        session.classification.cleanupFailed = true
      }
      if (error instanceof PreparationLimitError) {
        throw new DomainValidationError(
          'Import classification exceeds its safety limits.',
        )
      }
      throw error
    }
  }

  private async publishClassifications(
    session: Session,
    generation: ClassificationSpool,
    advance: boolean,
    expected: ReadonlyMap<string, StagedClassification> = session.classification
      .choices,
  ): Promise<ImportClassificationSummary> {
    this.requireSession(session.summary.id, session.summary.revision)
    const previous = session.classification.generation
    let invalidated = 0
    for (const [key, choice] of expected) {
      if (generation.choices.get(key)?.fingerprint !== choice.fingerprint) {
        invalidated++
      }
    }
    if (advance) {
      this.advance(session)
    }
    session.classification = {
      active: true,
      revision: session.summary.revision,
      generation,
      choices: generation.choices,
      invalidated: new Set(),
      cleanupFailed: false,
    }
    if (previous) {
      try {
        await previous.dispose()
      } catch (error) {
        session.classification.cleanupFailed = true
        throw error
      }
    }
    return generation.summary(
      session.summary.id,
      session.summary.revision,
      invalidated,
    )
  }

  async listCandidates(
    input: PreparationPageRequest,
  ): Promise<PreparationCandidatePage> {
    return this.readPage(this.parse(candidatePageRequestSchema, input))
  }

  async setMode(
    input: PreparationRequest & { mode: 'standalone' | 'pack' },
  ): Promise<ImportPreparation> {
    const request = this.parse(modeRequestSchema, input)
    return this.edit(request, 'set-mode', async (summary, choices) => {
      if (summary.mode !== request.mode) {
        for (const choice of choices.values()) {
          delete choice.destinationRootId
          delete choice.originResolution
        }
      }
      summary.mode = request.mode
      for (const root of summary.roots) {
        if (!root.catalog?.pack && !summary.packDetails[root.id]) {
          summary.packDetails[root.id] = suggestPackDetails(root.location)
        }
      }
    })
  }

  async setSelection(
    input: PreparationRequest & {
      choices: { candidateId: string; selected: boolean }[]
    },
  ): Promise<ImportPreparation> {
    const request = this.parse(selectionRequestSchema, input)
    return this.edit(
      request,
      'set-selection',
      async (_summary, choices, session) => {
        this.requireDistinct(request.choices)
        for (const entry of request.choices) {
          const candidate = await this.requireCandidate(
            session,
            entry.candidateId,
          )
          if (candidate.catalog.excluded && entry.selected) {
            throw new DomainValidationError(
              'Excluded files cannot be selected for import.',
            )
          }
          const choice = choices.get(candidate.id) ?? {}
          choices.set(candidate.id, {
            ...choice,
            selected: entry.selected,
            needsSelectionReview: false,
          })
        }
      },
    )
  }

  async setSubtreeSelection(
    input: PreparationRequest & {
      rootId: string
      relativePath: string
      selected: boolean
    },
  ): Promise<ImportPreparation> {
    const request = this.parse(subtreeRequestSchema, input)
    return this.edit(
      request,
      'set-subtree-selection',
      async (summary, choices, session) => {
        this.requireRoot(summary, request.rootId)
        const scope = requireSubtreeScope(request.relativePath)
        let found = scope === ''
        for await (const batch of session.spool.batches()) {
          for (const candidate of batch) {
            const matches = candidate.occurrences.some(
              (item) =>
                item.rootId === request.rootId &&
                (scope === '' ||
                  item.relativePath.startsWith(`${scope}${path.sep}`)),
            )
            if (matches) {
              found = true
              const choice = choices.get(candidate.id) ?? {}
              choices.set(candidate.id, {
                ...choice,
                selected: request.selected && !candidate.catalog.excluded,
                needsSelectionReview: false,
              })
            }
          }
        }
        if (!found) {
          throw new DomainValidationError(
            'The folder is not in the discovery snapshot.',
          )
        }
      },
    )
  }

  async setDestinations(
    input: PreparationRequest & {
      choices: { candidateId: string; destinationRootId: string }[]
    },
  ): Promise<ImportPreparation> {
    const request = this.parse(destinationsRequestSchema, input)
    return this.edit(
      request,
      'set-destinations',
      async (summary, choices, session) => {
        if (summary.mode !== 'pack') {
          throw new DomainValidationError(
            'Choose Pack mode before selecting destinations.',
          )
        }
        this.requireDistinct(request.choices)
        for (const entry of request.choices) {
          const candidate = await this.requireCandidate(
            session,
            entry.candidateId,
          )
          if (
            candidate.catalog.excluded ||
            !candidate.occurrences.some(
              (item) => item.rootId === entry.destinationRootId,
            )
          ) {
            throw new DomainValidationError(
              'Select a containing root for this candidate.',
            )
          }
          const choice = choices.get(candidate.id) ?? {}
          if (
            reviewCandidate(summary, candidate, choices).destinationRootId !==
            entry.destinationRootId
          ) {
            delete choice.originResolution
          }
          choices.set(candidate.id, {
            ...choice,
            destinationRootId: entry.destinationRootId,
          })
        }
      },
    )
  }

  async setOriginDecisions(
    input: PreparationRequest & {
      choices: {
        candidateId: string
        destinationRootId: string
        resolution: 'keep' | 'assign'
      }[]
    },
  ): Promise<ImportPreparation> {
    const request = this.parse(originDecisionsRequestSchema, input)
    return this.edit(
      request,
      'set-origin-decisions',
      async (summary, choices, session) => {
        this.requireDistinct(request.choices)
        for (const entry of request.choices) {
          const candidate = reviewCandidate(
            summary,
            await this.requireCandidate(session, entry.candidateId),
            choices,
          )
          if (
            !candidate.selected ||
            !candidate.originConflict ||
            candidate.destinationRootId !== entry.destinationRootId
          ) {
            throw new DomainValidationError(
              'Review an individual selected origin conflict at its chosen destination.',
            )
          }
          choices.set(candidate.id, {
            ...choices.get(candidate.id),
            originResolution: entry.resolution,
          })
        }
      },
    )
  }

  async setPackDetails(
    input: PreparationRequest & {
      rootId: string
      name: string
      description?: string | null
    },
  ): Promise<ImportPreparation> {
    const request = this.parse(packDetailsRequestSchema, input)
    return this.edit(request, 'set-pack-details', async (summary) => {
      const root = this.requireRoot(summary, request.rootId)
      if (summary.mode !== 'pack' || root.catalog?.pack) {
        throw new DomainValidationError(
          'Only new Pack presentation can be edited during import.',
        )
      }
      summary.packDetails[root.id] = {
        name: requirePresentationName(request.name),
        description: requireDescription(request.description),
      }
    })
  }

  async removeRoot(
    input: PreparationRequest & { rootId: string },
  ): Promise<ImportPreparation> {
    const request = this.parse(rootRequestSchema, input)
    return this.runWork(request, 'remove-root', async (session) => {
      this.requireRoot(session.summary, request.rootId)
      const summary = structuredClone(session.summary)
      summary.roots = summary.roots.filter((root) => root.id !== request.rootId)
      delete summary.packDetails[request.rootId]
      const spool = new PreparationSpool(
        await mkdtemp(
          path.join(this.temporaryParent, 'kiter-import-preparation-'),
        ),
        summary.id,
      )
      const choices = new Map<string, CandidateChoice>()
      try {
        for await (const batch of session.spool.batches()) {
          for (const candidate of batch) {
            const affected = candidate.occurrences.some(
              (item) => item.rootId === request.rootId,
            )
            candidate.occurrences = candidate.occurrences.filter(
              (item) => item.rootId !== request.rootId,
            )
            if (candidate.occurrences.length > 0) {
              await spool.write(candidate, null)
              const choice = session.draft.choices.get(candidate.id)
              if (affected) {
                choices.set(candidate.id, {
                  selected: false,
                  needsSelectionReview: true,
                })
              } else if (choice) {
                choices.set(candidate.id, { ...choice })
              }
            }
          }
        }
        summary.candidateCount = spool.count
        return await this.replace(session, {
          ...session,
          summary,
          spool,
          draft: { choices, seal: null },
          classification: {
            ...emptyClassificationState(),
            active: session.classification.active,
            choices: session.classification.choices,
            invalidated: new Set(session.classification.invalidated),
          },
        })
      } catch (error) {
        if (this.session?.spool !== spool) {
          await this.cleanupReplacement(spool, error)
        }
        throw error
      }
    })
  }

  async rescanRoot(
    input: PreparationRequest & { rootId: string },
  ): Promise<ImportPreparation> {
    const request = this.parse(rootRequestSchema, input)
    return this.runWork(request, 'rescan-root', async (session) => {
      this.requireRoot(session.summary, request.rootId)
      // Rediscover overlaps together so a changed first observation cannot poison
      // the refreshed root. Retain decisions only for exact, unaffected inputs.
      const refreshed = await this.build(
        session.summary.roots.map((root) => root.location),
        session,
      )
      try {
        const changedRoots = new Set(
          refreshed.summary.roots
            .filter((root) => {
              const previous = session.summary.roots.find(
                (item) => item.id === root.id,
              )
              return (
                !previous ||
                previous.state === 'blocked' ||
                previous.discoveredCount !== root.discoveredCount ||
                previous.skippedSymlinks !== root.skippedSymlinks ||
                JSON.stringify(previous.catalog) !==
                  JSON.stringify(root.catalog)
              )
            })
            .map((root) => root.id),
        )
        for await (const batch of refreshed.spool.batches()) {
          for (const candidate of batch) {
            const previous = await session.spool.read(candidate.id)
            if (
              !previous ||
              JSON.stringify(previous) !== JSON.stringify(candidate)
            ) {
              for (const occurrence of candidate.occurrences) {
                changedRoots.add(occurrence.rootId)
              }
            }
          }
        }
        // A same-count replacement can leave every retained candidate unchanged.
        // Detect removed locations before retaining any decisions for their roots.
        for await (const batch of session.spool.batches()) {
          for (const candidate of batch) {
            if (!(await refreshed.spool.read(candidate.id))) {
              for (const occurrence of candidate.occurrences) {
                changedRoots.add(occurrence.rootId)
              }
            }
          }
        }
        changedRoots.add(request.rootId)
        for await (const batch of refreshed.spool.batches()) {
          for (const candidate of batch) {
            const affected = candidate.occurrences.some((item) =>
              changedRoots.has(item.rootId),
            )
            const choice = session.draft.choices.get(candidate.id)
            if (affected) {
              refreshed.draft.choices.set(candidate.id, {
                selected: false,
                needsSelectionReview: true,
              })
            } else if (choice) {
              refreshed.draft.choices.set(candidate.id, { ...choice })
            }
          }
        }
        return await this.replace(session, refreshed)
      } catch (error) {
        if (this.session?.spool !== refreshed.spool) {
          await this.cleanupReplacement(refreshed.spool, error)
        }
        throw error
      }
    })
  }

  async review(input: PreparationRequest): Promise<PreparationReview> {
    const request = this.parse(preparationRequestSchema.strict(), input)
    return this.runWork(request, 'review', async (session) => {
      const { summary } = session
      session.draft.seal = null
      if (summary.state === 'reviewed') {
        summary.state = 'editing'
      }
      if (
        !summary.mode ||
        summary.roots.length === 0 ||
        summary.roots.some((root) => root.state === 'blocked')
      ) {
        throw new DomainValidationError(
          'Choose an import mode and complete discovery for every selected root.',
        )
      }
      const changed = await changedReviewRoots(
        this.database,
        summary,
        session.spool,
      )
      this.requireSession(request.preparationId, request.revision)
      if (changed.size > 0) {
        for (const root of summary.roots) {
          if (changed.has(root.id)) {
            addPreparationIssue(root, {
              code: 'REVIEW_CHANGED',
              relativePath: '',
            })
          }
        }
        this.advance(session)
        throw new IpcError(
          'STALE_REVIEW',
          'Import inputs changed. Rescan the affected folders and review their selection again.',
        )
      }
      if (session.classification.active) {
        const previous = session.classification.generation
        const generation = await this.buildClassifications(
          session,
          session.classification.choices,
        )
        const changed = previous
          ? previous.digest !== generation.digest
          : [...session.classification.choices].some(
              ([key, choice]) =>
                generation.choices.get(key)?.fingerprint !== choice.fingerprint,
            )
        await this.publishClassifications(session, generation, changed)
        if (changed) {
          throw new IpcError(
            'STALE_REVIEW',
            'Import classification inputs changed. Review the refreshed suggestions.',
          )
        }
      }
      const seal = await sealReview(
        summary,
        session.spool,
        session.draft.choices,
        session.classification.generation?.digest,
      )
      this.requireSession(request.preparationId, request.revision)
      session.draft.seal = seal
      summary.state = 'reviewed'
      return structuredClone(seal)
    })
  }

  async listReview(
    input: PreparationPageRequest & { reviewToken: string },
  ): Promise<PreparationCandidatePage> {
    const request = this.parse(reviewPageRequestSchema, input)
    const session = this.requireSession(request.preparationId, request.revision)
    const seal = session.draft.seal
    if (!seal || seal.reviewToken !== request.reviewToken) {
      throw new IpcError(
        'STALE_REVIEW',
        'Seal the current import review again.',
      )
    }
    return this.readPage(request, seal)
  }

  private async readPage(
    request: PreparationPageRequest,
    seal?: PreparationReview,
  ): Promise<PreparationCandidatePage> {
    const session = this.requireSession(request.preparationId, request.revision)
    try {
      const page = await readPreparationPage(
        session.spool,
        session.summary,
        session.draft.choices,
        request,
        seal,
      )
      // Neither edits, rescan, discard nor resealing may publish an obsolete page.
      this.requireSession(request.preparationId, request.revision)
      if (seal && session.draft.seal !== seal) {
        throw new IpcError('STALE_REVIEW', 'Reload the sealed import review.')
      }
      return page
    } catch (error) {
      this.requireSession(request.preparationId, request.revision)
      if (error instanceof IpcError || error instanceof DomainValidationError) {
        throw error
      }
      logPreparationFailure('read-page', error)
      throw preparationFailure(
        'Unable to read import preparation storage. Discard and prepare the folders again.',
        error,
      )
    }
  }

  private parse<T>(
    schema: {
      safeParse: (
        value: unknown,
      ) => { success: true; data: T } | { success: false }
    },
    input: unknown,
  ): T {
    const parsed = schema.safeParse(input)
    if (!parsed.success) {
      throw new DomainValidationError('Invalid import preparation request.')
    }
    return parsed.data
  }

  private requireRoot(
    summary: ImportPreparation,
    rootId: string,
  ): PreparationRoot {
    const root = summary.roots.find((item) => item.id === rootId)
    if (!root) {
      throw new DomainValidationError(
        'The selected root is not in this preparation.',
      )
    }
    return root
  }

  private requireDistinct(entries: { candidateId: string }[]): void {
    if (
      new Set(entries.map((entry) => entry.candidateId)).size !== entries.length
    ) {
      throw new DomainValidationError(
        'Repeated candidate decisions are not allowed.',
      )
    }
  }

  private async requireCandidate(
    session: Session,
    candidateId: string,
  ): Promise<PreparationCandidate> {
    const candidate = await session.spool.read(candidateId)
    if (!candidate) {
      throw new DomainValidationError(
        'The candidate is not in this preparation.',
      )
    }
    return candidate
  }

  private advance(session: Session): void {
    session.summary.revision++
    session.summary.state = session.summary.roots.some(
      (root) => root.state === 'blocked',
    )
      ? 'blocked'
      : 'editing'
    session.draft.seal = null
  }

  private edit(
    request: PreparationRequest,
    stage: PreparationWorkStage,
    action: (
      summary: ImportPreparation,
      choices: Map<string, CandidateChoice>,
      session: Session,
    ) => Promise<void>,
  ): Promise<ImportPreparation> {
    return this.runWork(request, stage, async (session) => {
      const summary = structuredClone(session.summary)
      const choices = new Map(
        [...session.draft.choices].map(([id, choice]) => [id, { ...choice }]),
      )
      await action(summary, choices, session)
      this.requireSession(request.preparationId, request.revision)
      const invalidated = new Set(session.classification.invalidated)
      if (session.classification.active) {
        if (summary.mode !== session.summary.mode) {
          for await (const batch of session.spool.batches()) {
            for (const candidate of batch) {
              invalidated.add(candidate.id)
            }
          }
          for (const root of summary.roots) {
            invalidated.add(root.id)
          }
        } else {
          for (const id of new Set([
            ...choices.keys(),
            ...session.draft.choices.keys(),
          ])) {
            if (
              JSON.stringify(choices.get(id)) !==
              JSON.stringify(session.draft.choices.get(id))
            ) {
              invalidated.add(id)
            }
          }
        }
        this.requireSession(request.preparationId, request.revision)
      }
      session.summary = summary
      session.draft.choices = choices
      session.classification.invalidated = invalidated
      this.advance(session)
      return structuredClone(summary)
    })
  }

  private runWork<T>(
    request: PreparationRequest,
    stage: PreparationWorkStage,
    action: (session: Session) => Promise<T>,
  ): Promise<T> {
    if (this.closed) {
      return Promise.reject(
        new IpcError('CLOSING', 'Import preparation is closed.'),
      )
    }
    if (
      this.work ||
      this.cleanupPending ||
      this.session?.classification.cleanupFailed
    ) {
      return Promise.reject(
        new DomainValidationError(
          'Wait for the current preparation work or retry cleanup.',
        ),
      )
    }
    const work = (async (): Promise<T> => {
      try {
        return await action(
          this.requireSession(request.preparationId, request.revision),
        )
      } catch (error) {
        if (
          error instanceof IpcError ||
          error instanceof DomainValidationError
        ) {
          throw error
        }
        logPreparationFailure(stage, error)
        throw preparationFailure(
          'Unable to edit or review import preparation. Check access and retry.',
          error,
        )
      }
    })()
    this.work = work
    void work
      .finally(() => {
        if (this.work === work) {
          this.work = null
        }
      })
      .catch(() => undefined)
    return work
  }

  private async replace(
    previous: Session,
    replacement: Session,
  ): Promise<ImportPreparation> {
    this.requireSession(previous.summary.id, previous.summary.revision)
    replacement.summary.revision = previous.summary.revision
    if (replacement.classification.active) {
      for (const [id, choice] of replacement.draft.choices) {
        if (choice.needsSelectionReview) {
          replacement.classification.invalidated.add(id)
        }
      }
    }
    this.advance(replacement)
    this.session = replacement
    this.cleanupPending = previous.spool
    await this.cleanup(previous.spool)
    this.cleanupPending = null
    return structuredClone(replacement.summary)
  }

  private async cleanupReplacement(
    spool: PreparationSpool,
    error: unknown,
  ): Promise<void> {
    this.cleanupPending = spool
    try {
      await this.cleanup(spool)
      this.cleanupPending = null
    } catch (cleanupError) {
      throw preparationFailure(
        'Unable to edit import preparation and clean temporary storage. Retry close.',
        new AggregateError([error, cleanupError]),
      )
    }
  }

  async discard(preparationId: string, revision: number): Promise<void> {
    const session = this.requireSession(preparationId, revision, true)
    session.invalidated = true
    await this.work?.then(
      () => undefined,
      () => undefined,
    )
    if (!session.disposing) {
      session.disposing = this.cleanup(session.spool)
    }
    try {
      await session.disposing
      if (this.cleanupPending) {
        await this.cleanup(this.cleanupPending)
        this.cleanupPending = null
      }
      if (this.session === session) {
        this.session = null
      }
    } finally {
      // Failed cleanup remains retryable, but cannot serve partially removed pages.
      session.disposing = null
    }
  }

  async close(): Promise<void> {
    this.closed = true
    if (this.pending) {
      // Preserve the original prepare error for its caller, while still draining.
      await this.pending.then(
        () => undefined,
        () => undefined,
      )
    }
    await this.work?.then(
      () => undefined,
      () => undefined,
    )
    if (this.session) {
      await this.discard(this.session.summary.id, this.session.summary.revision)
    }
    if (this.cleanupPending) {
      await this.cleanup(this.cleanupPending)
      this.cleanupPending = null
    }
  }

  private requireSession(
    id: string,
    revision?: number,
    forDiscard = false,
  ): Session {
    if (
      !this.session ||
      this.session.summary.id !== id ||
      (this.session.invalidated && !forDiscard)
    ) {
      throw new IpcError(
        'NOT_FOUND',
        'The import preparation is no longer available.',
      )
    }
    if (revision !== undefined && revision !== this.session.summary.revision) {
      throw new IpcError(
        'STALE_REVIEW',
        'Reload the current import preparation.',
      )
    }
    return this.session
  }

  private async build(
    directories: string[],
    previous?: Session,
  ): Promise<Session> {
    const id = previous?.summary.id ?? randomUUID()
    const directory = await mkdtemp(
      path.join(this.temporaryParent, 'kiter-import-preparation-'),
    )
    const spool = new PreparationSpool(directory, id)
    try {
      const roots = await discoverPreparationRoots(
        this.database,
        directories,
        spool,
        previous?.summary,
      )
      const summary: ImportPreparation = {
        id,
        revision: previous ? previous.summary.revision + 1 : 1,
        state: roots.some((root) => root.state === 'blocked')
          ? 'blocked'
          : 'ready',
        candidateCount: spool.count,
        roots,
        mode: previous?.summary.mode ?? null,
        packDetails: previous
          ? structuredClone(previous.summary.packDetails)
          : {},
      }
      if (summary.mode === 'pack') {
        for (const root of roots) {
          if (!root.catalog?.pack && !summary.packDetails[root.id]) {
            summary.packDetails[root.id] = suggestPackDetails(root.location)
          }
        }
      }
      return {
        summary,
        spool,
        invalidated: false,
        disposing: null,
        draft: { choices: new Map(), seal: null },
        classification: {
          ...emptyClassificationState(),
          active: previous?.classification.active ?? false,
          choices: new Map(previous?.classification.choices),
          invalidated: new Set(previous?.classification.invalidated),
        },
      }
    } catch (error) {
      this.cleanupPending = spool
      try {
        await this.cleanup(spool)
      } catch (cleanupError) {
        logPreparationFailure('build', error)
        throw preparationFailure(
          'Unable to prepare import and clean temporary storage. Check access and retry close.',
          new AggregateError(
            [error, cleanupError],
            'Import preparation and cleanup failed.',
          ),
        )
      }
      this.cleanupPending = null
      throw error
    }
  }

  private async cleanup(spool: PreparationSpool): Promise<void> {
    try {
      await spool.dispose()
    } catch (error) {
      logPreparationFailure('cleanup', error)
      throw preparationFailure(
        'Unable to clean import preparation storage. Check access and retry discard or close.',
        error,
      )
    }
  }
}
