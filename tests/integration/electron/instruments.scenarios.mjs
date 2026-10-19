import assert from 'node:assert/strict'

export async function verifyInstrumentsIpc({ execute }) {
  const call = (method, request) =>
    execute(
      `window.api.instruments.${method}(${JSON.stringify(request) ?? ''})`,
    )
  const failure = (result, code) => {
    assert.equal(result.ok, false)
    assert.deepEqual(Object.keys(result).sort(), ['error', 'ok'])
    assert.deepEqual(Object.keys(result.error).sort(), ['code', 'message'])
    assert.equal(result.error.code, code)
    assert.ok(result.error.message.length > 0)
  }

  assert.deepEqual(await call('list'), {
    ok: true,
    data: { items: [], total: 0, limit: 50, offset: 0 },
  })
  const created = await call('create', { name: ' Percusio\u0301n ' })
  assert.equal(created.ok, true)
  assert.match(created.data.id, /^[0-9a-f-]{36}$/)
  assert.deepEqual(created, {
    ok: true,
    data: { id: created.data.id, name: 'Percusión' },
  })
  const id = created.data.id
  const second = await call('create', { name: 'Bass' })
  assert.equal(second.ok, true)
  const literal = await call('create', { name: '100%_Hits' })
  assert.equal(literal.ok, true)

  assert.deepEqual(await call('list', { limit: 1, offset: 1 }), {
    ok: true,
    data: { items: [second.data], total: 3, limit: 1, offset: 1 },
  })
  assert.deepEqual(await call('list', { search: '%' }), {
    ok: true,
    data: { items: [literal.data], total: 1, limit: 50, offset: 0 },
  })
  failure(await call('create', { name: ' PERCUSIÓN ' }), 'NAME_CONFLICT')
  failure(await call('rename', { id, name: ' bass ' }), 'NAME_CONFLICT')
  failure(
    await call('rename', {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Missing',
    }),
    'NOT_FOUND',
  )
  for (const [method, request] of [
    ['list', null],
    ['list', { limit: 101 }],
    ['list', { offset: -1 }],
    ['list', { search: '\n' }],
    ['create', null],
    ['create', { name: ' ' }],
    ['create', { name: '\nDrums' }],
    ['create', { name: 'a'.repeat(121) }],
    ['rename', { id: 'invalid', name: 'Drums' }],
    ['rename', { id, name: '' }],
    ['readSample', { sampleId: '/arbitrary/path.wav' }],
    ['saveSample', { sampleId: id, token: 'invalid', instrumentIds: [] }],
    [
      'saveSample',
      { sampleId: id, token: 'a'.repeat(64), instrumentIds: [id, id] },
    ],
  ]) {
    failure(await call(method, request), 'INVALID_INPUT')
  }
  assert.deepEqual(await call('list', { search: ' PERCUSIO\u0301N ' }), {
    ok: true,
    data: { items: [created.data], total: 1, limit: 50, offset: 0 },
  })
  assert.deepEqual(await call('rename', { id, name: ' Drums ' }), {
    ok: true,
    data: { id, name: 'Drums' },
  })
  // Repeating the same rename preserves identity and does not create duplicates.
  assert.deepEqual(await call('rename', { id, name: 'Drums' }), {
    ok: true,
    data: { id, name: 'Drums' },
  })
  assert.deepEqual(await call('list'), {
    ok: true,
    data: {
      items: [literal.data, second.data, { id, name: 'Drums' }],
      total: 3,
      limit: 50,
      offset: 0,
    },
  })
}
