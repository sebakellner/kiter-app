import { createHash } from 'node:crypto'
import type { AppDatabase } from '../../runtime/connection.ts'
import { authors, instruments } from '../../schema/classification.ts'
import { genres, recognitionVocabulary } from '../../schema/recognition.ts'
import { DbError } from '../../errors.ts'
import {
  packOrganizationCatalogRequestSchema,
  type PackOrganizationEntry,
  type PackOrganizationCatalogRequest,
  type PackOrganizationCatalogPage,
} from '../../../../shared/features/imports/pack-organization-schemas.ts'

export function readImportPackOrganizationCatalog(
  db: AppDatabase,
  value: PackOrganizationCatalogRequest,
): PackOrganizationCatalogPage {
  const parsed = packOrganizationCatalogRequestSchema.safeParse(value)
  if (!parsed.success) {
    throw new DbError(
      'INVALID_INPUT',
      'Invalid Pack organization catalog request.',
    )
  }
  return db.transaction(() => {
    const people = db
      .select({ id: authors.id, name: authors.name })
      .from(authors)
      .orderBy(authors.id)
      .limit(10001)
      .all()
    const sounds = db
      .select({ id: instruments.id, name: instruments.name })
      .from(instruments)
      .orderBy(instruments.id)
      .limit(10001)
      .all()
    const styles = db
      .select({ id: genres.id, name: genres.name })
      .from(genres)
      .orderBy(genres.id)
      .limit(10001)
      .all()
    const vocabulary = db
      .select()
      .from(recognitionVocabulary)
      .orderBy(recognitionVocabulary.key)
      .limit(10001)
      .all()
    if (
      [people, sounds, styles, vocabulary].some((items) => items.length > 10000)
    ) {
      throw new DbError(
        'INVALID_INPUT',
        'Pack organization catalog exceeds its safety limit.',
      )
    }
    const mappings = new Map(
      vocabulary.flatMap((entry) => {
        const id = entry.instrumentId ?? entry.genreId
        return entry.state === 'active' && id
          ? [[`${entry.dimension}:${id}`, entry] as const]
          : []
      }),
    )
    const items: PackOrganizationEntry[] = people.map((person) => ({
      kind: 'author',
      ...person,
    }))
    for (const [kind, entities] of [
      ['instrument', sounds],
      ['genre', styles],
    ] as const) {
      for (const entity of entities) {
        const mapping = mappings.get(`${kind}:${entity.id}`)
        if (!mapping || mapping.name !== entity.name) {
          throw new DbError(
            'DB_INTEGRITY',
            'Pack classification vocabulary mapping is inconsistent.',
          )
        }
        items.push({ kind, ...entity, key: mapping.key })
      }
    }
    const content = JSON.stringify(items)
    if (Buffer.byteLength(content) > 8 * 1024 * 1024) {
      throw new DbError(
        'INVALID_INPUT',
        'Pack organization catalog exceeds its safety limit.',
      )
    }
    const token = createHash('sha256').update(content).digest('hex')
    if (parsed.data.token && parsed.data.token !== token) {
      throw new DbError(
        'STALE_REVIEW',
        'Pack organization catalog changed. Review current choices.',
      )
    }
    return {
      token,
      total: items.length,
      items: items.slice(parsed.data.offset, parsed.data.offset + 100),
    }
  })
}
