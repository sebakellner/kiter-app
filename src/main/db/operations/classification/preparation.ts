import { createHash } from 'node:crypto'
import path from 'node:path'
import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import {
  samples,
  sampleSources,
  sourceRootSamples,
} from '../../schema/samples.ts'
import { sourceRoots } from '../../schema/sources.ts'
import { sampleCategories } from '../../schema/classification.ts'
import {
  sampleGenres,
  packGenres,
  recognitionVocabulary,
  recognitionAliases,
} from '../../schema/recognition.ts'
import { createClassificationRecognizer } from '../../../services/classification/recognition.ts'
import type {
  RecognitionComponent,
  RecognitionEntry,
} from '../../../services/classification/recognition.types.ts'
import { DbError } from '../../errors.ts'
import { requireClassificationPreparationRequest } from '../../../../shared/ipc/classification.ts'
import type {
  ClassificationPreparationItem,
  ClassificationPreparationPage,
  ClassificationPreparationRequest,
} from '../../../../shared/ipc/classification.ts'

const MAX_VOCABULARY = 10000
const MAX_ROOTS = 100

/** Read-only, transactionally consistent preview. The token detects stale pages,
 * not consent to execute. No preparation is retained or resumed after restart.
 */
export function prepareSampleClassification(
  db: AppDatabase,
  request: ClassificationPreparationRequest,
): ClassificationPreparationPage {
  const input = requireClassificationPreparationRequest(request)
  return db.transaction(() => {
    const sample = db
      .select()
      .from(samples)
      .innerJoin(sampleSources, eq(samples.id, sampleSources.sampleId))
      .where(eq(samples.id, input.sampleId))
      .get()
    if (!sample) {
      throw new DbError('NOT_FOUND', 'The Sample no longer exists.')
    }
    const roots = db
      .select({ id: sourceRoots.id, path: sourceRoots.canonicalPath })
      .from(sourceRootSamples)
      .innerJoin(
        sourceRoots,
        eq(sourceRoots.id, sourceRootSamples.sourceRootId),
      )
      .where(
        and(
          eq(sourceRootSamples.sampleId, input.sampleId),
          eq(sourceRoots.registered, true),
        ),
      )
      .orderBy(sourceRoots.id)
      .limit(MAX_ROOTS + 1)
      .all()
    const vocabulary = db
      .select()
      .from(recognitionVocabulary)
      .orderBy(recognitionVocabulary.key)
      .limit(MAX_VOCABULARY + 1)
      .all()
    const aliases = db
      .select()
      .from(recognitionAliases)
      .orderBy(recognitionAliases.id)
      .limit(MAX_VOCABULARY + 1)
      .all()
    if (
      roots.length > MAX_ROOTS ||
      vocabulary.length > MAX_VOCABULARY ||
      aliases.length > MAX_VOCABULARY
    ) {
      throw new DbError(
        'INVALID_INPUT',
        'This classification scope exceeds the preparation limit.',
      )
    }
    const source = sample.sample_sources
    const components = new Map<string, RecognitionComponent>()
    for (const root of roots) {
      const relative = path.relative(root.path, source.canonicalPath)
      if (
        !relative ||
        path.isAbsolute(relative) ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`)
      ) {
        continue
      }
      const parts = relative.split(path.sep)
      for (let index = 0; index <= parts.length; index++) {
        const location = path.join(root.path, ...parts.slice(0, index))
        const kind =
          index === parts.length ? 'filename' : index === 0 ? 'root' : 'folder'
        const existing = components.get(location)
        // Descendant and root views of the same physical folder are one clue.
        if (!existing || existing.kind === 'root') {
          components.set(location, {
            occurrence: location,
            kind,
            text: path.basename(location),
            distance: parts.length - index,
            availability: 'cataloged',
          })
        }
      }
    }
    const assignedCategories = db
      .select()
      .from(sampleCategories)
      .where(eq(sampleCategories.sampleId, input.sampleId))
      .orderBy(sampleCategories.categoryId)
      .all()
    const assignedGenres = db
      .select()
      .from(sampleGenres)
      .where(eq(sampleGenres.sampleId, input.sampleId))
      .orderBy(sampleGenres.genreId)
      .all()
    const originGenres = sample.samples.packId
      ? db
          .select()
          .from(packGenres)
          .where(eq(packGenres.packId, sample.samples.packId))
          .orderBy(packGenres.genreId)
          .all()
      : []
    const entries: RecognitionEntry[] = vocabulary
      .filter((entry) => entry.state !== 'deleted')
      .map((entry) => ({
        target: { dimension: entry.dimension, key: entry.key },
        name: entry.name,
        aliases: aliases
          .filter((alias) => !alias.deleted && alias.targetKey === entry.key)
          .map((alias) => alias.term),
      }))
    const result = createClassificationRecognizer(entries)({
      kind: 'sample',
      components: [...components.values()],
      packGenres: originGenres.flatMap((genre) => {
        const entry = vocabulary.find(
          (entry) =>
            entry.genreId === genre.genreId && entry.state !== 'deleted',
        )
        return entry && sample.samples.packId
          ? [{ packId: sample.samples.packId, genreKey: entry.key }]
          : []
      }),
    })
    const token = createHash('sha256')
      .update(
        JSON.stringify({
          sample,
          roots,
          vocabulary,
          aliases,
          assignedCategories,
          assignedGenres,
          originGenres,
          result,
        }),
      )
      .digest('hex')
    if (input.token && input.token !== token) {
      throw new DbError(
        'STALE_REVIEW',
        'Classification evidence changed. Prepare the suggestions again.',
      )
    }
    const items: ClassificationPreparationItem[] = []
    function targetFields(
      key: string,
    ): Pick<
      ClassificationPreparationItem,
      'key' | 'name' | 'entityId' | 'alreadyAssigned' | 'needsCreation'
    > {
      const entry = vocabulary.find((entry) => entry.key === key)!
      const entityId = entry.categoryId ?? entry.genreId
      const alreadyAssigned =
        entry.dimension === 'category'
          ? assignedCategories.some((row) => row.categoryId === entityId)
          : entry.dimension === 'genre' &&
            assignedGenres.some((row) => row.genreId === entityId)
      return {
        key,
        name: entry.name,
        entityId,
        alreadyAssigned,
        needsCreation: entry.dimension !== 'sample-type' && entityId === null,
      }
    }
    for (const proposal of result.proposals) {
      for (const evidence of proposal.evidence) {
        items.push({
          kind: 'proposal',
          dimension: proposal.target.dimension,
          ...targetFields(proposal.target.key),
          evidence:
            evidence.kind === 'path'
              ? `Cataloged location: ${evidence.occurrence}`
              : `Origin Pack: ${evidence.packId}`,
          clue:
            evidence.kind === 'path'
              ? evidence.clue
              : targetFields(evidence.genreKey).name,
          rule: evidence.kind === 'path' ? evidence.rule : 'pack-genre',
          reason: null,
        })
      }
    }
    for (const ambiguity of result.ambiguities) {
      for (const target of ambiguity.targets) {
        for (const evidence of ambiguity.evidence) {
          items.push({
            kind: 'ambiguity',
            dimension: ambiguity.dimension,
            ...targetFields(target.key),
            evidence: `Cataloged location: ${evidence.occurrence}`,
            clue: evidence.clue,
            rule: evidence.rule,
            reason: ambiguity.reason,
          })
        }
      }
    }
    return {
      sampleId: input.sampleId,
      sampleName:
        sample.samples.displayName ?? path.basename(source.canonicalPath),
      token,
      proposalCount: result.proposals.length,
      ambiguityCount: result.ambiguities.length,
      total: items.length,
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
      items: items.slice(
        input.offset ?? 0,
        (input.offset ?? 0) + (input.limit ?? 50),
      ),
    }
  })
}
