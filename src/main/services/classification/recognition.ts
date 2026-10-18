import type {
  PathEvidence,
  RecognitionComponent,
  RecognitionEntry,
  RecognitionInput,
  RecognitionResult,
  RecognitionTarget,
} from './recognition.types.ts'
import { recognitionTokens as tokens } from '../../../shared/domain/recognition.ts'

type Term = {
  target: RecognitionTarget
  tokens: string[]
  text: string
  rule: 'name' | 'alias'
}

type Match = { target: RecognitionTarget; evidence: PathEvidence }

function identity(target: RecognitionTarget): string {
  return JSON.stringify([target.dimension, target.key])
}

function overlaps(a: Match, b: Match): boolean {
  return (
    a.evidence.span[0] < b.evidence.span[1] &&
    b.evidence.span[0] < a.evidence.span[1]
  )
}

function contains(a: Match, b: Match): boolean {
  return (
    a.evidence.span[0] <= b.evidence.span[0] &&
    a.evidence.span[1] >= b.evidence.span[1]
  )
}

function sameSpan(a: Match, b: Match): boolean {
  return contains(a, b) && contains(b, a)
}

function matchComponent(
  component: RecognitionComponent,
  terms: Term[],
): Match[] {
  const text =
    component.kind === 'filename'
      ? component.text.replace(/\.[^.]+$/u, '')
      : component.text
  const words = tokens(text, true)
  const matches: Match[] = []
  for (const term of terms) {
    for (let start = 0; start <= words.length - term.tokens.length; start++) {
      if (term.tokens.every((word, index) => words[start + index] === word)) {
        matches.push({
          target: term.target,
          evidence: {
            kind: 'path',
            occurrence: component.occurrence,
            component: component.kind,
            availability: component.availability,
            text: component.text,
            clue: term.tokens.join(' '),
            term: term.text,
            rule: term.rule,
            ruleVersion: 'path-v2',
            span: [start, start + term.tokens.length],
          },
        })
      }
    }
  }
  return matches
}

/** Compile once per effective vocabulary; recognize one bounded target at a time.
 * Callers resolve supplied/library identities and edits before passing entries.
 * This module performs no reads, writes, rejection filtering, or acceptance.
 */
export function createClassificationRecognizer(
  entries: readonly RecognitionEntry[],
): (input: RecognitionInput) => RecognitionResult {
  const terms: Term[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    for (const [index, text] of [entry.name, ...entry.aliases].entries()) {
      for (const words of [tokens(text), tokens(text, true)]) {
        const key = JSON.stringify([identity(entry.target), words])
        if (words.length > 0 && !seen.has(key)) {
          seen.add(key)
          terms.push({
            target: { ...entry.target },
            tokens: words,
            text,
            rule: index === 0 ? 'name' : 'alias',
          })
        }
      }
    }
  }

  return (input) => {
    const result: RecognitionResult = { proposals: [], ambiguities: [] }
    const proposals = new Map<string, RecognitionResult['proposals'][number]>()
    function propose(match: Match): void {
      const key = identity(match.target)
      const existing = proposals.get(key)
      if (existing) {
        existing.evidence.push(match.evidence)
      } else {
        proposals.set(key, {
          target: { ...match.target },
          evidence: [match.evidence],
        })
      }
    }

    const components = input.components
      .filter(
        (component) => input.kind === 'sample' || component.kind === 'root',
      )
      .filter(
        (component, index, all) =>
          all.findIndex(
            (other) => other.occurrence === component.occurrence,
          ) === index,
      )
    const matched = components.map((component) => ({
      component,
      matches: matchComponent(component, terms),
    }))
    for (const { matches } of matched) {
      for (const dimension of ['category', 'genre'] as const) {
        const candidates = matches.filter(
          (match) => match.target.dimension === dimension,
        )
        // Specific phrases suppress fully contained matches before conflict checks.
        const specific = candidates.filter(
          (match) =>
            !candidates.some(
              (other) => contains(other, match) && !sameSpan(other, match),
            ),
        )
        const ambiguous = new Set<Match>()
        for (let index = 0; index < specific.length; index++) {
          const a = specific[index]
          for (const b of specific.slice(index + 1)) {
            if (
              overlaps(a, b) &&
              (identity(a.target) !== identity(b.target) || !sameSpan(a, b))
            ) {
              ambiguous.add(a)
              ambiguous.add(b)
              result.ambiguities.push({
                dimension,
                reason: sameSpan(a, b)
                  ? 'conflicting-targets'
                  : 'overlapping-phrases',
                targets: [a.target, b.target].map((target) => ({ ...target })),
                evidence: [a.evidence, b.evidence],
              })
            }
          }
        }
        specific.filter((match) => !ambiguous.has(match)).forEach(propose)
      }
    }

    if (input.kind === 'sample') {
      const types = matched.filter(({ matches }) =>
        matches.some((match) => match.target.dimension === 'sample-type'),
      )
      const priority = ({ component }: (typeof matched)[number]): number =>
        component.kind === 'filename' ? Infinity : -component.distance
      const highest = Math.max(...types.map(priority))
      const clues = types
        .filter((item) => priority(item) === highest)
        .flatMap(({ matches }) =>
          matches.filter((match) => match.target.dimension === 'sample-type'),
        )
      const targets = new Map(
        clues.map((match) => [identity(match.target), match.target]),
      )
      if (targets.size > 1) {
        result.ambiguities.push({
          reason: 'contradictory-type',
          dimension: 'sample-type',
          targets: Array.from(targets.values(), (target) => ({ ...target })),
          evidence: clues.map((match) => match.evidence),
        })
      } else {
        clues.forEach(propose)
      }

      const packEvidence = new Set<string>()
      for (const genre of input.packGenres ?? []) {
        const evidenceKey = JSON.stringify([genre.packId, genre.genreKey])
        if (packEvidence.has(evidenceKey)) {
          continue
        }
        packEvidence.add(evidenceKey)
        const target: RecognitionTarget = {
          dimension: 'genre',
          key: genre.genreKey,
        }
        const key = identity(target)
        const proposal = proposals.get(key) ?? { target, evidence: [] }
        proposal.evidence.push({ kind: 'pack-genre', ...genre })
        proposals.set(key, proposal)
      }
    }
    result.proposals = Array.from(proposals.values())
    return result
  }
}
