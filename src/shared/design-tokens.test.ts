import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const PRIMITIVES = fileURLToPath(
  new URL('../../tokens/primitives/color.json', import.meta.url),
)
const SEMANTIC = fileURLToPath(
  new URL('../../tokens/semantic/color.json', import.meta.url),
)
const STYLESHEET = fileURLToPath(
  new URL('../styles/tokens.css', import.meta.url),
)

/**
 * Status roles own no value of their own: each one aliases the text step of a
 * dedicated primitive family, so design can move a family without touching the
 * semantic layer.
 */
const STATUS_PRIMITIVES = {
  error: 'red',
  warning: 'amber',
  info: 'blue',
  success: 'green',
} as const

type Tree = Record<string, unknown>
interface TokenLeaf {
  [key: string]: unknown
  $value: unknown
}

async function readTree(path: string): Promise<Tree> {
  return JSON.parse(await readFile(path, 'utf8')) as Tree
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLeaf(value: unknown): value is TokenLeaf {
  return isRecord(value) && '$value' in value
}

function asLeaf(value: unknown): TokenLeaf | undefined {
  return isLeaf(value) ? value : undefined
}

function lookup(tree: Tree, path: string): unknown {
  return path.split('.').reduce<unknown>((node, segment) => {
    return isRecord(node) ? node[segment] : undefined
  }, tree)
}

function token(tree: Tree, path: string): TokenLeaf {
  const leaf = asLeaf(lookup(tree, path))
  assert.ok(leaf, `${path} must exist as a token in the token tree`)
  return leaf
}

function group(tree: Tree, path: string): Record<string, unknown> {
  const node = lookup(tree, path)
  assert.ok(isRecord(node), `${path} must exist as a token group`)
  return node
}

/** Every token leaf under `node`, keyed by its dotted path. */
function collectTokens(node: unknown, prefix: string): Map<string, TokenLeaf> {
  const leaves = new Map<string, TokenLeaf>()
  if (!isRecord(node)) {
    return leaves
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) {
      continue
    }
    const path = prefix === '' ? key : `${prefix}.${key}`
    const leaf = asLeaf(child)
    if (leaf === undefined) {
      for (const [childPath, childLeaf] of collectTokens(child, path)) {
        leaves.set(childPath, childLeaf)
      }
    } else {
      leaves.set(path, leaf)
    }
  }
  return leaves
}

function hexOf(leaf: TokenLeaf): string {
  assert.ok(
    isRecord(leaf.$value) && typeof leaf.$value.hex === 'string',
    'a color token must carry a hex value',
  )
  return leaf.$value.hex.toLowerCase()
}

async function stylesheetToken(name: string): Promise<string | undefined> {
  const css = await readFile(STYLESHEET, 'utf8')
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css)
  return match?.[1]?.trim().toLowerCase()
}

test('every status role aliases its own primitive family', async () => {
  const primitives = await readTree(PRIMITIVES)
  const semantic = await readTree(SEMANTIC)

  for (const [role, family] of Object.entries(STATUS_PRIMITIVES)) {
    assert.equal(
      token(semantic, `color.status.${role}`).$value,
      `{color.${family}.400}`,
      `color.status.${role} must alias {color.${family}.400}`,
    )
    assert.equal(
      token(primitives, `color.${family}.400`).$type,
      'color',
      `color.${family}.400 must be a primitive color`,
    )
  }
})

test('border.error points at the solid step of the error family', async () => {
  const semantic = await readTree(SEMANTIC)

  assert.equal(token(semantic, 'color.border.error').$value, '{color.red.500}')
})

test('the retired danger and cyan tokens are gone', async () => {
  const primitives = await readTree(PRIMITIVES)
  const semantic = await readTree(SEMANTIC)
  const semanticLeaves = collectTokens(lookup(semantic, 'color'), 'color')

  assert.equal(
    semanticLeaves.has('color.status.danger'),
    false,
    'color.status.danger must be replaced by color.status.error',
  )
  assert.equal(
    semanticLeaves.has('color.border.danger'),
    false,
    'color.border.danger must be replaced by color.border.error',
  )
  assert.equal(group(primitives, 'color').cyan, undefined, 'cyan is retired')
})

test('neutral mirrors slate and still has no consumer', async () => {
  const primitives = await readTree(PRIMITIVES)
  const semantic = await readTree(SEMANTIC)
  const slate = group(primitives, 'color.slate')
  const neutral = group(primitives, 'color.neutral')
  const steps = Object.keys(slate).filter((key) => !key.startsWith('$'))

  assert.deepEqual(
    Object.keys(neutral).filter((key) => !key.startsWith('$')),
    steps,
    'neutral must expose exactly the slate steps',
  )
  for (const step of steps) {
    assert.deepEqual(
      token(primitives, `color.neutral.${step}`).$value,
      token(primitives, `color.slate.${step}`).$value,
      `color.neutral.${step} must mirror color.slate.${step}`,
    )
  }

  const consumers = [
    ...collectTokens(lookup(semantic, 'color'), 'color'),
  ].filter(([, leaf]) => String(leaf.$value).includes('{color.neutral.'))
  assert.deepEqual(
    consumers,
    [],
    'neutral is reserved: no semantic token uses it',
  )
})

test('every semantic color alias resolves to a declared primitive', async () => {
  const primitives = await readTree(PRIMITIVES)
  const semantic = await readTree(SEMANTIC)

  for (const [path, leaf] of collectTokens(
    lookup(semantic, 'color'),
    'color',
  )) {
    const target = /^\{([^{}]+)\}$/.exec(String(leaf.$value))
    // A literal semantic value is allowed; only an alias has to resolve.
    if (target === null) {
      continue
    }
    assert.ok(
      asLeaf(lookup(primitives, target[1])),
      `${path} aliases {${target[1]}}, which must be a declared color primitive`,
    )
  }
})

test('the generated stylesheet exposes the status roles', async () => {
  const primitives = await readTree(PRIMITIVES)

  for (const [role, family] of Object.entries(STATUS_PRIMITIVES)) {
    assert.equal(
      await stylesheetToken(`color-status-${role}`),
      hexOf(token(primitives, `color.${family}.400`)),
      `--color-status-${role} must render the ${family}.400 value`,
    )
  }
  assert.equal(
    await stylesheetToken('color-border-error'),
    hexOf(token(primitives, 'color.red.500')),
    '--color-border-error must render the red.500 value',
  )

  for (const retired of [
    'color-status-danger',
    'color-border-danger',
    'color-cyan-500',
  ]) {
    assert.equal(
      await stylesheetToken(retired),
      undefined,
      `--${retired} must no longer be generated`,
    )
  }
})
