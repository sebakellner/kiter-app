import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createClassificationRecognizer,
  initialRecognitionVocabulary,
} from './index.ts'
import type {
  RecognitionComponent,
  RecognitionEntry,
  RecognitionResult,
} from './index.ts'

const recognize = createClassificationRecognizer(initialRecognitionVocabulary)

function component(
  text: string,
  kind: RecognitionComponent['kind'] = 'filename',
  distance = 0,
): RecognitionComponent {
  return {
    text,
    kind,
    distance,
    occurrence: `${kind}:${text}`,
    availability: 'observed',
  }
}

function keys(result: RecognitionResult): string[] {
  return result.proposals.map(({ target }) => target.key).sort()
}

test('recognizes scoped path components with exact evidence and no implied classifications', () => {
  const result = recognize({
    kind: 'sample',
    components: [
      component('Tech House', 'root', 3),
      component('Drums', 'folder', 2),
      component('Kicks', 'folder', 1),
      component('kick_01.wav'),
    ],
  })
  assert.deepEqual(keys(result), [
    'category:drums',
    'category:kick',
    'genre:tech-house',
  ])
  assert.deepEqual(result.ambiguities, [])
  assert.deepEqual(
    result.proposals.find(({ target }) => target.key === 'category:kick')
      ?.evidence,
    [
      {
        kind: 'path',
        occurrence: 'folder:Kicks',
        component: 'folder',
        availability: 'observed',
        text: 'Kicks',
        clue: 'kicks',
        term: 'Kicks',
        rule: 'alias',
        ruleVersion: 'path-v1',
        span: [0, 1],
      },
      {
        kind: 'path',
        occurrence: 'filename:kick_01.wav',
        component: 'filename',
        availability: 'observed',
        text: 'kick_01.wav',
        clue: 'kick',
        term: 'Kick',
        rule: 'name',
        ruleVersion: 'path-v1',
        span: [0, 1],
      },
    ],
  )
  assert.deepEqual(
    keys(
      recognize({ kind: 'sample', components: [component('piano_808.wav')] }),
    ),
    ['category:808', 'category:piano'],
  )
})

test('initial vocabulary has stable distinct keys and the approved dimensions', () => {
  assert.equal(
    initialRecognitionVocabulary.filter(
      ({ target }) => target.dimension === 'category',
    ).length,
    25,
  )
  assert.equal(
    initialRecognitionVocabulary.filter(
      ({ target }) => target.dimension === 'genre',
    ).length,
    26,
  )
  assert.equal(
    initialRecognitionVocabulary.filter(
      ({ target }) => target.dimension === 'sample-type',
    ).length,
    2,
  )
  assert.equal(
    new Set(initialRecognitionVocabulary.map(({ target }) => target.key)).size,
    53,
  )
})

test('recognition preserves accents, symbols and letter-number boundaries while normalizing separators and NFC', () => {
  const custom: RecognitionEntry = {
    target: { dimension: 'category', key: 'custom' },
    name: 'Été',
    aliases: [],
  }
  const matcher = createClassificationRecognizer([
    ...initialRecognitionVocabulary,
    custom,
  ])
  const cases: [string, string[]][] = [
    ['TECH.house_BD.WAV', ['category:kick', 'genre:tech-house']],
    [
      'D&B_RnB_HipHop_UKG_vox.wav',
      [
        'category:vocals',
        'genre:drum-and-bass',
        'genre:hip-hop',
        'genre:r-and-b',
        'genre:uk-garage',
      ],
    ],
    ['kick01_snarecrow_housing.wav', []],
    ['E\u0301TE\u0301.wav', ['custom']],
    ['ete.wav', []],
    ['kick.wav', ['category:kick']],
    ['audio.kick', []],
    ['bass-drums.wav', ['category:kick']],
  ]
  for (const [text, expected] of cases) {
    assert.deepEqual(
      keys(matcher({ kind: 'sample', components: [component(text)] })),
      expected,
      text,
    )
  }
})

test('phrases never cross components and independent folder evidence is retained', () => {
  assert.deepEqual(
    keys(
      recognize({
        kind: 'sample',
        components: [
          component('Tech', 'root', 2),
          component('House', 'folder', 1),
          component('Snares'),
          component('kick_01.wav'),
        ],
      }),
    ),
    ['category:kick', 'category:snare', 'genre:house'],
  )
  assert.deepEqual(
    keys(
      recognize({
        kind: 'sample',
        components: [component('tech_house_house.wav')],
      }),
    ),
    ['genre:house', 'genre:tech-house'],
  )
})

test('conflicting identities and overlapping phrases omit ambiguous matches but preserve independent matches', () => {
  const entries: RecognitionEntry[] = [
    { target: { dimension: 'category', key: 'a' }, name: 'Lo-Fi', aliases: [] },
    { target: { dimension: 'category', key: 'b' }, name: 'Lo Fi', aliases: [] },
    {
      target: { dimension: 'category', key: 'c' },
      name: 'Red Blue',
      aliases: [],
    },
    {
      target: { dimension: 'category', key: 'd' },
      name: 'Blue Green',
      aliases: [],
    },
  ]
  const result = createClassificationRecognizer([
    ...initialRecognitionVocabulary,
    ...entries,
  ])({
    kind: 'sample',
    components: [component('lo_fi_red_blue_green_kick.wav')],
  })
  assert.deepEqual(keys(result), ['category:kick'])
  assert.deepEqual(
    result.ambiguities.map(({ reason, targets }) => ({
      reason,
      keys: targets.map(({ key }) => key),
    })),
    [
      { reason: 'conflicting-targets', keys: ['a', 'b'] },
      { reason: 'overlapping-phrases', keys: ['c', 'd'] },
    ],
  )
})

test('aliases are dimension-specific and effective vocabulary edits replace supplied terms', () => {
  const matcher = createClassificationRecognizer([
    {
      target: { dimension: 'category', key: 'renamed' },
      name: 'Thump',
      aliases: ['BD'],
    },
    { target: { dimension: 'genre', key: 'style' }, name: 'BD', aliases: [] },
  ])
  assert.deepEqual(
    keys(matcher({ kind: 'sample', components: [component('kick.wav')] })),
    [],
  )
  assert.deepEqual(
    keys(matcher({ kind: 'sample', components: [component('BD.wav')] })),
    ['renamed', 'style'],
  )
})

test('Pack recognition uses only roots; Sample evidence deduplicates overlapping roots and merges Pack Genres', () => {
  const root = component('House', 'root', 2)
  const result = recognize({
    kind: 'sample',
    components: [
      root,
      { ...root },
      { ...component('house.wav'), availability: 'cataloged' },
    ],
    packGenres: [
      { packId: 'pack-1', genreKey: 'genre:house' },
      { packId: 'pack-1', genreKey: 'genre:house' },
    ],
  })
  assert.deepEqual(keys(result), ['genre:house'])
  assert.equal(result.proposals[0].evidence.length, 3)
  assert.deepEqual(result.proposals[0].evidence[2], {
    kind: 'pack-genre',
    packId: 'pack-1',
    genreKey: 'genre:house',
  })
  assert.deepEqual(result.proposals[0].evidence[1], {
    kind: 'path',
    occurrence: 'filename:house.wav',
    component: 'filename',
    availability: 'cataloged',
    text: 'house.wav',
    clue: 'house',
    term: 'House',
    rule: 'name',
    ruleVersion: 'path-v1',
    span: [0, 1],
  })
  assert.deepEqual(
    keys(
      recognize({
        kind: 'pack',
        components: [
          root,
          component('Snare', 'folder', 1),
          component('kick_loop.wav'),
        ],
        packGenres: [{ packId: 'other', genreKey: 'genre:techno' }],
      }),
    ),
    ['genre:house'],
  )
})

test('Sample type prioritizes filename then nearest folder and never falls back from contradictions', () => {
  const cases: [RecognitionComponent[], string[], boolean][] = [
    [
      [component('Loops', 'root', 2), component('kick_one_shot.wav')],
      ['category:kick', 'one-shot'],
      false,
    ],
    [
      [
        component('Loops', 'root', 3),
        component('One Shots', 'folder', 1),
        component('kick.wav'),
      ],
      ['category:kick', 'one-shot'],
      false,
    ],
    [
      [
        component('One Shots', 'root', 3),
        component('Loops', 'folder', 1),
        component('Loop One Shot.wav'),
      ],
      [],
      true,
    ],
    [
      [
        component('Loops', 'folder', 1),
        component('One Shots', 'folder', 1),
        component('kick.wav'),
      ],
      ['category:kick'],
      true,
    ],
    [[component('OS_shot.wav')], [], false],
  ]
  for (const [components, expected, ambiguous] of cases) {
    const result = recognize({ kind: 'sample', components })
    assert.deepEqual(keys(result), expected)
    assert.equal(
      result.ambiguities.some(({ reason }) => reason === 'contradictory-type'),
      ambiguous,
    )
  }
})

test('results are deterministic and mutations cannot change compiled vocabulary or later results', () => {
  const entry: RecognitionEntry = {
    target: { dimension: 'category', key: 'kick' },
    name: 'Kick',
    aliases: [],
  }
  const matcher = createClassificationRecognizer([entry])
  const input = { kind: 'sample' as const, components: [component('kick.wav')] }
  const first = matcher(input)
  assert.deepEqual(matcher(input), first)
  entry.target.key = 'changed'
  first.proposals[0].target.key = 'changed-result'
  first.proposals[0].evidence.length = 0
  assert.deepEqual(keys(matcher(input)), ['kick'])
  assert.equal(matcher(input).proposals[0].evidence.length, 1)
})
