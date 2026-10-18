import type { DbClient } from '../../db/index.ts'
import { createClassificationRecognizer } from './recognition.ts'
import type { RecognitionEntry } from './recognition.types.ts'
import type {
  RecognitionInput,
  RecognitionResult,
} from './recognition.types.ts'
import type {
  RecognitionAlias,
  VocabularyEntry,
} from '../../../shared/domain/recognition.ts'

export async function loadCatalogRecognizer(
  db: Pick<DbClient, 'listRecognitionVocabulary' | 'listRecognitionAliases'>,
): Promise<(input: RecognitionInput) => RecognitionResult> {
  const vocabulary: VocabularyEntry[] = []
  const aliases: RecognitionAlias[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await db.listRecognitionVocabulary({ limit: 100, offset })
    vocabulary.push(...page.items)
    if (offset + page.items.length >= page.total) {
      break
    }
  }
  for (let offset = 0; ; offset += 100) {
    const page = await db.listRecognitionAliases({ limit: 100, offset })
    aliases.push(...page.items)
    if (offset + page.items.length >= page.total) {
      break
    }
  }
  const entries: RecognitionEntry[] = vocabulary
    .filter((entry) => entry.state !== 'deleted')
    .map((entry) => ({
      target: { dimension: entry.dimension, key: entry.key },
      name: entry.name,
      aliases: aliases
        .filter((alias) => alias.targetKey === entry.key)
        .map((alias) => alias.term),
    }))
  return createClassificationRecognizer(entries)
}
