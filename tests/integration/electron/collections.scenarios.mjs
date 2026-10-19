import assert from 'node:assert/strict'

export async function verifyCollectionsIpc({ execute }) {
  const call = (method, request) =>
    execute(
      `window.api.collections.${method}(${JSON.stringify(request) ?? ''})`,
    )
  assert.deepEqual(await call('list'), {
    ok: true,
    data: { items: [], total: 0, limit: 50, offset: 0 },
  })
  const created = await call('create', {
    name: ' E\u0301lectro ',
    description: 'First line\nSecond line',
  })
  assert.equal(created.ok, true)
  assert.equal(created.data.name, 'Électro')
  assert.equal(created.data.coverAssetId, null)
  assert.equal(created.data.description, 'First line\nSecond line')
  assert.deepEqual(await call('get', { id: created.data.id }), {
    ok: true,
    data: { ...created.data, sampleCount: 0 },
  })
  const homonym = await call('create', { name: 'Électro' })
  assert.equal(homonym.ok, true)
  assert.notEqual(homonym.data.id, created.data.id)
  const first = await call('list', { limit: 1 })
  const second = await call('list', { limit: 1, offset: 1 })
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(first.data.total, 2)
  assert.equal(second.data.total, 2)
  assert.deepEqual(
    [first.data.items[0].id, second.data.items[0].id],
    [created.data.id, homonym.data.id].sort(),
  )
  for (const [method, request] of [
    ['create', null],
    ['create', { name: ' ' }],
    ['create', { name: 'Bad\nName' }],
    ['create', { name: 'Picks', description: '\u0000' }],
    ['list', { limit: 101 }],
    ['list', { offset: -1 }],
    ['get', { id: '/arbitrary/collection' }],
  ]) {
    const failure = await call(method, request)
    assert.equal(failure.ok, false)
    assert.equal(failure.error.code, 'INVALID_INPUT')
  }
  const missing = await call('get', {
    id: '00000000-0000-4000-8000-000000000001',
  })
  assert.equal(missing.ok, false)
  assert.equal(missing.error.code, 'NOT_FOUND')
  assert.equal((await call('list')).data.total, 2)
}
