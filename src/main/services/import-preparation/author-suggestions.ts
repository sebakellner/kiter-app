import { recognitionTokens } from '../../../shared/domain/recognition.ts'
import {
  DomainValidationError,
  requirePresentationName,
} from '../../../shared/domain/validation.ts'
import type { PackOrganizationEntry } from '../../../shared/features/imports/pack-organization-schemas.ts'

type Author = Extract<PackOrganizationEntry, { kind: 'author' }>
export type PackAuthorSuggestion =
  | {
      kind: 'existing'
      author: Author
      evidence: { kind: 'root-name'; text: string; matchedName: string }
    }
  | {
      kind: 'create'
      name: string
      evidence: { kind: 'root-prefix'; text: string; prefix: string }
    }

// Credit hints are scoped to the selected Pack root, never Samples or ancestors.
// Names remain independent identities: homonyms produce separate offers.
export function suggestPackAuthors(
  folderName: string,
  authors: Author[],
): PackAuthorSuggestion[] {
  const words = recognitionTokens(folderName, true)
  const result: PackAuthorSuggestion[] = []
  for (const author of authors) {
    const name = recognitionTokens(author.name, true)
    if (
      name.length &&
      words.some((_word, start) =>
        name.every((word, index) => words[start + index] === word),
      )
    ) {
      result.push({
        kind: 'existing',
        author: { ...author },
        evidence: {
          kind: 'root-name',
          text: folderName,
          matchedName: author.name,
        },
      })
    }
  }
  const separator = /\s+[-–—]\s+/u.exec(folderName)
  if (
    separator?.index !== undefined &&
    folderName.slice(separator.index + separator[0].length).trim()
  ) {
    const prefix = folderName.slice(0, separator.index)
    try {
      const name = requirePresentationName(prefix)
      const normalized = JSON.stringify(recognitionTokens(name, true))
      if (
        !authors.some(
          (author) =>
            JSON.stringify(recognitionTokens(author.name, true)) === normalized,
        )
      ) {
        result.push({
          kind: 'create',
          name,
          evidence: { kind: 'root-prefix', text: folderName, prefix },
        })
      }
    } catch (error) {
      if (!(error instanceof DomainValidationError)) {
        throw error
      }
      // An invalid folder prefix is not an invented or truncated credit name.
    }
  }
  return result
}
