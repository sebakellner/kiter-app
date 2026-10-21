import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ClassificationBatchReview,
  classificationEvidenceKey,
  classificationPackEvidenceId,
} from './batch-review.ts'
import { createClassificationRecognizer } from './recognition.ts'
import { initialRecognitionVocabulary } from './vocabulary.ts'
import {
  classificationBatchSnapshotSchema,
  classificationBatchDraftSchema,
  classificationRejectionSchema,
} from '../../../shared/features/classification/batch-schemas.ts'
import type {
  ClassificationBatchSnapshot,
  ClassificationRejection,
  ClassificationReviewRow,
  ClassificationSubject,
} from '../../../shared/features/classification/batch-schemas.ts'

type Target = ClassificationBatchSnapshot['targets'][number]
type Proposal = Target['proposals'][number]
type Evidence = Proposal['evidence'][number]

const sample: ClassificationSubject = {
  kind: 'sample',
  identity: { kind: 'catalog', id: '10000000-0000-4000-8000-000000000001' },
}
const pack: ClassificationSubject = {
  kind: 'pack',
  identity: { kind: 'catalog', id: '20000000-0000-4000-8000-000000000001' },
}

function pathEvidence(
  overrides: Partial<Extract<Evidence, { kind: 'path' }>> = {},
): Extract<Evidence, { kind: 'path' }> {
  return {
    kind: 'path',
    occurrence: 'location:folder',
    component: 'folder',
    availability: 'cataloged',
    text: 'Kick',
    clue: 'kick',
    term: 'Kick',
    rule: 'name',
    ruleVersion: 'path-v2',
    span: [0, 1],
    ...overrides,
  }
}

function instrument(
  key = 'instrument:kick',
  evidence: Evidence[] = [pathEvidence()],
): Proposal {
  return {
    target: { dimension: 'instrument', key, name: 'Kick', entityId: null },
    evidence,
    dependencies: [],
  }
}

function genre(
  evidence: Evidence[],
  dependencies: Proposal['dependencies'] = [],
): Proposal {
  return {
    target: {
      dimension: 'genre',
      key: 'genre:house',
      name: 'House',
      entityId: '30000000-0000-4000-8000-000000000001',
    },
    evidence,
    dependencies,
  }
}

function target(proposals = [instrument()], subject = sample): Target {
  return {
    subject: structuredClone(subject),
    stateToken: 'a'.repeat(64),
    currentType: null,
    assignments: [],
    proposals,
    ambiguities: [],
  }
}

function snapshot(targets = [target()]): ClassificationBatchSnapshot {
  return { contractVersion: 1, targets }
}

function rows(review: ClassificationBatchReview): ClassificationReviewRow[] {
  return review.listProposals(review.getReference()).items
}

function rejection(
  proposal = instrument(),
  subject = sample,
): ClassificationRejection {
  return {
    contractVersion: 1,
    subject: structuredClone(subject),
    target: { dimension: proposal.target.dimension, key: proposal.target.key },
    evidenceKeys: proposal.evidence.map(classificationEvidenceKey),
  }
}

test('version-1 evidence serialization retains fixed compatibility vectors', () => {
  assert.equal(
    classificationEvidenceKey(pathEvidence()),
    '64c8b3827f07cabb8d0b47aa96da008353109086075d1b9e81317d6ce07e2a8a',
  )
  assert.equal(
    classificationEvidenceKey(
      pathEvidence({ clue: 'VintageHiHat R&B Cafe\u0301808' }),
    ),
    '311f0c0a6f883266742ab12f0024f3c4880de7ad4c63a8e0f7867e134fb6e430',
  )
  assert.equal(
    classificationEvidenceKey({
      kind: 'pack-genre',
      packId: '20000000-0000-4000-8000-000000000001',
      genreKey: 'genre:house',
    }),
    '386e309f5eaef33544b324c6d27da5295efd34707293ec2de8414db4b0f07630',
  )
})

test('rejection memory does not cross subjects or dimensions and does not suppress new clues', () => {
  const review = new ClassificationBatchReview(
    snapshot([
      target([genre([pathEvidence()])]),
      target([instrument()], {
        kind: 'sample',
        identity: { kind: 'import', preparationId: 'p1', id: 'new' },
      }),
    ]),
    [rejection()],
  )
  assert.equal(review.getSummary().remembered, 0)
  const changedClue = instrument('instrument:kick', [
    pathEvidence({ clue: 'kicks' }),
  ])
  review.refresh(snapshot([target([changedClue])]))
  assert.equal(rows(review)[0].remembered, false)
  const repeat = instrument('instrument:kick', [pathEvidence(), pathEvidence()])
  review.refresh(snapshot([target([repeat])]))
  assert.equal(rows(review)[0].remembered, true)
  assert.equal(rows(review)[0].evidenceKeys.length, 1)
})

test('review stages assignments and rejection intents without mutating supplied data', () => {
  const input = snapshot()
  const before = structuredClone(input)
  const review = new ClassificationBatchReview(input)
  assert.equal(review.getSummary().requiredCreations, 1)
  assert.equal(review.getSummary().accepted, 0)
  assert.deepEqual(review.exportDraft(review.getReference()).rejectionChanges, {
    remember: [],
    forget: [],
  })
  review.stage({
    ...review.getReference(),
    choices: [{ proposalKey: rows(review)[0].proposalKey, decision: 'accept' }],
  })
  const draft = review.exportDraft(review.getReference())
  assert.equal(draft.decisions[0].target.key, 'instrument:kick')
  assert.equal(draft.decisions[0].decision, 'accept')
  assert.equal(draft.rejectionChanges.remember.length, 0)
  assert.equal(draft.rejectionChanges.forget.length, 1)
  assert.deepEqual(input, before)
  assert.deepEqual(JSON.parse(JSON.stringify(draft)), draft)
  assert.deepEqual(
    classificationBatchDraftSchema.parse(JSON.parse(JSON.stringify(draft))),
    draft,
  )
})

test('path evidence keys normalize spelling but preserve occurrence and clue identity', () => {
  const first = pathEvidence({ clue: 'Hi-Hat' })
  const equivalent = pathEvidence({
    clue: 'HI_HAT',
    text: 'HI_HAT',
    term: 'Hats',
    rule: 'alias',
    availability: 'observed',
    component: 'root',
    span: [3, 5],
  })
  assert.equal(
    classificationEvidenceKey(first),
    classificationEvidenceKey(equivalent),
  )
  assert.equal(
    classificationEvidenceKey(pathEvidence({ clue: 'Cafe\u0301' })),
    classificationEvidenceKey(pathEvidence({ clue: 'Café' })),
  )
  assert.notEqual(
    classificationEvidenceKey(first),
    classificationEvidenceKey(
      pathEvidence({ clue: 'Hi-Hat', occurrence: 'location:another' }),
    ),
  )
  assert.notEqual(
    classificationEvidenceKey(first),
    classificationEvidenceKey(pathEvidence()),
  )
})

test('Pack evidence is stable across presentation edits and separates import preparations', () => {
  const imported = {
    kind: 'pack',
    identity: { kind: 'import', preparationId: 'p1', id: 'root1' },
  }
  const id = classificationPackEvidenceId(imported)
  assert.notEqual(
    id,
    classificationPackEvidenceId({
      ...imported,
      identity: { ...imported.identity, preparationId: 'p2' },
    }),
  )
  assert.notEqual(id, classificationPackEvidenceId(pack))
  const evidence = { kind: 'pack-genre', packId: id, genreKey: 'genre:house' }
  assert.match(classificationEvidenceKey(evidence), /^[a-f0-9]{64}$/u)
  assert.notEqual(
    classificationEvidenceKey(evidence),
    classificationEvidenceKey({
      ...evidence,
      genreKey: 'genre:techno',
    }),
  )
  assert.throws(() => classificationPackEvidenceId(sample), {
    code: 'INVALID_INPUT',
  })
  const longestId = classificationPackEvidenceId({
    kind: 'pack',
    identity: {
      kind: 'import',
      preparationId: '\u0000'.repeat(256),
      id: '\u0000'.repeat(256),
    },
  })
  assert.match(
    classificationEvidenceKey({
      kind: 'pack-genre',
      packId: longestId,
      genreKey: 'genre:house',
    }),
    /^[a-f0-9]{64}$/u,
  )
})

test('rejections survive alias/provenance edits and classification renames, not new evidence', () => {
  const memory = [rejection()]
  const proposal = instrument('instrument:kick', [
    pathEvidence({
      clue: 'KICK',
      term: 'KICK',
      rule: 'alias',
      text: 'KICK',
    }),
  ])
  if (proposal.target.dimension !== 'sample-type') {
    proposal.target.name = 'Renamed Kick'
  }
  const review = new ClassificationBatchReview(
    snapshot([target([proposal])]),
    memory,
  )
  assert.equal(rows(review)[0].remembered, true)
  assert.equal(rows(review)[0].reviewable, false)
  assert.throws(
    () =>
      review.stage({
        ...review.getReference(),
        choices: [
          { proposalKey: rows(review)[0].proposalKey, decision: 'accept' },
        ],
      }),
    { code: 'INVALID_INPUT' },
  )
  proposal.evidence.push(pathEvidence({ occurrence: 'location:new-folder' }))
  review.refresh(snapshot([target([proposal])]))
  assert.equal(rows(review)[0].remembered, false)
  assert.equal(rows(review)[0].reviewable, true)
  assert.deepEqual(memory, [rejection()])
})

test('changed or malformed rejection inputs never retain stale decisions or partially refresh a draft', () => {
  const review = new ClassificationBatchReview(snapshot())
  review.acceptAll(review.getReference())
  const reference = review.getReference()
  for (const memory of [
    [{ ...rejection(), evidenceKeys: ['not-a-digest'] }],
    [{ ...rejection(), contractVersion: 2 }],
    [{ ...rejection(), target: { dimension: 'sample-type', key: 'unknown' } }],
    Array.from({ length: 11 }, () => ({
      ...rejection(),
      evidenceKeys: Array.from({ length: 1000 }, () => 'f'.repeat(64)),
    })),
  ]) {
    assert.throws(() => review.refresh(snapshot(), memory), {
      code: 'INVALID_INPUT',
    })
    assert.deepEqual(review.getReference(), reference)
    assert.equal(review.getSummary().accepted, 1)
  }
  const refreshed = review.refresh(snapshot(), [rejection()])
  assert.equal(refreshed.invalidated, 1)
  assert.equal(refreshed.accepted, 0)
  assert.equal(rows(review)[0].remembered, true)
})

test('rejecting Drums does not hide Drum Breaks from the same phrase', () => {
  const recognize = createClassificationRecognizer(initialRecognitionVocabulary)
  const result = recognize({
    kind: 'sample',
    components: [
      {
        occurrence: 'location:breaks',
        text: 'Drum Breaks',
        kind: 'folder',
        distance: 1,
        availability: 'cataloged',
      },
    ],
  })
  const proposals: Proposal[] = result.proposals.map((proposal) => ({
    target: {
      dimension: 'instrument',
      key: proposal.target.key,
      name: 'Drum Breaks',
      entityId: null,
    },
    evidence: proposal.evidence.map((evidence): Evidence =>
      evidence.kind === 'path'
        ? { ...evidence, span: [evidence.span[0], evidence.span[1]] }
        : evidence,
    ),
    dependencies: [],
  }))
  assert.equal(proposals.length, 2)
  const drums = proposals.find(
    (proposal) => proposal.target.key === 'instrument:drums',
  )
  assert.ok(drums)
  const review = new ClassificationBatchReview(snapshot([target(proposals)]), [
    rejection(drums),
  ])
  assert.equal(
    rows(review).find((row) => row.target.key === 'instrument:drums')
      ?.remembered,
    true,
  )
  assert.equal(
    rows(review).find((row) => row.target.key === 'instrument:drum-breaks')
      ?.remembered,
    false,
  )
  const reassigned = instrument('instrument:custom', drums.evidence)
  review.refresh(snapshot([target([reassigned])]))
  assert.equal(rows(review)[0].remembered, false)
})

test('explicit acceptance of remembered suggestions forgets only that classification scope', () => {
  const memory = [rejection()]
  const review = new ClassificationBatchReview(snapshot(), memory, true)
  assert.equal(rows(review)[0].remembered, true)
  assert.equal(rows(review)[0].reviewable, true)
  review.acceptAll(review.getReference())
  const draft = review.exportDraft(review.getReference())
  assert.deepEqual(draft.rejectionChanges.forget, [
    { subject: sample, target: rejection().target },
  ])
  assert.equal(draft.rejectionChanges.remember.length, 0)
  assert.deepEqual(memory, [rejection()])
  review.discard()
  assert.deepEqual(memory, [rejection()])
})

test('reject, unreviewed and discard never mutate rejection memory', () => {
  const review = new ClassificationBatchReview(snapshot())
  const key = rows(review)[0].proposalKey
  review.stage({
    ...review.getReference(),
    choices: [{ proposalKey: key, decision: 'reject' }],
  })
  const draft = review.exportDraft(review.getReference())
  assert.deepEqual(draft.rejectionChanges.remember, [rejection()])
  assert.equal(
    classificationRejectionSchema.safeParse(draft.rejectionChanges.remember[0])
      .success,
    true,
  )
  review.stage({
    ...review.getReference(),
    choices: [{ proposalKey: key, decision: 'unreviewed' }],
  })
  assert.deepEqual(review.exportDraft(review.getReference()).decisions, [])
  review.discard()
  review.discard()
  assert.throws(() => review.getSummary(), { code: 'NOT_FOUND' })
})

test('invalid group choices reject atomically and stale or foreign references cannot mutate review', () => {
  const review = new ClassificationBatchReview(snapshot())
  const initial = review.getReference()
  const choice = {
    proposalKey: rows(review)[0].proposalKey,
    decision: 'accept',
  }
  for (const choices of [
    [choice, choice],
    [choice, { ...choice, proposalKey: 'f'.repeat(64) }],
    [],
    Array.from({ length: 101 }, () => choice),
  ]) {
    assert.throws(() => review.stage({ ...initial, choices }), {
      code: 'INVALID_INPUT',
    })
    assert.deepEqual(review.getReference(), initial)
    assert.equal(review.getSummary().accepted, 0)
  }
  const foreign = new ClassificationBatchReview(snapshot()).getReference()
  assert.throws(() => review.acceptAll(foreign), { code: 'STALE_REVIEW' })
  review.stage({ ...initial, choices: [choice] })
  assert.throws(() => review.stage({ ...initial, choices: [choice] }), {
    code: 'STALE_REVIEW',
  })
  assert.throws(() => review.listProposals(initial), { code: 'STALE_REVIEW' })
  assert.throws(() => review.exportDraft(initial), { code: 'STALE_REVIEW' })
})

test('Accept all covers unloaded pages and reports required creation and type replacements', () => {
  const proposals = Array.from({ length: 103 }, (_, index) =>
    instrument(`instrument:custom-${index}`),
  )
  proposals.push({
    target: { dimension: 'sample-type', key: 'one-shot' },
    evidence: [pathEvidence()],
    dependencies: [],
  })
  const item = target(proposals)
  item.currentType = 'loop'
  const review = new ClassificationBatchReview(snapshot([item]))
  const summary = review.getSummary()
  assert.equal(summary.requiredCreations, 103)
  assert.equal(summary.typeReplacements, 1)
  const first = review.listProposals(review.getReference())
  assert.equal(first.items.length, 50)
  assert.equal(first.nextOffset, 50)
  assert.equal(first.total, 104)
  assert.equal(
    review.listProposals({ ...review.getReference(), offset: 100 }).items
      .length,
    4,
  )
  assert.throws(
    () => review.listProposals({ ...review.getReference(), limit: 101 }),
    { code: 'INVALID_INPUT' },
  )
  review.acceptAll(review.getReference())
  assert.equal(review.getSummary().accepted, 104)
  assert.equal(
    review
      .exportDraft(review.getReference())
      .decisions.filter((row) => row.replacesType).length,
    1,
  )
})

test('existing assignments are preserved and excluded from staged decisions', () => {
  const item = target([
    instrument(),
    {
      target: { dimension: 'sample-type', key: 'loop' },
      evidence: [pathEvidence()],
      dependencies: [],
    },
  ])
  item.currentType = 'loop'
  item.assignments = [{ dimension: 'instrument', key: 'instrument:kick' }]
  const review = new ClassificationBatchReview(snapshot([item]))
  assert.equal(review.getSummary().reviewable, 0)
  review.acceptAll(review.getReference())
  assert.deepEqual(review.exportDraft(review.getReference()).decisions, [])
  assert.ok(rows(review).every((row) => row.assigned))
})

test('refresh preserves unaffected decisions but invalidates changed relevant inputs and removed targets', () => {
  const one = target()
  const two = target([instrument()], {
    ...sample,
    identity: { kind: 'import', preparationId: 'p1', id: 'candidate2' },
  })
  const review = new ClassificationBatchReview(snapshot([one, two]))
  review.acceptAll(review.getReference())
  const stale = review.getReference()
  one.stateToken = 'b'.repeat(64)
  const refreshed = review.refresh(snapshot([two, one]))
  assert.equal(refreshed.invalidated, 1)
  assert.equal(refreshed.accepted, 1)
  assert.throws(() => review.exportDraft(stale), { code: 'STALE_REVIEW' })
  assert.equal(review.refresh(snapshot([one])).invalidated, 1)
  assert.equal(review.getSummary().accepted, 0)
})

test('refresh rejects retargeted, recreated and changed-evidence acceptances instead of reinterpreting them', () => {
  for (const change of [
    (proposal: Proposal) => {
      proposal.target.key = 'instrument:another'
    },
    (proposal: Proposal) => {
      if (proposal.target.dimension !== 'sample-type') {
        proposal.target.entityId = '40000000-0000-4000-8000-000000000001'
      }
    },
    (proposal: Proposal) => {
      proposal.evidence.push(pathEvidence({ occurrence: 'new-clue' }))
    },
    (proposal: Proposal) => {
      if (proposal.evidence[0].kind === 'path') {
        proposal.evidence[0].rule = 'alias'
      }
    },
  ]) {
    const input = snapshot()
    const review = new ClassificationBatchReview(input)
    review.acceptAll(review.getReference())
    change(input.targets[0].proposals[0])
    assert.equal(review.refresh(input).invalidated, 1)
    assert.equal(review.getSummary().accepted, 0)
  }
})

test('reordering equivalent inputs keeps decisions while all returned values are detached', () => {
  const first = instrument('instrument:kick', [
    pathEvidence(),
    pathEvidence({ occurrence: 'second' }),
  ])
  const input = snapshot([target([first, instrument('instrument:other')])])
  const review = new ClassificationBatchReview(input)
  review.acceptAll(review.getReference())
  input.targets[0].proposals.reverse()
  first.evidence.reverse()
  assert.equal(review.refresh(input).accepted, 2)
  const page = rows(review)
  page[0].target.key = 'forged'
  page[0].subject.identity.id = 'forged'
  page[0].evidence.length = 0
  const draft = review.exportDraft(review.getReference())
  draft.decisions.length = 0
  assert.equal(rows(review).length, 2)
  assert.ok(
    rows(review).every(
      (row) => row.evidence.length > 0 && row.target.key !== 'forged',
    ),
  )
})

function dependentSnapshot(): ClassificationBatchSnapshot {
  const packProposal = genre([
    pathEvidence({ component: 'root', clue: 'house', text: 'House' }),
  ])
  const sampleProposal = genre(
    [
      {
        kind: 'pack-genre',
        packId: classificationPackEvidenceId(pack),
        genreKey: 'genre:house',
      },
    ],
    [{ subject: pack, genreKey: 'genre:house' }],
  )
  return snapshot([target([sampleProposal]), target([packProposal], pack)])
}

test('dependent Samples require staged Pack Genre acceptance and export Packs first', () => {
  const review = new ClassificationBatchReview(dependentSnapshot())
  const sampleRow = rows(review).find((row) => row.subject.kind === 'sample')
  assert.ok(sampleRow)
  review.stage({
    ...review.getReference(),
    choices: [{ proposalKey: sampleRow.proposalKey, decision: 'accept' }],
  })
  let draft = review.exportDraft(review.getReference())
  assert.equal(draft.dependenciesSatisfied, false)
  assert.equal(draft.dependencyBlocks.length, 1)
  review.acceptAll(review.getReference())
  draft = review.exportDraft(review.getReference())
  assert.equal(draft.dependenciesSatisfied, true)
  assert.deepEqual(
    draft.decisions.map((row) => row.subject.kind),
    ['pack', 'sample'],
  )
  const packRow = rows(review).find((row) => row.subject.kind === 'pack')
  assert.ok(packRow)
  review.stage({
    ...review.getReference(),
    choices: [{ proposalKey: packRow.proposalKey, decision: 'reject' }],
  })
  assert.equal(
    review.exportDraft(review.getReference()).dependenciesSatisfied,
    false,
  )
})

test('changed Pack evidence invalidates dependent Sample decisions but not unrelated targets', () => {
  const input = dependentSnapshot()
  input.targets.push(
    target([instrument()], {
      kind: 'sample',
      identity: { kind: 'catalog', id: '10000000-0000-4000-8000-000000000003' },
    }),
  )
  const review = new ClassificationBatchReview(input)
  review.acceptAll(review.getReference())
  const packTarget = input.targets.find((item) => item.subject.kind === 'pack')
  assert.ok(packTarget)
  packTarget.stateToken = 'c'.repeat(64)
  const result = review.refresh(input)
  assert.equal(result.invalidated, 2)
  assert.equal(result.accepted, 1)
})

test('staged Pack evidence requires explicit matching dependency, while assigned Genres do not', () => {
  const input = dependentSnapshot()
  const sampleTarget = input.targets.find(
    (item) => item.subject.kind === 'sample',
  )
  const packTarget = input.targets.find((item) => item.subject.kind === 'pack')
  assert.ok(sampleTarget)
  assert.ok(packTarget)
  sampleTarget.proposals[0].dependencies = []
  assert.throws(() => new ClassificationBatchReview(input), {
    code: 'INVALID_INPUT',
  })
  packTarget.assignments.push({ dimension: 'genre', key: 'genre:house' })
  const review = new ClassificationBatchReview(input)
  review.acceptAll(review.getReference())
  assert.equal(
    review.exportDraft(review.getReference()).dependenciesSatisfied,
    true,
  )
  assert.equal(review.getSummary().accepted, 1)
})

test('import-local Pack and Sample evidence stays bound to its single preparation', () => {
  const packSubject: ClassificationSubject = {
    kind: 'pack',
    identity: { kind: 'import', preparationId: 'p1', id: 'root1' },
  }
  const sampleSubject: ClassificationSubject = {
    kind: 'sample',
    identity: { kind: 'import', preparationId: 'p1', id: 'candidate1' },
  }
  const input = snapshot([
    target([genre([pathEvidence({ component: 'root' })])], packSubject),
    target(
      [
        genre(
          [
            {
              kind: 'pack-genre',
              packId: classificationPackEvidenceId(packSubject),
              genreKey: 'genre:house',
            },
          ],
          [{ subject: packSubject, genreKey: 'genre:house' }],
        ),
      ],
      sampleSubject,
    ),
  ])
  const review = new ClassificationBatchReview(input)
  review.acceptAll(review.getReference())
  const exported = review.exportDraft(review.getReference())
  assert.equal(exported.dependenciesSatisfied, true)
  assert.ok(
    exported.decisions.every((row) => row.subject.identity.kind === 'import'),
  )
  const sampleTarget = input.targets[1]
  sampleTarget.proposals[0].dependencies = []
  assert.throws(() => review.refresh(snapshot([sampleTarget])), {
    code: 'INVALID_INPUT',
  })
  assert.equal(review.getSummary().accepted, 2)
  sampleTarget.subject.identity = {
    kind: 'import',
    preparationId: 'p2',
    id: 'candidate1',
  }
  assert.throws(() => review.refresh(input), { code: 'INVALID_INPUT' })
})

test('a bounded snapshot that exceeds the serialized-byte ceiling rejects explicitly', () => {
  const input = snapshot([
    target(
      Array.from({ length: 3 }, (_, index) =>
        instrument(
          `instrument:large-${index}`,
          Array.from({ length: 700 }, () =>
            pathEvidence({ text: 'x'.repeat(4096) }),
          ),
        ),
      ),
    ),
  ])
  assert.throws(() => new ClassificationBatchReview(input), {
    code: 'INVALID_INPUT',
  })
})

test('ambiguities remain explained and never become actionable proposals', () => {
  const item = target([])
  item.ambiguities = [
    {
      reason: 'contradictory-type',
      dimension: 'sample-type',
      targets: [
        { dimension: 'sample-type', key: 'loop' },
        { dimension: 'sample-type', key: 'one-shot' },
      ],
      evidence: [pathEvidence()],
    },
  ]
  const review = new ClassificationBatchReview(snapshot([item]))
  assert.equal(review.getSummary().ambiguities, 1)
  const page = review.listAmbiguities(review.getReference())
  assert.equal(page.items[0].reason, 'contradictory-type')
  page.items[0].targets.length = 0
  assert.equal(
    review.listAmbiguities(review.getReference()).items[0].targets.length,
    2,
  )
  review.acceptAll(review.getReference())
  assert.deepEqual(review.exportDraft(review.getReference()).decisions, [])
})

test('strict versioned schemas reject forged, malformed and unsupported fields', () => {
  for (const input of [
    { ...snapshot(), contractVersion: 2 },
    { ...snapshot(), cover: 'not-in-this-contract' },
    snapshot([
      target([instrument()], {
        kind: 'sample',
        identity: { kind: 'catalog', id: 'not-a-uuid' },
      }),
    ]),
    {
      ...snapshot(),
      targets: [
        {
          ...target(),
          proposals: [
            {
              ...instrument(),
              target: { dimension: 'sample-type', key: 'unknown' },
            },
          ],
        },
      ],
    },
    snapshot([target([{ ...instrument(), evidence: [] }])]),
    snapshot([
      target([{ ...instrument(), evidence: [pathEvidence({ span: [2, 1] })] }]),
    ]),
  ]) {
    assert.equal(
      classificationBatchSnapshotSchema.safeParse(input).success,
      false,
    )
    assert.throws(() => new ClassificationBatchReview(input), {
      code: 'INVALID_INPUT',
    })
  }
  const review = new ClassificationBatchReview(snapshot())
  assert.throws(
    () =>
      review.stage({ ...review.getReference(), choices: [], authorIds: [] }),
    { code: 'INVALID_INPUT' },
  )
})

test('snapshot consistency and resource ceilings fail explicitly without replacing a valid draft', () => {
  const review = new ClassificationBatchReview(snapshot())
  review.acceptAll(review.getReference())
  const reference = review.getReference()
  const invalidInputs = [
    snapshot([target(), target()]),
    snapshot([target([instrument(), instrument()])]),
    snapshot([target([instrument()], pack)]),
    snapshot([
      target(
        [
          {
            target: { dimension: 'sample-type', key: 'loop' },
            evidence: [pathEvidence()],
            dependencies: [],
          },
        ],
        pack,
      ),
    ]),
    snapshot([
      target([
        {
          ...instrument(),
          dependencies: [{ subject: pack, genreKey: 'genre:house' }],
        },
      ]),
    ]),
    snapshot([
      target([
        genre([{ kind: 'pack-genre', packId: 'p', genreKey: 'genre:other' }]),
      ]),
    ]),
    snapshot(
      Array.from({ length: 101 }, (_, index) =>
        target([], {
          kind: 'sample',
          identity: {
            kind: 'import',
            preparationId: 'p1',
            id: `candidate${index}`,
          },
        }),
      ),
    ),
    snapshot([
      target(
        Array.from({ length: 2001 }, (_, index) =>
          instrument(`instrument:${index}`),
        ),
      ),
    ]),
    snapshot([
      target(
        Array.from({ length: 11 }, (_, index) =>
          instrument(
            `instrument:${index}`,
            Array.from({ length: 1000 }, () => pathEvidence()),
          ),
        ),
      ),
    ]),
  ]
  for (const input of invalidInputs) {
    assert.throws(() => review.refresh(input), { code: 'INVALID_INPUT' })
    assert.deepEqual(review.getReference(), reference)
    assert.equal(review.getSummary().accepted, 1)
  }
})

test('explicit new-Pack Genres supply dependency-bound Sample proposals without fabricated Pack path proposals', () => {
  const packSubject: ClassificationSubject = {
    kind: 'pack',
    identity: { kind: 'import', preparationId: 'p1', id: 'root1' },
  }
  const packTarget = target([], packSubject)
  const selectedGenre = genre([
    {
      kind: 'pack-genre',
      packId: classificationPackEvidenceId(packSubject),
      genreKey: 'genre:house',
    },
  ])
  packTarget.draftAssignments = [selectedGenre.target]
  selectedGenre.dependencies = [
    { subject: packSubject, genreKey: 'genre:house' },
  ]
  const review = new ClassificationBatchReview(
    snapshot([packTarget, target([selectedGenre])]),
  )
  review.acceptAll(review.getReference())
  const draft = review.exportDraft(review.getReference())
  assert.equal(draft.dependenciesSatisfied, true)
  assert.equal(draft.decisions.length, 1)
  assert.equal(draft.decisions[0].subject.kind, 'sample')
  assert.deepEqual(draft.explicitAssignments, [
    { subject: packSubject, assignments: [selectedGenre.target] },
  ])
  assert.deepEqual(
    classificationBatchDraftSchema.parse(JSON.parse(JSON.stringify(draft))),
    draft,
  )
  packTarget.subject = pack
  assert.throws(() => new ClassificationBatchReview(snapshot([packTarget])), {
    code: 'INVALID_INPUT',
  })
})
