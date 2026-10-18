import type { AppDatabase } from '../../runtime/connection.ts'
import type {
  RecognitionRequest,
  RecognitionReply,
} from '../../protocol/recognition.ts'
import * as genres from '../../operations/classification/genres.ts'
import * as vocabulary from '../../operations/classification/vocabulary.ts'

export function executeRecognition(
  db: AppDatabase,
  request: RecognitionRequest,
): RecognitionReply {
  switch (request.action) {
    case 'create-genre':
      return {
        action: request.action,
        result: genres.createGenre(db, request.input),
      }
    case 'rename-genre':
      return {
        action: request.action,
        result: genres.renameGenre(db, request.input),
      }
    case 'get-genre':
      return { action: request.action, result: genres.getGenre(db, request.id) }
    case 'list-genres':
      return {
        action: request.action,
        result: genres.listGenres(db, request.input),
      }
    case 'list-target-genres':
      return {
        action: request.action,
        result: genres.listGenres(db, request.input, request.target),
      }
    case 'set-genre-assignment':
      return {
        action: request.action,
        result: genres.setGenreAssignment(db, request.input),
      }
    case 'review-genre-removal':
      return {
        action: request.action,
        result: genres.reviewGenreRemoval(db, request.id),
      }
    case 'remove-genre':
      return {
        action: request.action,
        result: genres.removeGenre(db, request.input),
      }
    case 'write-recognition-alias':
      return {
        action: request.action,
        result: vocabulary.writeRecognitionAlias(db, request.input),
      }
    case 'remove-recognition-alias':
      return {
        action: request.action,
        result: vocabulary.removeRecognitionAlias(db, request.id),
      }
    case 'list-recognition-aliases':
      return {
        action: request.action,
        result: vocabulary.listRecognitionAliases(db, request.input),
      }
    case 'list-recognition-vocabulary':
      return {
        action: request.action,
        result: vocabulary.listRecognitionVocabulary(db, request.input),
      }
  }
}
