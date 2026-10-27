import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DomainValidationError } from '../domain/validation.ts'
import {
  requireStandaloneReviewAcceptAllRequest,
  requireStandaloneReviewDecisionsRequest,
  requireStandaloneReviewDiscardRequest,
  requireStandaloneReviewPageRequest,
  requireStandaloneReviewPrepareRequest,
  STANDALONE_REVIEW_CHANNELS,
} from './standaloneReview.ts'

const SAMPLE_ID = '00000000-0000-4000-8000-000000000001'
const TOKEN = 'a'.repeat(64)
const REFERENCE = { reviewId: 'review-1', revision: 1, token: TOKEN }

test('standalone review channels stay narrow and stable', () => {
  assert.deepEqual(STANDALONE_REVIEW_CHANNELS, {
    prepare: 'classification:prepare-standalone-review',
    listProposals: 'classification:list-standalone-review-proposals',
    listAmbiguities: 'classification:list-standalone-review-ambiguities',
    stage: 'classification:stage-standalone-review',
    acceptAll: 'classification:accept-all-standalone-review',
    discard: 'classification:discard-standalone-review',
  })
})

test('standalone review prepare accepts 1-100 catalog subjects only', () => {
  const one = { subjects: [{ kind: 'sample', id: SAMPLE_ID }] }
  assert.deepEqual(requireStandaloneReviewPrepareRequest(one), one)

  const subjects = Array.from({ length: 100 }, (_, index) => ({
    kind: index % 2 === 0 ? 'sample' : 'pack',
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  }))
  assert.deepEqual(requireStandaloneReviewPrepareRequest({ subjects }), {
    subjects,
  })
})

test('standalone review prepare rejects empty, oversized, import-local and malformed subjects', () => {
  for (const value of [
    null,
    {},
    { subjects: [] },
    { subjects: [{ kind: 'sample', id: SAMPLE_ID }], extra: true },
    { subjects: [{ kind: 'sample', id: SAMPLE_ID, extra: true }] },
    { subjects: [{ kind: 'folder', id: SAMPLE_ID }] },
    { subjects: [{ kind: 'sample', id: '/library/kick.wav' }] },
    { subjects: [{ kind: 'sample', id: SAMPLE_ID.slice(1) }] },
    { subjects: [{ kind: 'sample' }] },
    {
      subjects: [
        {
          kind: 'sample',
          identity: { kind: 'import', preparationId: 'p', id: 'c' },
        },
      ],
    },
    {
      subjects: Array.from({ length: 101 }, (_, index) => ({
        kind: 'sample',
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      })),
    },
  ]) {
    assert.throws(() => requireStandaloneReviewPrepareRequest(value))
  }
  assert.throws(
    () => requireStandaloneReviewPrepareRequest({ subjects: 'all' }),
    DomainValidationError,
  )
})

test('standalone review page requests apply defaults and validate the review reference', () => {
  assert.deepEqual(requireStandaloneReviewPageRequest(REFERENCE), {
    ...REFERENCE,
    offset: 0,
    limit: 50,
  })
  assert.deepEqual(
    requireStandaloneReviewPageRequest({
      ...REFERENCE,
      offset: 50,
      limit: 100,
    }),
    { ...REFERENCE, offset: 50, limit: 100 },
  )
  for (const value of [
    null,
    {},
    { ...REFERENCE, revision: 0 },
    { ...REFERENCE, revision: -1 },
    { ...REFERENCE, revision: 1.5 },
    { ...REFERENCE, token: 'not-hex' },
    { ...REFERENCE, token: TOKEN.slice(1) },
    { ...REFERENCE, offset: -1 },
    { ...REFERENCE, offset: 0.5 },
    { ...REFERENCE, limit: 0 },
    { ...REFERENCE, limit: 101 },
    { ...REFERENCE, reviewId: '' },
    { ...REFERENCE, cursor: 50 },
  ]) {
    assert.throws(() => requireStandaloneReviewPageRequest(value))
  }
})

test('standalone review decisions accept 1-100 explicit choices atomically', () => {
  const one = {
    ...REFERENCE,
    choices: [{ proposalKey: TOKEN, decision: 'accept' }],
  }
  assert.deepEqual(requireStandaloneReviewDecisionsRequest(one), one)

  const choices = ['accept', 'reject', 'unreviewed'].map((decision) => ({
    proposalKey: TOKEN,
    decision,
  }))
  assert.deepEqual(
    requireStandaloneReviewDecisionsRequest({ ...REFERENCE, choices }),
    { ...REFERENCE, choices },
  )

  const maximal = {
    ...REFERENCE,
    choices: Array.from({ length: 100 }, () => ({
      proposalKey: TOKEN,
      decision: 'reject',
    })),
  }
  assert.deepEqual(requireStandaloneReviewDecisionsRequest(maximal), maximal)
})

test('standalone review decisions reject empty, oversized and malformed choices', () => {
  for (const value of [
    null,
    REFERENCE,
    { ...REFERENCE, choices: [] },
    { ...REFERENCE, choices: [{ proposalKey: TOKEN, decision: 'maybe' }] },
    { ...REFERENCE, choices: [{ proposalKey: 'short', decision: 'accept' }] },
    { ...REFERENCE, choices: [{ proposalKey: TOKEN }] },
    {
      ...REFERENCE,
      choices: [{ proposalKey: TOKEN, decision: 'accept', note: 'x' }],
    },
    {
      ...REFERENCE,
      choices: Array.from({ length: 101 }, () => ({
        proposalKey: TOKEN,
        decision: 'accept',
      })),
    },
  ]) {
    assert.throws(() => requireStandaloneReviewDecisionsRequest(value))
  }
})

test('standalone review accept all requires the complete current reference', () => {
  assert.deepEqual(
    requireStandaloneReviewAcceptAllRequest(REFERENCE),
    REFERENCE,
  )
  for (const value of [
    null,
    {},
    { reviewId: 'review-1', revision: 1 },
    { ...REFERENCE, revision: 0 },
    { ...REFERENCE, token: 'Z'.repeat(64) },
    { ...REFERENCE, reviewId: 'x'.repeat(257) },
    { ...REFERENCE, page: 1 },
  ]) {
    assert.throws(() => requireStandaloneReviewAcceptAllRequest(value))
  }
})

test('standalone review discard requires only the review identity', () => {
  const request = { reviewId: 'review-1' }
  assert.deepEqual(requireStandaloneReviewDiscardRequest(request), request)
  for (const value of [
    null,
    {},
    { reviewId: '' },
    { reviewId: 'x'.repeat(257) },
    { reviewId: 'review-1', token: TOKEN },
    { reviewId: 'review-1', revision: 1 },
  ]) {
    assert.throws(() => requireStandaloneReviewDiscardRequest(value))
  }
})
