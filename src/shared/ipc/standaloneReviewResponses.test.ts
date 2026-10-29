import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isStandaloneReviewAmbiguityPage,
  isStandaloneReviewDiscardResult,
  isStandaloneReviewExecutionResult,
  isStandaloneReviewPreparation,
  isStandaloneReviewProposalPage,
  isStandaloneReviewSummary,
} from './standaloneReviewResponses.ts'

const SAMPLE_ID = '00000000-0000-4000-8000-000000000001'
const TOKEN = 'a'.repeat(64)
const REFERENCE = { reviewId: 'review-1', revision: 1, token: TOKEN }

const SUMMARY = {
  ...REFERENCE,
  contractVersion: 1,
  targets: 1,
  proposals: 3,
  reviewable: 2,
  remembered: 1,
  ambiguities: 0,
  requiredCreations: 2,
  typeReplacements: 0,
  accepted: 1,
  rejected: 0,
}

// A preparation scope uses the renderer-facing subject; review rows carry the
// contract's internal catalog identity for the same Sample.
const SCOPE = { kind: 'sample', id: SAMPLE_ID }
const SUBJECT = { kind: 'sample', identity: { kind: 'catalog', id: SAMPLE_ID } }

const PROPOSAL_ROW = {
  proposalKey: TOKEN,
  subject: SUBJECT,
  stateToken: TOKEN,
  currentType: null,
  replacesType: false,
  evidenceKeys: [TOKEN],
  remembered: false,
  reviewable: true,
  assigned: false,
  decision: 'unreviewed',
  target: {
    dimension: 'instrument',
    key: 'instrument:drums',
    name: 'Drums',
    entityId: null,
  },
  dependencies: [],
  evidence: [
    {
      kind: 'path',
      occurrence: 'House/Drums/kick.wav',
      component: 'folder',
      availability: 'cataloged',
      text: 'Drums',
      clue: 'Drums',
      term: 'drums',
      rule: 'name',
      ruleVersion: 'path-v2',
      span: [0, 5],
    },
  ],
}

test('standalone review responses accept a summary and its preparation scope', () => {
  assert.equal(isStandaloneReviewSummary(SUMMARY), true)
  assert.equal(
    isStandaloneReviewPreparation({ ...SUMMARY, subjectScope: [SCOPE] }),
    true,
  )
})

test('standalone review responses reject malformed summaries and uncontrolled scope', () => {
  for (const value of [
    null,
    {},
    { ...SUMMARY, revision: 0 },
    { ...SUMMARY, token: 'not-hex' },
    { ...SUMMARY, contractVersion: 2 },
    { ...SUMMARY, targets: -1 },
    { ...SUMMARY, proposals: 1.5 },
    { ...SUMMARY, accepted: '1' },
    { ...SUMMARY, extra: true },
    { ...SUMMARY, subjectScope: [SCOPE] },
  ]) {
    assert.equal(isStandaloneReviewSummary(value), false, JSON.stringify(value))
  }
  for (const value of [
    SUMMARY,
    { ...SUMMARY, subjectScope: [] },
    { ...SUMMARY, subjectScope: [{ kind: 'folder', id: SAMPLE_ID }] },
    { ...SUMMARY, subjectScope: [{ kind: 'sample', id: '/kick.wav' }] },
    {
      ...SUMMARY,
      subjectScope: [{ kind: 'sample', identity: { kind: 'import' } }],
    },
  ]) {
    assert.equal(
      isStandaloneReviewPreparation(value),
      false,
      JSON.stringify(value),
    )
  }
})

test('standalone review proposal pages validate every row and the review reference', () => {
  const page = {
    ...REFERENCE,
    items: [PROPOSAL_ROW],
    total: 1,
    nextOffset: null,
  }
  assert.equal(isStandaloneReviewProposalPage(page), true)
  assert.equal(
    isStandaloneReviewProposalPage({ ...page, items: [], total: 0 }),
    true,
  )
  assert.equal(
    isStandaloneReviewProposalPage({ ...page, nextOffset: 50 }),
    true,
  )
})

test('standalone review proposal pages reject wrong decisions, unknown fields and bad evidence', () => {
  const page = {
    ...REFERENCE,
    items: [PROPOSAL_ROW],
    total: 1,
    nextOffset: null,
  }
  for (const row of [
    { ...PROPOSAL_ROW, decision: 'maybe' },
    { ...PROPOSAL_ROW, decision: 'unreviewed', note: 'x' },
    { ...PROPOSAL_ROW, evidenceKeys: [] },
    { ...PROPOSAL_ROW, target: { dimension: 'genre', key: 'x' } },
    { ...PROPOSAL_ROW, subject: { kind: 'pack' } },
  ]) {
    assert.equal(
      isStandaloneReviewProposalPage({ ...page, items: [row] }),
      false,
      JSON.stringify(row),
    )
  }
  for (const value of [
    null,
    { ...page, items: [PROPOSAL_ROW], total: -1 },
    { ...page, items: [PROPOSAL_ROW], nextOffset: -1 },
    { ...page, items: [PROPOSAL_ROW], nextOffset: 1.5 },
    { ...page, revision: 0 },
    { ...page, items: [PROPOSAL_ROW], rows: [] },
  ]) {
    assert.equal(isStandaloneReviewProposalPage(value), false)
  }
})

test('standalone review ambiguity pages validate their rows separately from proposals', () => {
  const ambiguity = {
    subject: SUBJECT,
    reason: 'conflicting-targets',
    dimension: 'instrument',
    targets: [{ dimension: 'instrument', key: 'instrument:drums' }],
    evidence: [
      {
        kind: 'path',
        occurrence: 'House/Drums/Drum Breaks.wav',
        component: 'filename',
        availability: 'cataloged',
        text: 'Drum Breaks',
        clue: 'Drum Breaks',
        term: 'drum',
        rule: 'name',
        ruleVersion: 'path-v2',
        span: [0, 4],
      },
    ],
  }
  const page = {
    ...REFERENCE,
    items: [ambiguity],
    total: 1,
    nextOffset: null,
  }
  assert.equal(isStandaloneReviewAmbiguityPage(page), true)
  assert.equal(
    isStandaloneReviewAmbiguityPage({ ...page, items: [PROPOSAL_ROW] }),
    false,
  )
  assert.equal(
    isStandaloneReviewProposalPage({ ...page, items: [ambiguity] }),
    false,
  )
})

test('standalone review discard results carry only the released review identity', () => {
  assert.equal(isStandaloneReviewDiscardResult({ reviewId: 'review-1' }), true)
  for (const value of [
    null,
    {},
    { reviewId: '' },
    { reviewId: 'x'.repeat(257) },
    { reviewId: 'review-1', revision: 1 },
  ]) {
    assert.equal(isStandaloneReviewDiscardResult(value), false)
  }
})

const RESULT = {
  subject: SCOPE,
  outcome: 'committed',
  assignments: 1,
  created: { instruments: 1, genres: 0 },
  typeChanged: false,
  remembered: 0,
  forgotten: 0,
}

const EXECUTION = {
  ...REFERENCE,
  contractVersion: 1,
  results: [RESULT],
  totals: { committed: 1, stale: 0, blocked: 0, failed: 0 },
}

test('standalone execution results carry per-target outcomes and totals', () => {
  assert.equal(isStandaloneReviewExecutionResult(EXECUTION), true)
  const stale = {
    ...EXECUTION,
    results: [
      {
        ...RESULT,
        outcome: 'stale',
        assignments: 0,
        created: { instruments: 0, genres: 0 },
        message: 'Reviewed state changed. Prepare the review again.',
      },
    ],
    totals: { committed: 0, stale: 1, blocked: 0, failed: 0 },
  }
  assert.equal(isStandaloneReviewExecutionResult(stale), true)
})

test('standalone execution results reject unknown outcomes, counts and fields', () => {
  for (const value of [
    null,
    {},
    { ...EXECUTION, results: [{ ...RESULT, outcome: 'pending' }] },
    { ...EXECUTION, results: [{ ...RESULT, assignments: -1 }] },
    { ...EXECUTION, results: [{ ...RESULT, created: { instruments: 0 } }] },
    { ...EXECUTION, results: [{ ...RESULT, subject: SUBJECT }] },
    { ...EXECUTION, results: [{ ...RESULT, extra: true }] },
    {
      ...EXECUTION,
      totals: { committed: 1, stale: 0, blocked: 0 },
    },
    { ...EXECUTION, decisions: [] },
  ]) {
    assert.equal(isStandaloneReviewExecutionResult(value), false)
  }
})
