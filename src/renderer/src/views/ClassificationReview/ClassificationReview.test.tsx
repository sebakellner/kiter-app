import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import type {
  ClassificationAmbiguityRow,
  ClassificationReviewPage,
  ClassificationReviewReference,
  ClassificationReviewRow,
  ClassificationReviewSummary,
} from '@shared/features/classification/batch-schemas'
import type { StandaloneReviewPreparation } from '@shared/ipc/standaloneReview'
import {
  requireStandaloneReviewAcceptAllRequest,
  requireStandaloneReviewDecisionsRequest,
  requireStandaloneReviewDiscardRequest,
  requireStandaloneReviewPageRequest,
} from '@shared/ipc/standaloneReview'
import { createTestApi } from '../../../../../tests/support/ui/bridge'
import { ClassificationReview } from './ClassificationReview'

const SAMPLE_A = '11111111-1111-4111-8111-111111111111'
const SAMPLE_B = '22222222-2222-4222-8222-222222222222'
const TOKEN = 'a'.repeat(64)
const REVIEW_ID = 'review-1'
const SUBJECTS = [
  { kind: 'sample' as const, id: SAMPLE_A },
  { kind: 'sample' as const, id: SAMPLE_B },
]

function hex(value: number): string {
  return value.toString(16).padStart(64, '0')
}

function reference(revision = 1): ClassificationReviewReference {
  return { reviewId: REVIEW_ID, revision, token: TOKEN }
}

function summary(
  overrides: Partial<ClassificationReviewSummary> = {},
): ClassificationReviewSummary {
  return {
    ...reference(),
    contractVersion: 1,
    targets: 2,
    proposals: 3,
    reviewable: 3,
    remembered: 1,
    ambiguities: 1,
    requiredCreations: 1,
    typeReplacements: 1,
    accepted: 0,
    rejected: 0,
    ...overrides,
  }
}

function preparation(
  overrides: Partial<StandaloneReviewPreparation> = {},
): StandaloneReviewPreparation {
  return {
    ...summary(),
    subjectScope: [...SUBJECTS],
    ...overrides,
  }
}

function row(
  overrides: Partial<ClassificationReviewRow> = {},
): ClassificationReviewRow {
  return {
    proposalKey: hex(1),
    target: {
      dimension: 'instrument',
      key: 'kick',
      name: 'Kick',
      entityId: null,
    },
    evidence: [
      {
        kind: 'path',
        occurrence: 'root:/library',
        component: 'filename',
        availability: 'cataloged',
        text: 'Cataloged location: kick.wav',
        clue: 'kick',
        term: 'Kick',
        rule: 'name',
        ruleVersion: 'path-v2',
        span: [0, 4],
      },
    ],
    dependencies: [],
    subject: { kind: 'sample', identity: { kind: 'catalog', id: SAMPLE_A } },
    stateToken: TOKEN,
    currentType: null,
    replacesType: false,
    evidenceKeys: [hex(9)],
    remembered: false,
    reviewable: true,
    assigned: false,
    decision: 'unreviewed',
    ...overrides,
  }
}

function proposalPage(
  items: ClassificationReviewRow[],
  overrides: Partial<ClassificationReviewPage<ClassificationReviewRow>> = {},
): ClassificationReviewPage<ClassificationReviewRow> {
  return {
    ...reference(),
    items,
    total: items.length,
    nextOffset: null,
    ...overrides,
  }
}

function ambiguity(
  overrides: Partial<ClassificationAmbiguityRow> = {},
): ClassificationAmbiguityRow {
  return {
    subject: { kind: 'sample', identity: { kind: 'catalog', id: SAMPLE_A } },
    reason: 'conflicting-targets',
    dimension: 'instrument',
    targets: [
      { dimension: 'instrument', key: 'kick' },
      { dimension: 'instrument', key: 'snare' },
    ],
    evidence: [
      {
        kind: 'path',
        occurrence: 'root:/library',
        component: 'filename',
        availability: 'cataloged',
        text: 'Cataloged location: kick.wav',
        clue: 'kick',
        term: 'Kick',
        rule: 'name',
        ruleVersion: 'path-v2',
        span: [0, 4],
      },
    ],
    ...overrides,
  }
}

function mount(
  api: ReturnType<typeof createTestApi>,
  state?: unknown,
): ReturnType<typeof createMemoryRouter> {
  vi.stubGlobal('api', api)
  const router = createMemoryRouter(
    [
      { path: '/classification/review', element: <ClassificationReview /> },
      { path: '/samples', element: <h1>Samples</h1> },
    ],
    { initialEntries: [{ pathname: '/classification/review', state }] },
  )
  render(<RouterProvider router={router} />)
  return router
}

test('preparing renders the summary counts and the first page of proposals', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation(),
  })
  api.standaloneReview.listProposals.mockResolvedValue({
    ok: true,
    data: proposalPage(
      [
        row(),
        row({
          proposalKey: hex(2),
          target: { dimension: 'sample-type', key: 'loop' },
          replacesType: true,
          currentType: 'one-shot',
        }),
      ],
      { total: 3, nextOffset: 2 },
    ),
  })
  mount(api, { subjects: SUBJECTS })

  expect(await screen.findByText('Targets: 2')).toBeVisible()
  expect(api.standaloneReview.prepare).toHaveBeenCalledExactlyOnceWith({
    subjects: SUBJECTS,
  })
  expect(api.standaloneReview.listProposals).toHaveBeenCalledExactlyOnceWith({
    ...reference(),
    offset: 0,
    limit: 50,
  })
  // Requests must satisfy the strict shared guards, not only this test's shape.
  expect(() =>
    requireStandaloneReviewPageRequest(
      api.standaloneReview.listProposals.mock.calls[0]?.[0],
    ),
  ).not.toThrow()

  const counts = screen.getByRole('list', { name: 'Review summary' })
  for (const entry of [
    'Targets: 2',
    'Proposals: 3',
    'Reviewable: 3',
    'Remembered: 1',
    'Ambiguities: 1',
    'Required creations: 1',
    'Type replacements: 1',
    'Accepted: 0',
    'Rejected: 0',
  ]) {
    expect(within(counts).getByText(entry)).toBeVisible()
  }

  const kick = screen.getByRole('row', { name: /Kick/ })
  expect(within(kick).getByText('Instrument')).toBeVisible()
  expect(within(kick).getByText('No')).toBeVisible()
  expect(within(kick).getByText('Unreviewed')).toBeVisible()

  const loop = screen.getByRole('row', { name: /Loop/ })
  expect(within(loop).getByText('Sample type')).toBeVisible()
  expect(within(loop).getByText('Yes')).toBeVisible()
  expect(screen.getByText('1–2 of 3')).toBeVisible()
})

test('staging Accept sends one explicit choice with the current reference and shows the new decision', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation(),
  })
  api.standaloneReview.listProposals
    .mockResolvedValueOnce({
      ok: true,
      data: proposalPage([row()], { total: 3, nextOffset: 1 }),
    })
    .mockResolvedValueOnce({
      ok: true,
      data: proposalPage([row({ decision: 'accept' })], {
        ...reference(2),
        total: 3,
        nextOffset: 1,
      }),
    })
  api.standaloneReview.stage.mockResolvedValue({
    ok: true,
    data: summary({ ...reference(2), accepted: 1 }),
  })
  const router = mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Accept Kick' }))

  expect(api.standaloneReview.stage).toHaveBeenCalledExactlyOnceWith({
    ...reference(),
    choices: [{ proposalKey: hex(1), decision: 'accept' }],
  })
  expect(() =>
    requireStandaloneReviewDecisionsRequest(
      api.standaloneReview.stage.mock.calls[0]?.[0],
    ),
  ).not.toThrow()
  expect(api.standaloneReview.listProposals).toHaveBeenLastCalledWith({
    ...reference(2),
    offset: 0,
    limit: 50,
  })
  expect(await screen.findByText('Accepted')).toBeVisible()
  expect(screen.getByText('Accepted: 1')).toBeVisible()
  expect(router.state.location.pathname).toBe('/classification/review')
})

test('Accept all shows the complete scope before staging every reviewable proposal', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation(),
  })
  api.standaloneReview.listProposals
    .mockResolvedValueOnce({
      ok: true,
      data: proposalPage([row(), row({ proposalKey: hex(2) })], {
        total: 3,
        nextOffset: 2,
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      data: proposalPage(
        [
          row({ decision: 'accept' }),
          row({ proposalKey: hex(2), decision: 'accept' }),
        ],
        { ...reference(2), total: 3, nextOffset: 2 },
      ),
    })
  api.standaloneReview.acceptAll.mockResolvedValue({
    ok: true,
    data: summary({ ...reference(2), accepted: 3, reviewable: 0 }),
  })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Accept all' }))

  const scope = screen.getByRole('region', { name: 'Accept all scope' })
  expect(within(scope).getByText('Samples in this review: 2')).toBeVisible()
  expect(within(scope).getByText('Proposals in this review: 3')).toBeVisible()
  expect(
    within(scope).getByText('Proposals outside this page: 1'),
  ).toBeVisible()
  expect(within(scope).getByText('Required creations: 1')).toBeVisible()
  expect(within(scope).getByText('Type replacements: 1')).toBeVisible()
  expect(api.standaloneReview.acceptAll).not.toHaveBeenCalled()

  await user.click(
    within(scope).getByRole('button', { name: 'Accept all proposals' }),
  )

  expect(api.standaloneReview.acceptAll).toHaveBeenCalledExactlyOnceWith(
    reference(),
  )
  expect(() =>
    requireStandaloneReviewAcceptAllRequest(
      api.standaloneReview.acceptAll.mock.calls[0]?.[0],
    ),
  ).not.toThrow()
  expect(await screen.findByText('Reviewable: 0')).toBeVisible()
})

test('a stale review explains the failure and recovers when prepared again', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValueOnce({
    ok: true,
    data: preparation(),
  })
  api.standaloneReview.listProposals.mockResolvedValueOnce({
    ok: true,
    data: proposalPage([row()]),
  })
  api.standaloneReview.stage.mockResolvedValue({
    ok: false,
    error: {
      code: 'STALE_REVIEW',
      message: 'This review changed. Prepare it again.',
    },
  })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Accept Kick' }))

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('This classification review is out of date.')
  expect(alert).toHaveTextContent('This review changed. Prepare it again.')
  expect(
    screen.queryByRole('button', { name: 'Accept Kick' }),
  ).not.toBeInTheDocument()
  expect(screen.queryByText('Targets: 2')).not.toBeInTheDocument()

  api.standaloneReview.prepare.mockResolvedValueOnce({
    ok: true,
    data: preparation({
      ...reference(5),
    }),
  })
  api.standaloneReview.listProposals.mockResolvedValueOnce({
    ok: true,
    data: proposalPage([row({ decision: 'reject' })], { ...reference(5) }),
  })
  await user.click(within(alert).getByRole('button', { name: 'Prepare again' }))

  expect(api.standaloneReview.prepare).toHaveBeenCalledTimes(2)
  expect(api.standaloneReview.prepare).toHaveBeenLastCalledWith({
    subjects: SUBJECTS,
  })
  expect(await screen.findByText('Targets: 2')).toBeVisible()
  expect(await screen.findByText('Rejected')).toBeVisible()
})

test('a review that is gone offers to prepare it again', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation(),
  })
  api.standaloneReview.listProposals.mockResolvedValue({
    ok: false,
    error: {
      code: 'NOT_FOUND',
      message: 'This review is no longer available.',
    },
  })
  mount(api, { subjects: SUBJECTS })

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(
    'This classification review is no longer available.',
  )
  expect(
    within(alert).getByRole('button', { name: 'Prepare again' }),
  ).toBeVisible()
})

test('Discard review releases the review and returns to the samples list', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation(),
  })
  api.standaloneReview.listProposals.mockResolvedValue({
    ok: true,
    data: proposalPage([row()]),
  })
  api.standaloneReview.discard.mockResolvedValue({
    ok: true,
    data: { reviewId: REVIEW_ID },
  })
  const router = mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await user.click(
    await screen.findByRole('button', { name: 'Discard review' }),
  )

  expect(api.standaloneReview.discard).toHaveBeenCalledExactlyOnceWith({
    reviewId: REVIEW_ID,
  })
  expect(() =>
    requireStandaloneReviewDiscardRequest(
      api.standaloneReview.discard.mock.calls[0]?.[0],
    ),
  ).not.toThrow()
  expect(await screen.findByRole('heading', { name: 'Samples' })).toBeVisible()
  expect(router.state.location.pathname).toBe('/samples')
})

test('ambiguities load on demand with their reason, targets and evidence', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation(),
  })
  api.standaloneReview.listProposals.mockResolvedValue({
    ok: true,
    data: proposalPage([row()]),
  })
  api.standaloneReview.listAmbiguities.mockResolvedValue({
    ok: true,
    data: { ...reference(), items: [ambiguity()], total: 1, nextOffset: null },
  })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await user.click(
    await screen.findByRole('button', { name: 'Show ambiguities (1)' }),
  )

  expect(api.standaloneReview.listAmbiguities).toHaveBeenCalledExactlyOnceWith({
    ...reference(),
    offset: 0,
    limit: 50,
  })
  const ambiguities = await screen.findByRole('region', { name: 'Ambiguities' })
  expect(
    within(ambiguities).getByText('Conflicting targets (Instrument)'),
  ).toBeVisible()
  expect(
    within(ambiguities).getByText('Possible targets: kick, snare'),
  ).toBeVisible()
  expect(
    within(ambiguities).getByText('Cataloged location: kick.wav'),
  ).toBeVisible()
})

test('opening the route without subjects explains the empty state and calls nothing', () => {
  const api = createTestApi()
  mount(api)

  expect(
    screen.getByText(
      'Select one or more Samples in the Samples list, then choose Review classifications.',
    ),
  ).toBeVisible()
  expect(screen.getByRole('link', { name: 'Back to Samples' })).toHaveAttribute(
    'href',
    '/samples',
  )
  expect(api.standaloneReview.prepare).not.toHaveBeenCalled()
  expect(api.standaloneReview.listProposals).not.toHaveBeenCalled()
  expect(api.standaloneReview.listAmbiguities).not.toHaveBeenCalled()
  expect(api.standaloneReview.stage).not.toHaveBeenCalled()
  expect(api.standaloneReview.acceptAll).not.toHaveBeenCalled()
  expect(api.standaloneReview.discard).not.toHaveBeenCalled()
  expect(api.standaloneReview.execute).not.toHaveBeenCalled()
})

test('a failed page reload after staging keeps the reference main just issued', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation(),
  })
  api.standaloneReview.listProposals
    .mockResolvedValueOnce({
      ok: true,
      data: proposalPage([row()], { total: 3, nextOffset: 1 }),
    })
    // The reload right after a successful stage fails with a transient read error.
    .mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'STORAGE_FAILED',
        message: 'Unable to read the review page.',
      },
    })
    .mockResolvedValueOnce({
      ok: true,
      data: proposalPage([row({ decision: 'accept' })], {
        ...reference(3),
        total: 3,
        nextOffset: 1,
      }),
    })
  api.standaloneReview.stage
    .mockResolvedValueOnce({
      ok: true,
      data: summary({ ...reference(2), accepted: 1 }),
    })
    .mockResolvedValueOnce({
      ok: true,
      data: summary({ ...reference(3), accepted: 2 }),
    })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Accept Kick' }))

  // The choice is already staged in main, so the surface must keep the revision it
  // was given instead of falling back to the pre-stage one and losing every choice.
  expect(api.standaloneReview.listProposals).toHaveBeenLastCalledWith({
    ...reference(2),
    offset: 0,
    limit: 50,
  })
  expect(screen.queryByRole('button', { name: 'Prepare again' })).toBeNull()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to read the review page.',
  )

  await user.click(await screen.findByRole('button', { name: 'Accept Kick' }))

  expect(api.standaloneReview.stage).toHaveBeenLastCalledWith({
    ...reference(2),
    choices: [{ proposalKey: hex(1), decision: 'accept' }],
  })
})
