import { requirePage } from '../../../shared/domain/pagination.ts'
import { DomainValidationError } from '../../../shared/domain/validation.ts'
import { IpcError } from '../../../shared/ipc/result.ts'
import { cursorSchema } from './schemas.ts'
import { reviewCandidate } from './selection.ts'
import type { PreparationSpool } from './spool.ts'
import type {
  CandidateChoice,
  ImportPreparation,
  PreparationPageRequest,
  PreparationCandidatePage,
  PreparationReview,
} from './types.ts'

export async function readPreparationPage(
  spool: PreparationSpool,
  summary: ImportPreparation,
  choices: ReadonlyMap<string, CandidateChoice>,
  request: PreparationPageRequest,
  seal?: PreparationReview,
): Promise<PreparationCandidatePage> {
  const { limit } = requirePage({ limit: request.limit })
  const kind = seal ? 'review' : 'candidates'
  let offset = 0
  if (request.cursor !== undefined) {
    let value: unknown
    try {
      value = JSON.parse(
        Buffer.from(request.cursor, 'base64url').toString('utf8'),
      )
    } catch {
      throw new DomainValidationError('Invalid import preparation cursor.')
    }
    const cursor = cursorSchema.safeParse(value)
    if (!cursor.success) {
      throw new DomainValidationError('Invalid import preparation cursor.')
    }
    if (
      cursor.data.preparationId !== request.preparationId ||
      cursor.data.revision !== request.revision ||
      cursor.data.kind !== kind ||
      cursor.data.reviewToken !== seal?.reviewToken
    ) {
      throw new IpcError(
        'STALE_REVIEW',
        'Reload the current import preparation.',
      )
    }
    offset = cursor.data.offset
  }
  const items: PreparationCandidatePage['items'] = []
  while (offset < spool.count && items.length < limit) {
    const batch = await spool.page(offset, limit - items.length)
    offset += batch.length
    for (const item of batch) {
      const candidate = reviewCandidate(summary, item, choices)
      if (!seal || candidate.selected) {
        items.push(candidate)
      }
    }
  }
  return {
    items,
    total: seal?.selectedCount ?? summary.candidateCount,
    revision: request.revision,
    nextCursor:
      offset < spool.count
        ? Buffer.from(
            JSON.stringify({
              preparationId: request.preparationId,
              revision: request.revision,
              kind,
              reviewToken: seal?.reviewToken,
              offset,
            }),
          ).toString('base64url')
        : null,
  }
}
