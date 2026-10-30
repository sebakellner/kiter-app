import { render, screen, waitFor, within } from '@testing-library/react'
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
import type {
  StandaloneExecutionResult,
  StandaloneExecutionTargetResult,
} from '@shared/features/classification/execution-schemas'
import type { StandaloneReviewPreparation } from '@shared/ipc/standaloneReview'
import {
  requireStandaloneReviewAcceptAllRequest,
  requireStandaloneReviewDecisionsRequest,
  requireStandaloneReviewDiscardRequest,
  requireStandaloneReviewExecutionRequest,
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

function executionTarget(
  overrides: Partial<StandaloneExecutionTargetResult> = {},
): StandaloneExecutionTargetResult {
  return {
    subject: { kind: 'sample', id: SAMPLE_A },
    outcome: 'committed',
    assignments: 1,
    created: { instruments: 0, genres: 0 },
    typeChanged: false,
    remembered: 0,
    forgotten: 0,
    ...overrides,
  }
}

function executionResult(
  results: StandaloneExecutionTargetResult[],
): StandaloneExecutionResult {
  const totals = { committed: 0, stale: 0, blocked: 0, failed: 0 }
  for (const result of results) {
    totals[result.outcome] += 1
  }
  return { ...reference(), contractVersion: 1, results, totals }
}

async function confirmExecution(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Execute' }))
  await user.click(screen.getByRole('button', { name: 'Save to catalog' }))
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
    includeRejected: false,
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
    // The retry re-applies the mode the surface last chose.
    includeRejected: false,
  })
  expect(await screen.findByText('Targets: 2')).toBeVisible()
  expect(await screen.findByText('Rejected')).toBeVisible()
})

test('the rejected-proposals checkbox re-prepares with remembered proposals and makes them actionable', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare
    .mockResolvedValueOnce({ ok: true, data: preparation() })
    .mockResolvedValueOnce({
      ok: true,
      data: preparation({ reviewId: 'review-2', remembered: 1, reviewable: 3 }),
    })
  api.standaloneReview.listProposals
    .mockResolvedValueOnce({
      ok: true,
      data: proposalPage([row({ remembered: true, reviewable: false })]),
    })
    .mockResolvedValue({
      ok: true,
      data: proposalPage([row({ remembered: true, reviewable: true })], {
        reviewId: 'review-2',
      }),
    })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  const mode = await screen.findByRole('checkbox', {
    name: 'Include proposals I rejected',
  })
  expect(mode).not.toBeChecked()
  const hidden = screen.getByRole('row', { name: /Kick/ })
  expect(within(hidden).getByText('Remembered rejection')).toBeVisible()
  expect(
    within(hidden).getByRole('button', { name: 'Accept Kick' }),
  ).toBeDisabled()

  await user.click(mode)

  // The mode is fixed at preparation time, so changing it prepares again.
  expect(api.standaloneReview.prepare).toHaveBeenLastCalledWith({
    subjects: SUBJECTS,
    includeRejected: true,
  })
  expect(
    await screen.findByRole('checkbox', {
      name: 'Include proposals I rejected',
    }),
  ).toBeChecked()
  const included = await screen.findByRole('row', { name: /Kick/ })
  expect(within(included).getByText('Remembered rejection')).toBeVisible()
  expect(
    within(included).getByRole('button', { name: 'Accept Kick' }),
  ).toBeEnabled()
})

test('changing the rejected-proposals mode asks before discarding staged choices', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare
    .mockResolvedValueOnce({ ok: true, data: preparation({ accepted: 1 }) })
    .mockResolvedValueOnce({
      ok: true,
      data: preparation({ reviewId: 'review-2' }),
    })
  api.standaloneReview.listProposals
    .mockResolvedValueOnce({
      ok: true,
      data: proposalPage([row({ decision: 'accept' })]),
    })
    .mockResolvedValue({
      ok: true,
      data: proposalPage([row()], { reviewId: 'review-2' }),
    })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await user.click(
    await screen.findByRole('checkbox', {
      name: 'Include proposals I rejected',
    }),
  )

  const scope = screen.getByRole('region', { name: 'Review mode scope' })
  expect(scope).toHaveTextContent('discards the 1 staged choice')
  expect(api.standaloneReview.prepare).toHaveBeenCalledTimes(1)
  expect(
    screen.getByRole('checkbox', { name: 'Include proposals I rejected' }),
  ).not.toBeChecked()

  await user.click(within(scope).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('region', { name: 'Review mode scope' })).toBeNull()
  expect(api.standaloneReview.prepare).toHaveBeenCalledTimes(1)

  await user.click(
    screen.getByRole('checkbox', { name: 'Include proposals I rejected' }),
  )
  await user.click(
    within(screen.getByRole('region', { name: 'Review mode scope' })).getByRole(
      'button',
      {
        name: 'Discard staged choices and prepare again',
      },
    ),
  )

  expect(api.standaloneReview.prepare).toHaveBeenLastCalledWith({
    subjects: SUBJECTS,
    includeRejected: true,
  })
  expect(
    await screen.findByRole('checkbox', {
      name: 'Include proposals I rejected',
    }),
  ).toBeChecked()
})

test('Prepare again re-applies the chosen rejected-proposals mode', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare
    .mockResolvedValueOnce({ ok: true, data: preparation() })
    .mockResolvedValueOnce({
      ok: true,
      data: preparation({ reviewId: 'review-2', remembered: 1 }),
    })
    .mockResolvedValueOnce({
      ok: true,
      data: preparation({ reviewId: 'review-3', remembered: 1 }),
    })
  api.standaloneReview.listProposals
    .mockResolvedValueOnce({ ok: true, data: proposalPage([row()]) })
    .mockResolvedValueOnce({
      ok: true,
      data: proposalPage([row({ remembered: true })], {
        reviewId: 'review-2',
      }),
    })
    .mockResolvedValue({
      ok: true,
      data: proposalPage([row({ remembered: true })], {
        reviewId: 'review-3',
      }),
    })
  // A catalog change blocks the review, leaving Prepare again as the only route.
  api.standaloneReview.stage.mockResolvedValue({
    ok: false,
    error: { code: 'STALE_REVIEW', message: 'Catalog changed.' },
  })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await user.click(
    await screen.findByRole('checkbox', {
      name: 'Include proposals I rejected',
    }),
  )
  expect(api.standaloneReview.prepare).toHaveBeenLastCalledWith({
    subjects: SUBJECTS,
    includeRejected: true,
  })

  await user.click(await screen.findByRole('button', { name: 'Accept Kick' }))
  const alert = await screen.findByRole('alert')
  await user.click(within(alert).getByRole('button', { name: 'Prepare again' }))

  expect(api.standaloneReview.prepare).toHaveBeenLastCalledWith({
    subjects: SUBJECTS,
    includeRejected: true,
  })
  expect(
    await screen.findByRole('checkbox', {
      name: 'Include proposals I rejected',
    }),
  ).toBeChecked()
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

test('Execute stays disabled until at least one proposal is accepted', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation(),
  })
  api.standaloneReview.listProposals
    .mockResolvedValueOnce({ ok: true, data: proposalPage([row()]) })
    .mockResolvedValueOnce({
      ok: true,
      data: proposalPage([row({ decision: 'accept' })], { ...reference(2) }),
    })
  api.standaloneReview.stage.mockResolvedValue({
    ok: true,
    data: summary({ ...reference(2), accepted: 1 }),
  })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  expect(await screen.findByRole('button', { name: 'Execute' })).toBeDisabled()
  expect(api.standaloneReview.execute).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Accept Kick' }))

  expect(await screen.findByText('Accepted: 1')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Execute' })).toBeEnabled()
  expect(api.standaloneReview.execute).not.toHaveBeenCalled()
})

test('the Execute confirmation states the write scope and executes the current reference once', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation({ requiredCreations: 3, typeReplacements: 2 }),
  })
  api.standaloneReview.listProposals
    .mockResolvedValueOnce({ ok: true, data: proposalPage([row()]) })
    .mockResolvedValueOnce({
      ok: true,
      data: proposalPage([row({ decision: 'accept' })], { ...reference(2) }),
    })
  api.standaloneReview.stage.mockResolvedValue({
    ok: true,
    data: summary({
      ...reference(2),
      accepted: 1,
      requiredCreations: 3,
      typeReplacements: 2,
    }),
  })
  api.standaloneReview.execute.mockResolvedValue({
    ok: true,
    data: executionResult([executionTarget()]),
  })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Accept Kick' }))
  await user.click(await screen.findByRole('button', { name: 'Execute' }))

  const scope = screen.getByRole('region', { name: 'Execute scope' })
  expect(within(scope).getByText('Accepted proposals: 1')).toBeVisible()
  expect(
    within(scope).getByText('Required vocabulary creations: 3'),
  ).toBeVisible()
  expect(within(scope).getByText('Sample-type replacements: 2')).toBeVisible()
  expect(within(scope).getByText('Samples in this review: 2')).toBeVisible()
  expect(scope).toHaveTextContent('writes these changes to the catalog')
  expect(scope).toHaveTextContent('cannot be undone from this screen')
  // Confirmation is inline, so nothing traps focus in a dialog.
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(api.standaloneReview.execute).not.toHaveBeenCalled()

  await user.click(
    within(scope).getByRole('button', { name: 'Save to catalog' }),
  )

  // The staged revision, not the one this review was prepared with.
  expect(api.standaloneReview.execute).toHaveBeenCalledExactlyOnceWith(
    reference(2),
  )
  expect(() =>
    requireStandaloneReviewExecutionRequest(
      api.standaloneReview.execute.mock.calls[0]?.[0],
    ),
  ).not.toThrow()

  expect(
    await screen.findByRole('region', { name: 'Execution results' }),
  ).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Execute' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Accept all' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Discard review' })).toBeNull()
  expect(screen.queryByText('Accepted: 1')).toBeNull()
  expect(api.standaloneReview.execute).toHaveBeenCalledTimes(1)
})

test('a committed batch reports every target as saved with totals', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation({ accepted: 2 }),
  })
  api.standaloneReview.listProposals.mockResolvedValue({
    ok: true,
    data: proposalPage([row({ decision: 'accept' })]),
  })
  api.standaloneReview.execute.mockResolvedValue({
    ok: true,
    data: executionResult([
      executionTarget({
        assignments: 2,
        created: { instruments: 1, genres: 2 },
        typeChanged: true,
      }),
      executionTarget({
        subject: { kind: 'sample', id: SAMPLE_B },
        typeChanged: false,
      }),
    ]),
  })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await confirmExecution(user)

  const results = await screen.findByRole('region', {
    name: 'Execution results',
  })
  expect(
    within(results).getByRole('heading', { name: 'Saved to the catalog' }),
  ).toBeVisible()
  expect(
    within(results).getByText(
      'Every reviewed target was saved: 2 of 2 targets committed.',
    ),
  ).toBeVisible()

  const totals = within(results).getByRole('list', { name: 'Execution totals' })
  expect(within(totals).getByText('Committed targets: 2')).toBeVisible()
  expect(within(totals).getByText('Stale targets: 0')).toBeVisible()
  expect(within(totals).getByText('Blocked targets: 0')).toBeVisible()
  expect(within(totals).getByText('Failed targets: 0')).toBeVisible()

  const first = within(results).getByRole('listitem', {
    name: `Sample ${SAMPLE_A.slice(0, 8)}…`,
  })
  expect(within(first).getByText('Saved')).toBeVisible()
  expect(within(first).getByText('Assignments written: 2')).toBeVisible()
  expect(
    within(first).getByText('Vocabulary created: 1 Instrument, 2 Genres'),
  ).toBeVisible()
  expect(within(first).getByText('Sample type changed: Yes')).toBeVisible()

  const second = within(results).getByRole('listitem', {
    name: `Sample ${SAMPLE_B.slice(0, 8)}…`,
  })
  expect(within(second).getByText('Assignments written: 1')).toBeVisible()
  expect(
    within(second).getByText('Vocabulary created: 0 Instruments, 0 Genres'),
  ).toBeVisible()
  expect(within(second).getByText('Sample type changed: No')).toBeVisible()

  expect(
    within(results).getByRole('link', { name: 'Back to Samples' }),
  ).toHaveAttribute('href', '/samples')
  expect(
    within(results).queryByRole('link', { name: 'Review again' }),
  ).toBeNull()
})

test('a partially committed batch is never presented as success and reviews only the uncommitted subject again', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation({ accepted: 2 }),
  })
  api.standaloneReview.listProposals.mockResolvedValue({
    ok: true,
    data: proposalPage([row({ decision: 'accept' })]),
  })
  api.standaloneReview.execute.mockResolvedValue({
    ok: true,
    data: executionResult([
      executionTarget({ assignments: 2 }),
      executionTarget({
        subject: { kind: 'sample', id: SAMPLE_B },
        outcome: 'stale',
        assignments: 0,
        message: 'Reviewed state changed. Prepare the review again.',
      }),
    ]),
  })
  const router = mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await confirmExecution(user)

  const results = await screen.findByRole('region', {
    name: 'Execution results',
  })
  expect(
    within(results).queryByRole('heading', { name: 'Saved to the catalog' }),
  ).toBeNull()
  expect(
    within(results).getByRole('heading', {
      name: 'Only some targets were saved',
    }),
  ).toBeVisible()
  expect(
    within(results).getByText(
      '1 of 2 targets committed. 1 did not, and nothing was written for those targets.',
    ),
  ).toBeVisible()
  expect(within(results).getByText('Committed targets: 1')).toBeVisible()
  expect(within(results).getByText('Stale targets: 1')).toBeVisible()

  const committed = within(results).getByRole('listitem', {
    name: `Sample ${SAMPLE_A.slice(0, 8)}…`,
  })
  expect(within(committed).getByText('Saved')).toBeVisible()
  expect(within(committed).getByText('Assignments written: 2')).toBeVisible()

  const stale = within(results).getByRole('listitem', {
    name: `Sample ${SAMPLE_B.slice(0, 8)}…`,
  })
  expect(within(stale).getByText('Not saved (catalog changed)')).toBeVisible()
  expect(within(stale).getByText('Assignments written: 0')).toBeVisible()
  expect(
    within(stale).getByText(
      'The catalog changed since this review was prepared, so nothing was written for this target.',
    ),
  ).toBeVisible()
  expect(
    within(stale).getByText(
      'Reviewed state changed. Prepare the review again.',
    ),
  ).toBeVisible()

  expect(
    within(results).queryByRole('link', { name: 'Back to Samples' }),
  ).toBeNull()
  await user.click(within(results).getByRole('link', { name: 'Review again' }))

  await waitFor(() =>
    expect(api.standaloneReview.prepare).toHaveBeenLastCalledWith({
      subjects: [{ kind: 'sample', id: SAMPLE_B }],
      includeRejected: false,
    }),
  )
  expect(router.state.location.pathname).toBe('/classification/review')
  expect(router.state.location.state).toEqual({
    subjects: [{ kind: 'sample', id: SAMPLE_B }],
  })
  expect(api.standaloneReview.execute).toHaveBeenCalledTimes(1)
})

test('a stale target names the field that changed since preparation', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation({ accepted: 1 }),
  })
  api.standaloneReview.listProposals.mockResolvedValue({
    ok: true,
    data: proposalPage([row({ decision: 'accept' })]),
  })
  api.standaloneReview.execute.mockResolvedValue({
    ok: true,
    data: executionResult([
      executionTarget({
        outcome: 'stale',
        assignments: 0,
        changedFields: ['currentType', 'assignments'],
        message: 'Reviewed state changed. Prepare the review again.',
      }),
    ]),
  })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await confirmExecution(user)

  const results = await screen.findByRole('region', {
    name: 'Execution results',
  })
  const stale = within(results).getByRole('listitem', {
    name: `Sample ${SAMPLE_A.slice(0, 8)}…`,
  })
  expect(
    within(stale).getByText(
      'Changed since preparation: Sample type, Assignments.',
    ),
  ).toBeVisible()
})

test('a stale target without a field report still explains the refusal', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation({ accepted: 1 }),
  })
  api.standaloneReview.listProposals.mockResolvedValue({
    ok: true,
    data: proposalPage([row({ decision: 'accept' })]),
  })
  api.standaloneReview.execute.mockResolvedValue({
    ok: true,
    data: executionResult([
      executionTarget({
        outcome: 'stale',
        assignments: 0,
        message: 'Reviewed state changed. Prepare the review again.',
      }),
    ]),
  })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await confirmExecution(user)

  const results = await screen.findByRole('region', {
    name: 'Execution results',
  })
  const stale = within(results).getByRole('listitem', {
    name: `Sample ${SAMPLE_A.slice(0, 8)}…`,
  })
  expect(within(stale).getByText('Not saved (catalog changed)')).toBeVisible()
  // No reviewed field digests means no field report; the surface never invents one.
  expect(within(stale).queryByText(/Changed since preparation/u)).toBeNull()
})

test('a blocked target explains the Pack dependency and writes nothing', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation({ accepted: 1 }),
  })
  api.standaloneReview.listProposals.mockResolvedValue({
    ok: true,
    data: proposalPage([row({ decision: 'accept' })]),
  })
  api.standaloneReview.execute.mockResolvedValue({
    ok: true,
    data: executionResult([
      executionTarget({
        subject: { kind: 'sample', id: SAMPLE_B },
        outcome: 'blocked',
        assignments: 0,
        message: 'A required Pack decision did not commit.',
      }),
    ]),
  })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await confirmExecution(user)

  const results = await screen.findByRole('region', {
    name: 'Execution results',
  })
  expect(
    within(results).getByRole('heading', {
      name: 'No reviewed target was saved',
    }),
  ).toBeVisible()
  expect(
    within(results).getByText(
      '1 of 1 targets did not commit, so nothing was written.',
    ),
  ).toBeVisible()

  const blocked = within(results).getByRole('listitem', {
    name: `Sample ${SAMPLE_B.slice(0, 8)}…`,
  })
  expect(
    within(blocked).getByText('Not executed (Pack decision missing)'),
  ).toBeVisible()
  expect(
    within(blocked).getByText(
      'A required Pack decision did not commit, so this target was not executed.',
    ),
  ).toBeVisible()
  expect(
    within(blocked).getByText('A required Pack decision did not commit.'),
  ).toBeVisible()
  expect(within(blocked).getByText('Assignments written: 0')).toBeVisible()
  expect(
    within(results).getByRole('link', { name: 'Review again' }),
  ).toHaveAttribute('href', '/classification/review')
})

test.each([
  ['STALE_REVIEW', 'This classification review is out of date.'],
  ['NOT_FOUND', 'This classification review is no longer available.'],
  ['STORAGE_FAILED', 'This classification review could not be saved.'],
] as const)(
  'an execute failure (%s) drops the review and offers Prepare again',
  async (code, title) => {
    const api = createTestApi()
    api.standaloneReview.prepare.mockResolvedValue({
      ok: true,
      data: preparation({ accepted: 1 }),
    })
    api.standaloneReview.listProposals.mockResolvedValue({
      ok: true,
      data: proposalPage([row({ decision: 'accept' })]),
    })
    api.standaloneReview.execute.mockResolvedValue({
      ok: false,
      error: { code, message: 'The review was released before it was saved.' },
    })
    mount(api, { subjects: SUBJECTS })
    const user = userEvent.setup()

    await confirmExecution(user)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(title)
    expect(alert).toHaveTextContent(
      'The review was released before it was saved.',
    )
    expect(
      within(alert).getByRole('button', { name: 'Prepare again' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('region', { name: 'Execution results' }),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: 'Execute' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Accept all' })).toBeNull()
    expect(api.standaloneReview.execute).toHaveBeenCalledTimes(1)
  },
)

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

test('an open Execute confirmation never survives preparing a new review', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare
    .mockResolvedValueOnce({
      ok: true,
      data: preparation({ ...reference(1), accepted: 1 }),
    })
    .mockResolvedValueOnce({
      ok: true,
      data: preparation({ reviewId: 'review-2', revision: 1, accepted: 2 }),
    })
  api.standaloneReview.listProposals
    .mockResolvedValueOnce({
      ok: true,
      data: proposalPage([row({ decision: 'accept' })]),
    })
    .mockResolvedValue({
      ok: true,
      data: proposalPage([row({ decision: 'accept' })], {
        reviewId: 'review-2',
        revision: 1,
      }),
    })
  // A refused choice blocks the surface, which is the path that replaces the review.
  api.standaloneReview.stage.mockResolvedValue({
    ok: false,
    error: { code: 'STALE_REVIEW', message: 'Catalog changed.' },
  })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Execute' }))
  expect(screen.getByRole('button', { name: 'Save to catalog' })).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Reject Kick' }))
  await user.click(await screen.findByRole('button', { name: 'Prepare again' }))

  expect(await screen.findByText('Accepted: 2')).toBeVisible()
  // The confirmation belonged to the consumed review: the new one needs its own.
  expect(screen.queryByRole('button', { name: 'Save to catalog' })).toBeNull()
  expect(api.standaloneReview.execute).not.toHaveBeenCalled()
})

test('changing the decisions closes an open Execute confirmation', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation({ accepted: 1 }),
  })
  api.standaloneReview.listProposals
    .mockResolvedValueOnce({
      ok: true,
      data: proposalPage([row({ decision: 'accept' })]),
    })
    // The reload after staging carries the review's current revision.
    .mockResolvedValue({
      ok: true,
      data: proposalPage([row({ decision: 'unreviewed' })], { revision: 2 }),
    })
  // Un-accepting the last proposal leaves nothing to execute.
  api.standaloneReview.stage.mockResolvedValue({
    ok: true,
    data: summary({ ...reference(2), accepted: 0 }),
  })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Execute' }))
  expect(screen.getByRole('button', { name: 'Save to catalog' })).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Undo Kick' }))

  // The confirmation described the accepted set it was opened for; it must not
  // survive a decision change, or it would execute a scope nobody confirmed.
  expect(screen.queryByRole('button', { name: 'Save to catalog' })).toBeNull()
  expect(api.standaloneReview.execute).not.toHaveBeenCalled()
})

test('a preparation failure still reports a preparation failure', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: false,
    error: { code: 'STORAGE_FAILED', message: 'Unable to read the catalog.' },
  })
  mount(api, { subjects: SUBJECTS })

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(
    'This classification review could not be prepared.',
  )
  expect(alert).not.toHaveTextContent('could not be saved')
})

test('a confirmation does not reappear when the accepted count returns to its old value', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation({ accepted: 1 }),
  })
  api.standaloneReview.listProposals
    .mockResolvedValueOnce({
      ok: true,
      data: proposalPage([row({ decision: 'accept' })]),
    })
    .mockResolvedValueOnce({
      ok: true,
      data: proposalPage([row({ decision: 'unreviewed' })], { revision: 2 }),
    })
    .mockResolvedValue({
      ok: true,
      data: proposalPage([row({ decision: 'accept' })], { revision: 3 }),
    })
  // Undo the accepted proposal, then accept the proposal again: the count returns
  // to one but the revision moved, so it is a different reviewed decision set.
  api.standaloneReview.stage
    .mockResolvedValueOnce({
      ok: true,
      data: summary({ ...reference(2), accepted: 0 }),
    })
    .mockResolvedValueOnce({
      ok: true,
      data: summary({ ...reference(3), accepted: 1 }),
    })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Execute' }))
  expect(screen.getByRole('button', { name: 'Save to catalog' })).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Undo Kick' }))
  expect(screen.queryByRole('button', { name: 'Save to catalog' })).toBeNull()

  await user.click(screen.getByRole('button', { name: 'Accept Kick' }))
  expect(await screen.findByText('Accepted: 1')).toBeVisible()

  expect(screen.queryByRole('button', { name: 'Save to catalog' })).toBeNull()
  expect(api.standaloneReview.execute).not.toHaveBeenCalled()
})

test('execution results show the target label when main supplies one', async () => {
  const api = createTestApi()
  api.standaloneReview.prepare.mockResolvedValue({
    ok: true,
    data: preparation({ accepted: 1 }),
  })
  api.standaloneReview.listProposals.mockResolvedValue({
    ok: true,
    data: proposalPage([row({ decision: 'accept' })]),
  })
  api.standaloneReview.execute.mockResolvedValue({
    ok: true,
    data: executionResult([
      {
        subject: { kind: 'sample', id: SAMPLE_A },
        label: 'kick.wav',
        outcome: 'committed',
        assignments: 1,
        created: { instruments: 1, genres: 0 },
        typeChanged: false,
        remembered: 0,
        forgotten: 0,
      },
      {
        // A target main could not name still renders, by shortened identity.
        subject: { kind: 'sample', id: SAMPLE_B },
        outcome: 'stale',
        assignments: 0,
        created: { instruments: 0, genres: 0 },
        typeChanged: false,
        remembered: 0,
        forgotten: 0,
        message: 'Reviewed state changed.',
      },
    ]),
  })
  mount(api, { subjects: SUBJECTS })
  const user = userEvent.setup()

  await confirmExecution(user)

  const results = await screen.findByRole('region', {
    name: 'Execution results',
  })
  expect(
    within(results).getByRole('listitem', { name: 'kick.wav' }),
  ).toBeVisible()
  expect(
    within(results).getByRole('listitem', {
      name: `Sample ${SAMPLE_B.slice(0, 8)}…`,
    }),
  ).toBeVisible()
})
