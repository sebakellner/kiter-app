import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import {
  createDiskDatabase,
  createMemoryDatabase,
} from '../../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../../tests/support/fixtures/source.ts'
import { importFolder } from '../sources/import.ts'
import type { ClassificationRejection } from '../../../../shared/features/classification/batch-schemas.ts'
import {
  applyClassificationRejections,
  readClassificationRejections,
} from './rejections.ts'
import { classificationRejections } from '../../schema/rejections.ts'

const evidence = (count: number, base = 'a'): string[] =>
  Array.from({ length: count }, (_, index) =>
    `${base}${String(index).padStart(2, '0')}`.padEnd(64, base),
  )

function catalogSubject(id: string): ClassificationRejection['subject'] {
  return { kind: 'sample', identity: { kind: 'catalog', id } }
}

function rejection(
  subject: ClassificationRejection['subject'],
  dimension: 'instrument' | 'genre' | 'sample-type',
  key: string,
  keys: string[],
): ClassificationRejection {
  return {
    contractVersion: 1,
    subject,
    target: { dimension, key },
    evidenceKeys: keys,
  }
}

test('empty memory reads return a stable token with no records', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('rejections-empty')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const subject = catalogSubject(sample.id)
  const first = readClassificationRejections(db, { subjects: [subject] })
  const second = readClassificationRejections(db, { subjects: [subject] })
  assert.deepEqual(first, { token: first.token, rejections: [] })
  assert.equal(first.token, second.token)
})

test('remembered rejections are scoped to subject, dimension and target', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('rejections-scope')
  const [sample, other] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
    makeDiscoveredAudioFile(root, 'snare.wav'),
  ])
  const subject = catalogSubject(sample.id)
  const drums = rejection(
    subject,
    'instrument',
    'instrument:drums',
    evidence(2),
  )
  const breaks = rejection(
    subject,
    'instrument',
    'instrument:drum-breaks',
    evidence(3, 'b'),
  )
  const house = rejection(subject, 'genre', 'genre:house', evidence(1, 'c'))
  assert.deepEqual(
    applyClassificationRejections(db, {
      remember: [drums, breaks, house],
      forget: [],
    }),
    { applied: 3, forgotten: 0 },
  )
  const memory = readClassificationRejections(db, { subjects: [subject] })
  assert.deepEqual(memory.rejections, [house, breaks, drums])
  assert.equal(
    readClassificationRejections(db, { subjects: [catalogSubject(other.id)] })
      .rejections.length,
    0,
  )
  assert.equal(
    readClassificationRejections(db, {
      subjects: [
        { kind: 'pack', identity: { kind: 'catalog', id: sample.id } },
      ],
    }).rejections.length,
    0,
  )
})

test('remembering the same scope replaces its evidence set', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('rejections-upsert')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const subject = catalogSubject(sample.id)
  applyClassificationRejections(db, {
    remember: [
      rejection(subject, 'instrument', 'instrument:drums', evidence(2)),
    ],
    forget: [],
  })
  const updated = rejection(
    subject,
    'instrument',
    'instrument:drums',
    evidence(4, 'd'),
  )
  const result = applyClassificationRejections(db, {
    remember: [updated],
    forget: [],
  })
  assert.deepEqual(result, { applied: 1, forgotten: 0 })
  const memory = readClassificationRejections(db, { subjects: [subject] })
  assert.deepEqual(memory.rejections, [updated])
})

test('forget removes only the matching scope and reports actual changes', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('rejections-forget')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const subject = catalogSubject(sample.id)
  applyClassificationRejections(db, {
    remember: [
      rejection(subject, 'instrument', 'instrument:drums', evidence(1)),
      rejection(subject, 'genre', 'genre:house', evidence(1)),
    ],
    forget: [],
  })
  const result = applyClassificationRejections(db, {
    remember: [],
    forget: [
      { subject, target: { dimension: 'instrument', key: 'instrument:drums' } },
      { subject, target: { dimension: 'instrument', key: 'instrument:never' } },
    ],
  })
  assert.deepEqual(result, { applied: 0, forgotten: 1 })
  const memory = readClassificationRejections(db, { subjects: [subject] })
  assert.deepEqual(memory.rejections.length, 1)
  assert.equal(memory.rejections[0]?.target.dimension, 'genre')
})

test('import-local subjects store and read independently of catalog ids', (t) => {
  const { db } = createMemoryDatabase(t)
  const importSubject: ClassificationRejection['subject'] = {
    kind: 'sample',
    identity: { kind: 'import', preparationId: 'prep-a', id: 'cand-1' },
  }
  const record = rejection(
    importSubject,
    'genre',
    'genre:tech-house',
    evidence(1),
  )
  applyClassificationRejections(db, { remember: [record], forget: [] })
  const memory = readClassificationRejections(db, {
    subjects: [importSubject],
  })
  assert.deepEqual(memory.rejections, [record])
})

test('memory survives reopen and token changes after writes', async (t) => {
  const disk = await createDiskDatabase(t)
  const root = path.resolve('rejections-persist')
  let db = disk.connection.db
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const subject = catalogSubject(sample.id)
  const before = readClassificationRejections(db, { subjects: [subject] })
  applyClassificationRejections(db, {
    remember: [
      rejection(subject, 'instrument', 'instrument:kick', evidence(1)),
    ],
    forget: [],
  })
  db = disk.reopen().db
  const after = readClassificationRejections(db, { subjects: [subject] })
  assert.equal(after.rejections.length, 1)
  assert.equal(after.rejections[0]?.target.key, 'instrument:kick')
  assert.notEqual(after.token, before.token)
  assert.equal(
    readClassificationRejections(db, { subjects: [subject] }).token,
    after.token,
  )
})

test('corrupted stored records fail explicitly', (t) => {
  const { db, native } = createMemoryDatabase(t)
  const root = path.resolve('rejections-corrupt')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const subject = catalogSubject(sample.id)
  applyClassificationRejections(db, {
    remember: [
      rejection(subject, 'instrument', 'instrument:kick', evidence(1)),
    ],
    forget: [],
  })
  native.exec(
    "UPDATE classification_rejections SET record = 'garbage' WHERE target_key = 'instrument:kick'",
  )
  assert.throws(
    () => readClassificationRejections(db, { subjects: [subject] }),
    { code: 'INVALID_INPUT' },
  )
})

test('total evidence keys across records respect the safety limit', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('rejections-evidence-limit')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const subject = catalogSubject(sample.id)
  // 11 records x 1000 keys exceeds the 10,000 total evidence ceiling.
  const records = Array.from({ length: 11 }, (_, index) =>
    rejection(
      subject,
      'instrument',
      `instrument:key-${index}`,
      evidence(1000, 'f'),
    ),
  )
  applyClassificationRejections(db, { remember: records, forget: [] })
  assert.throws(
    () => readClassificationRejections(db, { subjects: [subject] }),
    { code: 'INVALID_INPUT' },
  )
  assert.equal(db.select().from(classificationRejections).all().length, 11)
})

test('invalid inputs reject without touching stored memory', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('rejections-invalid')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const subject = catalogSubject(sample.id)
  applyClassificationRejections(db, {
    remember: [
      rejection(subject, 'instrument', 'instrument:drums', evidence(1)),
    ],
    forget: [],
  })
  const snapshot = readClassificationRejections(db, { subjects: [subject] })
  assert.throws(() => readClassificationRejections(db, { subjects: [] }), {
    code: 'INVALID_INPUT',
  })
  assert.throws(
    () => applyClassificationRejections(db, { remember: [], forget: [] }),
    { code: 'INVALID_INPUT' },
  )
  assert.throws(
    () =>
      applyClassificationRejections(db, {
        remember: [
          rejection(subject, 'instrument', 'instrument:drums', evidence(1001)),
        ],
        forget: [],
      }),
    { code: 'INVALID_INPUT' },
  )
  assert.throws(
    () =>
      applyClassificationRejections(db, {
        remember: [
          {
            contractVersion: 1,
            subject,
            target: { dimension: 'instrument', key: 'instrument:drums' },
            evidenceKeys: ['not-a-token'],
          },
        ],
        forget: [],
      }),
    { code: 'INVALID_INPUT' },
  )
  assert.throws(
    () =>
      applyClassificationRejections(db, {
        remember: [],
        forget: [
          // Unknown fields must not be silently stripped.
          {
            subject,
            target: { dimension: 'instrument', key: 'instrument:drums' },
            extra: true,
          },
        ],
      }),
    { code: 'INVALID_INPUT' },
  )
  assert.deepEqual(
    readClassificationRejections(db, { subjects: [subject] }),
    snapshot,
  )
})
