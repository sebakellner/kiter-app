import { requireClassificationName } from './classification.ts'

export type RecognitionDimension = 'instrument' | 'genre' | 'sample-type'

export type RecognitionTarget = {
  dimension: RecognitionDimension
  // Stable vocabulary identity, never a display name.
  key: string
}

export type PathEvidence = {
  kind: 'path'
  occurrence: string
  component: 'root' | 'folder' | 'filename'
  availability: 'observed' | 'cataloged'
  text: string
  clue: string
  term: string
  rule: 'name' | 'alias'
  ruleVersion: 'path-v2'
  // Half-open token offsets, not character offsets.
  span: readonly [number, number]
}

export type RecognitionEvidence =
  PathEvidence | { kind: 'pack-genre'; packId: string; genreKey: string }

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

export function recognitionTokens(text: string, splitCase = false): string[] {
  const normalized = text.normalize('NFC')
  return (
    (splitCase
      ? normalized.replace(/(\p{Ll}\p{M}*)(\p{Lu})/gu, '$1 $2')
      : normalized
    )
      .toLowerCase()
      .replace(/[\s._-]+/gu, ' ')
      .match(/[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu) ?? []
  )
}

export function recognitionKey(text: string): string {
  return recognitionTokens(requireClassificationName(text)).join(' ')
}
