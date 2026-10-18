import { requireClassificationName } from './classification.ts'

export type RecognitionDimension = 'category' | 'genre' | 'sample-type'

export type VocabularyEntry = {
  key: string
  dimension: RecognitionDimension
  name: string
  entityId: string | null
  state: 'active' | 'offered' | 'deleted'
}

export type RecognitionAlias = {
  id: string
  targetKey: string
  term: string
  suppliedKey: string | null
}

export type AliasWriteRequest = {
  id?: string
  targetKey: string
  term: string
}

export interface Genre {
  id: string
  name: string
}

export function recognitionTokens(text: string): string[] {
  return (
    text
      .normalize('NFC')
      .toLowerCase()
      .replace(/[\s._-]+/gu, ' ')
      .match(/[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu) ?? []
  )
}

export function recognitionKey(text: string): string {
  return recognitionTokens(requireClassificationName(text)).join(' ')
}
