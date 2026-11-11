// Guards the plugin sandbox contract: with documentAccess: "dynamic-page",
// Figma throws on the synchronous style accessors. This suite fails if the
// plugin ever calls them again.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const CODE = join(
  fileURLToPath(new URL('../../figma/tokens-bridge/', import.meta.url)),
  'code.js',
)

// The plugin resolves a binding by variable name, so the fake document only has
// to hold variables with the names the payload carries.
const BINDING_VARIABLES = [
  {
    id: 'variable-font-size-14',
    name: 'font/size/14',
    resolvedType: 'FLOAT',
    variableCollectionId: 'collection',
    valuesByMode: {},
  },
  {
    id: 'variable-letter-spacing-normal',
    name: 'font/letter-spacing/normal',
    resolvedType: 'FLOAT',
    variableCollectionId: 'collection',
    valuesByMode: {},
  },
]

// Binding outcomes the file has to survive. `bound` is the happy path, and the
// other three are the reasons the plugin reports as `no-api`, `no-variable` and
// `rejected`.
const VARIANTS = ['bound', 'no-api', 'no-variable', 'rejected']

function dynamicPageError(name) {
  return new Error(
    `in ${name}: Cannot call with documentAccess: dynamic-page. Use ${name}Async instead.`,
  )
}

function variablesFor(variant) {
  if (variant === 'no-variable') {
    return BINDING_VARIABLES.filter(
      (variable) => variable.name !== 'font/letter-spacing/normal',
    )
  }
  return BINDING_VARIABLES
}

function styleStore(variant) {
  const store = new Map()
  const created = []
  return {
    store,
    created,
    get: (name) => store.get(name),
    create: () => {
      const style = {
        name: '',
        fontSize: 0,
        lineHeight: null,
        letterSpacing: null,
        boundVariables: {},
      }
      // The text style binding API. `no-api` models a document where the method
      // is absent, which the plugin must report instead of throwing.
      if (variant !== 'no-api') {
        style.setBoundVariable = (field, variable) => {
          if (variant === 'rejected' && field === 'fontSize') {
            throw new Error(`cannot bind ${field}`)
          }
          style.boundVariables[field] = variable.name
        }
      }
      style.remove = () => store.delete(style.name)
      created.push(style)
      return style
    },
  }
}

// The plugin runs in another realm, so its objects have another `Object`
// prototype and a strict deep equal would fail on identity alone.
function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

async function runPlugin(message, variant = 'bound') {
  assert.ok(VARIANTS.includes(variant), `unknown variant ${variant}`)
  const textStyles = styleStore(variant)
  const effectStyles = styleStore(variant)
  let handler
  let posted
  const figma = {
    showUI: () => {},
    closePlugin: () => {},
    ui: {
      postMessage: (value) => {
        posted = value
      },
      set onmessage(fn) {
        handler = fn
      },
      get onmessage() {
        return handler
      },
    },
    loadFontAsync: async () => {},
    getLocalTextStyles: () => {
      throw dynamicPageError('getLocalTextStyles')
    },
    getLocalEffectStyles: () => {
      throw dynamicPageError('getLocalEffectStyles')
    },
    getLocalTextStylesAsync: async () => [...textStyles.store.values()],
    getLocalEffectStylesAsync: async () => [...effectStyles.store.values()],
    createTextStyle: () => {
      const style = textStyles.create()
      textStyles.store.set(
        style.name || `style-${textStyles.store.size}`,
        style,
      )
      return style
    },
    createEffectStyle: () => {
      const style = effectStyles.create()
      effectStyles.store.set(
        style.name || `effect-${effectStyles.store.size}`,
        style,
      )
      return style
    },
    variables: {
      getLocalVariableCollectionsAsync: async () => [],
      getLocalVariablesAsync: async () => variablesFor(variant),
      createVariableCollection: () => ({
        id: 'collection',
        name: '',
        modes: [{ modeId: 'mode' }],
      }),
      createVariable: () => ({
        id: 'variable',
        name: '',
        setValueForMode: () => {},
      }),
    },
  }

  vm.runInNewContext(readFileSync(CODE, 'utf8'), {
    figma,
    __html__: '<html></html>',
  })
  assert.equal(
    typeof handler,
    'function',
    'the plugin registers a message handler',
  )
  await handler(message)
  return { posted, textStyles, effectStyles }
}

const styles = {
  text: [
    {
      name: 'typography/body',
      fontFamily: 'Instrument Sans',
      fontSize: 14,
      fontWeight: 500,
      lineHeight: 21,
      letterSpacing: 0,
    },
  ],
  effects: [
    {
      name: 'shadow/black-28',
      effects: [
        {
          type: 'DROP_SHADOW',
          color: { r: 0, g: 0, b: 0, a: 0.28 },
          offset: { x: 0, y: 12 },
          radius: 36,
          spread: 0,
          visible: true,
          blendMode: 'NORMAL',
        },
      ],
    },
  ],
}

// The payload a push carries for a text style whose composite aliases a size
// and a letter spacing. `lineHeight` has no binding: the style stores
// `fontSize x multiplier` and no token holds that pixel value.
function stylesWithBindings() {
  return {
    text: [
      {
        ...styles.text[0],
        bindings: {
          fontSize: 'font/size/14',
          letterSpacing: 'font/letter-spacing/normal',
        },
      },
    ],
    effects: [],
  }
}

test('writes styles with the async accessors required by dynamic-page', async () => {
  const { posted } = await runPlugin({ type: 'push', tokens: {}, styles })
  assert.equal(posted?.type, 'push-result')
  assert.equal(posted.styles.text.created, 1)
  assert.equal(posted.styles.text.skipped, 0)
  assert.equal(posted.styles.effects.created, 1)
  assert.equal(posted.styles.effects.skipped, 0)
})

test('binds the text style properties the payload carries a variable for', async () => {
  const { posted, textStyles } = await runPlugin({
    type: 'push',
    tokens: {},
    styles: stylesWithBindings(),
  })
  const style = textStyles.created[0]

  assert.deepEqual(style.boundVariables, {
    fontSize: 'font/size/14',
    letterSpacing: 'font/letter-spacing/normal',
  })
  // Line height is deliberately not bound: the literal stays what the token
  // arithmetic produced.
  assert.equal(Object.hasOwn(style.boundVariables, 'lineHeight'), false)
  assert.deepEqual(plain(style.lineHeight), { unit: 'PIXELS', value: 21 })

  assert.deepEqual(plain(posted.styles.text.bindings), {
    fontSize: { bound: 1, failed: 0 },
    letterSpacing: { bound: 1, failed: 0 },
  })
  assert.deepEqual(plain(posted.styles.text.partiallyBoundNames), [])
  assert.deepEqual(plain(posted.styles.text.bindingIssues), [])
  assert.equal(posted.styles.text.created, 1)
})

test('keeps the literal and reports no-api when setBoundVariable is absent', async () => {
  const { posted, textStyles } = await runPlugin(
    { type: 'push', tokens: {}, styles: stylesWithBindings() },
    'no-api',
  )
  const style = textStyles.created[0]

  assert.equal(posted?.type, 'push-result')
  assert.equal(style.fontSize, 14)
  assert.deepEqual(plain(style.letterSpacing), { unit: 'PIXELS', value: 0 })
  assert.deepEqual(style.boundVariables, {})

  assert.deepEqual(plain(posted.styles.text.bindings), {
    fontSize: { bound: 0, failed: 1 },
    letterSpacing: { bound: 0, failed: 1 },
  })
  assert.deepEqual(plain(posted.styles.text.bindingIssues), [
    { name: 'typography/body', property: 'fontSize', reason: 'no-api' },
    { name: 'typography/body', property: 'letterSpacing', reason: 'no-api' },
  ])
  // Nothing bound, so no style is partial and the style itself was still
  // written.
  assert.deepEqual(plain(posted.styles.text.partiallyBoundNames), [])
  assert.equal(posted.styles.text.created, 1)
  assert.equal(posted.styles.text.skipped, 0)
})

test('reports no-variable and names the partially bound style', async () => {
  const { posted, textStyles } = await runPlugin(
    { type: 'push', tokens: {}, styles: stylesWithBindings() },
    'no-variable',
  )
  const style = textStyles.created[0]

  assert.deepEqual(style.boundVariables, { fontSize: 'font/size/14' })
  assert.deepEqual(plain(style.letterSpacing), { unit: 'PIXELS', value: 0 })
  assert.deepEqual(plain(posted.styles.text.bindingIssues), [
    {
      name: 'typography/body',
      property: 'letterSpacing',
      reason: 'no-variable',
    },
  ])
  assert.deepEqual(plain(posted.styles.text.partiallyBoundNames), [
    'typography/body',
  ])
})

test('reports rejected and keeps the literal when Figma refuses a binding', async () => {
  const { posted, textStyles } = await runPlugin(
    { type: 'push', tokens: {}, styles: stylesWithBindings() },
    'rejected',
  )
  const style = textStyles.created[0]

  assert.equal(posted?.type, 'push-result')
  assert.equal(style.fontSize, 14)
  assert.deepEqual(style.boundVariables, {
    letterSpacing: 'font/letter-spacing/normal',
  })
  assert.deepEqual(plain(posted.styles.text.bindingIssues), [
    { name: 'typography/body', property: 'fontSize', reason: 'rejected' },
  ])
  assert.deepEqual(plain(posted.styles.text.partiallyBoundNames), [
    'typography/body',
  ])
  assert.deepEqual(plain(posted.styles.text.bindings), {
    fontSize: { bound: 0, failed: 1 },
    letterSpacing: { bound: 1, failed: 0 },
  })
})
