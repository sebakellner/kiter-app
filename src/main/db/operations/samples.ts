import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../connection.ts'
import type { FavoriteState } from '../../../shared/ipc/library.ts'
import { DomainValidationError, requireEntityId } from '../../../shared/domain/validation.ts'
import { DbError } from '../errors.ts'
import { samples } from '../schema/samples.ts'

export function setFavorite(db: AppDatabase, id: unknown, favorite: unknown): FavoriteState {
  const sampleId = requireEntityId(id)
  if (typeof favorite !== 'boolean') throw new DomainValidationError('Invalid favorite state')
  const result = db.update(samples).set({ favorite }).where(eq(samples.id, sampleId)).run()
  if (result.changes !== 1) {
    throw new DbError('NOT_FOUND', 'The sample is not registered in the library.')
  }
  return { id: sampleId, favorite }
}
