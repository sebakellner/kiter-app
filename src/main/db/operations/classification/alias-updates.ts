import { createHash, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import {
  recognitionAliases,
  recognitionVocabulary,
} from '../../schema/recognition.ts'
import { initialRecognitionVocabulary } from '../../../services/classification/vocabulary.ts'
import { recognitionKey } from '../../../../shared/domain/recognition.ts'
import { requirePage } from '../../../../shared/domain/pagination.ts'
import type { Page, PageRequest } from '../../../../shared/domain/pagination.ts'
import { requireAliasUpdateRequest } from '../../../../shared/ipc/aliasUpdates.ts'
import type {
  AliasUpdate,
  AliasUpdateRequest,
} from '../../../../shared/ipc/aliasUpdates.ts'
import { DbError } from '../../errors.ts'

function offers(db: AppDatabase): AliasUpdate[] {
  const result: AliasUpdate[] = []
  for (const entry of initialRecognitionVocabulary) {
    const target = db
      .select()
      .from(recognitionVocabulary)
      .where(eq(recognitionVocabulary.key, entry.target.key))
      .get()
    if (!target || target.state === 'deleted') {
      continue
    }
    const seen = new Set([recognitionKey(entry.name)])
    for (const term of entry.aliases) {
      const termKey = recognitionKey(term)
      if (seen.has(termKey)) {
        continue
      }
      seen.add(termKey)
      const key = `${entry.target.key}:${termKey}`
      // Tombstones and edited/reassigned supplied rows count as incorporated.
      if (
        db
          .select({ id: recognitionAliases.id })
          .from(recognitionAliases)
          .where(eq(recognitionAliases.suppliedKey, key))
          .get()
      ) {
        continue
      }
      const alias = db
        .select()
        .from(recognitionAliases)
        .where(
          and(
            eq(recognitionAliases.dimension, target.dimension),
            eq(recognitionAliases.termKey, termKey),
            eq(recognitionAliases.deleted, false),
          ),
        )
        .get()
      const names = db
        .select()
        .from(recognitionVocabulary)
        .where(eq(recognitionVocabulary.dimension, target.dimension))
        .all()
        .filter(
          (row) =>
            row.state !== 'deleted' &&
            row.key !== target.key &&
            recognitionKey(row.name) === termKey,
        )
      const blockedReason =
        alias || names.length > 0
          ? 'This term is already used by an alias or another classification. Resolve that conflict before incorporating it.'
          : null
      const token = createHash('sha256')
        .update(JSON.stringify({ key, target, alias, names }))
        .digest('hex')
      result.push({
        key,
        targetName: target.name,
        dimension: target.dimension,
        term,
        token,
        blockedReason,
      })
    }
  }
  return result.sort((a, b) => a.key.localeCompare(b.key, 'en'))
}

export function listAliasUpdates(
  db: AppDatabase,
  input: PageRequest = {},
): Page<AliasUpdate> {
  const page = requirePage(input)
  return db.transaction(() => {
    const updates = offers(db)
    return {
      ...page,
      total: updates.length,
      items: updates.slice(page.offset, page.offset + page.limit),
    }
  })
}

export function incorporateAlias(
  db: AppDatabase,
  input: AliasUpdateRequest,
): { key: string } {
  const request = requireAliasUpdateRequest(input)
  return db.transaction(
    () => {
      const offer = offers(db).find((item) => item.key === request.key)
      if (!offer || offer.token !== request.token) {
        throw new DbError(
          'STALE_REVIEW',
          'Alias availability changed. Check vocabulary updates again.',
        )
      }
      if (offer.blockedReason) {
        throw new DbError('NAME_CONFLICT', offer.blockedReason)
      }
      const entry = initialRecognitionVocabulary.find((entry) =>
        entry.aliases.some(
          (term) => `${entry.target.key}:${recognitionKey(term)}` === offer.key,
        ),
      )!
      db.insert(recognitionAliases)
        .values({
          id: randomUUID(),
          targetKey: entry.target.key,
          term: offer.term,
          termKey: recognitionKey(offer.term),
          dimension: entry.target.dimension,
          suppliedKey: offer.key,
        })
        .run()
      return { key: offer.key }
    },
    { behavior: 'immediate' },
  )
}
