import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'

import { applyPull } from '../../scripts/tokens-bridge/pull.mjs'
import { projectTokens } from '../../scripts/tokens-bridge/project.mjs'

const FOLDERS = ['primitives', 'semantic']

// A miniature repository. Every file owns exactly one top-level root key, the
// shape the pull uses to decide which file a token path belongs to.
const FIXTURE = {
  'tokens/primitives/color.json': {
    color: {
      $description: 'Raw palette from design.',
      white: {
        $value: {
          colorSpace: 'srgb',
          components: [1, 1, 1],
          hex: '#FFFFFF',
        },
        $type: 'color',
      },
      slate: {
        900: {
          $value: {
            colorSpace: 'srgb',
            components: [26 / 255, 26 / 255, 26 / 255],
            hex: '#1A1A1A',
          },
          $type: 'color',
          $description: 'Supplied #292D34 as step 900.',
        },
      },
    },
  },
  'tokens/primitives/space.json': {
    space: {
      $description: 'Layout spacing follows space.n = n * 4px.',
      4: { $value: { value: 16, unit: 'px' }, $type: 'dimension' },
    },
  },
  'tokens/semantic/color.json': {
    color: {
      action: {
        primary: {
          $value: '{color.white}',
          $type: 'color',
          $description: 'The only accent for primary actions.',
        },
      },
    },
  },
  'tokens/semantic/space.json': {
    space: {
      gutter: {
        $value: '{space.4}',
        $type: 'dimension',
        $description: 'Gap between panes.',
      },
    },
  },
}

function createFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'kiter-tokens-pull-'))
  for (const [relPath, data] of Object.entries(FIXTURE)) {
    const file = join(root, relPath)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
  }
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })
  return root
}

function listFiles(root) {
  return FOLDERS.flatMap((folder) => {
    const names = readdirSync(join(root, 'tokens', folder))
      .filter((name) => name.endsWith('.json'))
      .sort()
    return names.map((name) => `tokens/${folder}/${name}`)
  })
}

function snapshot(root) {
  const files = {}
  for (const relPath of listFiles(root)) {
    files[relPath] = readFileSync(join(root, relPath), 'utf8')
  }
  return files
}

function createBuildStub() {
  const calls = []
  return {
    calls,
    runBuild: (repoRoot) => {
      calls.push(repoRoot)
    },
  }
}

test('rewrites only the file that owns the changed leaf (S7)', async (t) => {
  const root = createFixture(t)
  const before = snapshot(root)
  const { calls, runBuild } = createBuildStub()
  const payload = projectTokens(root)
  payload.primitives.color.slate['900'].$value = '#000000'

  const { report, written } = await applyPull({
    repoRoot: root,
    payload,
    runBuild,
  })

  assert.deepEqual(written, ['tokens/primitives/color.json'])
  assert.deepEqual(calls, [root])
  assert.deepEqual(report.changed, [
    { path: 'color.slate.900', from: '#1A1A1A', to: '#000000' },
  ])
  assert.deepEqual(report.added, [])

  const after = snapshot(root)
  for (const relPath of Object.keys(before)) {
    if (relPath === 'tokens/primitives/color.json') {
      continue
    }
    assert.equal(after[relPath], before[relPath], `${relPath} is untouched`)
  }

  const text = after['tokens/primitives/color.json']
  assert.match(text, /"\$description": "Raw palette from design\."/)
  assert.match(text, /"\$description": "Supplied #292D34 as step 900\."/)

  const color = JSON.parse(text)
  assert.equal(color.color.$description, 'Raw palette from design.')
  assert.equal(
    color.color.slate['900'].$description,
    'Supplied #292D34 as step 900.',
  )
  assert.deepEqual(color.color.slate['900'].$value, {
    colorSpace: 'srgb',
    components: [0, 0, 0],
    hex: '#000000',
  })
  assert.deepEqual(
    color.color.white,
    FIXTURE['tokens/primitives/color.json'].color.white,
  )
})

test('writes nothing when the payload matches the repository (S8)', async (t) => {
  const root = createFixture(t)
  const before = snapshot(root)
  const { calls, runBuild } = createBuildStub()

  const { report, written } = await applyPull({
    repoRoot: root,
    payload: projectTokens(root),
    runBuild,
  })

  assert.deepEqual(written, [])
  assert.deepEqual(calls, [root])
  assert.deepEqual(report, { changed: [], added: [], untouched: 0 })
  assert.deepEqual(snapshot(root), before)
})

test('reports a payload root no file owns and creates no file', async (t) => {
  const root = createFixture(t)
  const before = snapshot(root)
  const { runBuild } = createBuildStub()
  const payload = projectTokens(root)
  payload.primitives.palette = {
    accent: { $type: 'color', $value: '#FFC800' },
  }

  const { report, written } = await applyPull({
    repoRoot: root,
    payload,
    runBuild,
  })

  assert.deepEqual(report.added, ['palette.accent'])
  assert.deepEqual(report.changed, [])
  assert.deepEqual(written, [])
  assert.deepEqual(listFiles(root), Object.keys(before))
  assert.deepEqual(snapshot(root), before)
})

test('keeps a token that the payload omits (S6)', async (t) => {
  const root = createFixture(t)
  const before = snapshot(root)
  const { runBuild } = createBuildStub()
  const payload = projectTokens(root)
  delete payload.primitives.space['4']
  delete payload.semantic.color.action.primary

  const { report, written } = await applyPull({
    repoRoot: root,
    payload,
    runBuild,
  })

  assert.deepEqual(written, [])
  assert.equal(report.untouched, 2)
  assert.deepEqual(report.added, [])
  assert.deepEqual(snapshot(root), before)
})

test('pulling twice in a row produces byte-identical files (S8)', async (t) => {
  const root = createFixture(t)
  const { runBuild } = createBuildStub()
  const payload = projectTokens(root)
  payload.primitives.color.slate['900'].$value = '#010101'
  payload.primitives.space['4'].$value = '24px'

  const first = await applyPull({ repoRoot: root, payload, runBuild })
  assert.deepEqual(first.written, [
    'tokens/primitives/color.json',
    'tokens/primitives/space.json',
  ])
  const afterFirst = snapshot(root)

  const second = await applyPull({ repoRoot: root, payload, runBuild })
  assert.deepEqual(second.written, [])
  assert.deepEqual(snapshot(root), afterFirst)
})
