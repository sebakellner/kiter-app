import assert from 'node:assert/strict'
import { test } from 'node:test'
import { suggestPackAuthors } from './author-suggestions.ts'

const author = {
  kind: 'author' as const,
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Producer A',
}

test('known Authors match complete names in free titles without crediting automatically', () => {
  const suggestions = suggestPackAuthors('Vintage Producer A Drum Essentials', [
    author,
  ])
  assert.deepEqual(suggestions, [
    {
      kind: 'existing',
      author,
      evidence: {
        kind: 'root-name',
        text: 'Vintage Producer A Drum Essentials',
        matchedName: 'Producer A',
      },
    },
  ])
  assert.deepEqual(
    suggestPackAuthors('SuperProducer ABC Essentials', [author]),
    [],
  )
  assert.deepEqual(suggestPackAuthors('Unknown Producer Essentials', []), [])
})

test('explicit Author prefixes offer creation only with a valid distinct name', () => {
  assert.deepEqual(suggestPackAuthors('New Artist - Drum Essentials', []), [
    {
      kind: 'create',
      name: 'New Artist',
      evidence: {
        kind: 'root-prefix',
        text: 'New Artist - Drum Essentials',
        prefix: 'New Artist',
      },
    },
  ])
  assert.equal(suggestPackAuthors('New Artist — Pack', [])[0].kind, 'create')
  assert.deepEqual(suggestPackAuthors('Artist-Pack', []), [])
  assert.deepEqual(suggestPackAuthors(`${'x'.repeat(121)} - Pack`, []), [])
  assert.deepEqual(suggestPackAuthors('Bad\u0000Name - Pack', []), [])
})

test('homonyms remain separate existing offers and suppress redundant prefix creation', () => {
  const second = { ...author, id: '10000000-0000-4000-8000-000000000002' }
  const suggestions = suggestPackAuthors('PRODUCER_A - Drum Pack', [
    author,
    second,
  ])
  assert.equal(suggestions.length, 2)
  assert.ok(suggestions.every((suggestion) => suggestion.kind === 'existing'))
  assert.deepEqual(
    suggestions.map((suggestion) =>
      suggestion.kind === 'existing' ? suggestion.author.id : '',
    ),
    [author.id, second.id],
  )
  suggestions[0].evidence.text = 'changed'
  assert.equal(author.name, 'Producer A')
})
