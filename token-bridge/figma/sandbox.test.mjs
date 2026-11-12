// Guards the plugin sandbox contract: with documentAccess: "dynamic-page",
// Figma throws on the synchronous style accessors. This suite fails if the
// plugin ever calls them again.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

// The plugin bundle sits beside this test, so the sandbox contract travels with
// the code it guards.
const CODE = fileURLToPath(new URL('./code.js', import.meta.url))

// The plugin resolves a binding by variable name, so the fake document only has
// to hold variables with the names the payload carries.
const BINDING_VARIABLES = [
  {
    id: 'variable-font-size-14',
    name: 'primitives/font/size/14',
    resolvedType: 'FLOAT',
    variableCollectionId: 'collection',
    valuesByMode: {},
  },
  {
    id: 'variable-letter-spacing-normal',
    name: 'primitives/font/letter-spacing/normal',
    resolvedType: 'FLOAT',
    variableCollectionId: 'collection',
    valuesByMode: {},
  },
  // This name exists only in another collection: a push must never adopt it.
  {
    id: 'variable-foreign',
    name: 'primitives/font/line-height/normal',
    resolvedType: 'FLOAT',
    variableCollectionId: 'other',
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
      (variable) => variable.name !== 'primitives/font/letter-spacing/normal',
    )
  }
  return BINDING_VARIABLES
}

// The document is mutable state: the plugin creates, parks and removes
// variables, so every later read in the same run has to see the difference.
function variableStore(seed) {
  const store = new Map()
  let nextId = 0
  const decorate = (record) => ({
    ...record,
    valuesByMode: { ...record.valuesByMode },
    setValueForMode(modeId, value) {
      this.valuesByMode[modeId] = value
    },
    remove() {
      store.delete(this.id)
    },
  })
  for (const record of seed) {
    store.set(record.id, decorate(record))
  }
  return {
    store,
    create: (name, collection, resolvedType) => {
      nextId += 1
      const variable = decorate({
        id: `created-variable-${nextId}`,
        name,
        resolvedType,
        variableCollectionId: collection.id,
        valuesByMode: {},
      })
      store.set(variable.id, variable)
      return variable
    },
  }
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

async function runPlugin(message, variant = 'bound', options = {}) {
  assert.ok(VARIANTS.includes(variant), `unknown variant ${variant}`)
  const textStyles = styleStore(variant)
  const effectStyles = styleStore(variant)
  const loadedFonts = []
  // The document is state, not a fixed read: a push that parks or creates a
  // variable has to be observable by the next read in the same run.
  const variables = variableStore(
    options.seedVariables || variablesFor(variant),
  )
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
    loadFontAsync: async (fontName) => {
      loadedFonts.push(fontName)
    },
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
      getLocalVariableCollectionsAsync: async () => [
        {
          id: 'collection',
          name: 'Kiter',
          modes: [{ modeId: 'mode' }],
          variableIds: [],
        },
      ],
      getLocalVariablesAsync: async () => [...variables.store.values()],
      createVariableCollection: () => ({
        id: 'collection',
        name: '',
        modes: [{ modeId: 'mode' }],
      }),
      createVariable: (name, collection, resolvedType) =>
        variables.create(name, collection, resolvedType),
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
  return { posted, textStyles, effectStyles, loadedFonts, variables }
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
          fontSize: 'primitives/font/size/14',
          letterSpacing: 'primitives/font/letter-spacing/normal',
        },
      },
    ],
    effects: [],
  }
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// A seeded variable of any collection: its name doubles as its id.
const seeded = (name, value, collection = 'collection') => ({
  id: name,
  name,
  resolvedType: typeof value === 'number' ? 'FLOAT' : 'COLOR',
  variableCollectionId: collection,
  valuesByMode: { mode: value },
})

test('does not adopt a same-named variable from another collection (R3-001)', async () => {
  const bindings = { letterSpacing: 'primitives/font/line-height/normal' }
  const { posted, variables } = await runPlugin(
    {
      type: 'push',
      tokens: { primitives: { font: { 'line-height': { normal: 20 } } } },
      styles: { text: [{ ...styles.text[0], bindings }], effects: [] },
    },
    'bound',
    // Only the foreign variable exists, so nothing is stale and the push has to
    // resolve the binding against the copy it creates in its own collection.
    { seedVariables: [BINDING_VARIABLES[2]] },
  )

  // The Kiter copy is created; the foreign one is neither updated nor bound.
  assert.equal(posted.variables.created, 1)
  assert.equal(posted.variables.updated, 0)
  assert.equal(posted.variables.parked, 0)
  const foreign = variables.store.get('variable-foreign')
  assert.equal(foreign.variableCollectionId, 'other')
  assert.deepEqual(plain(foreign.valuesByMode), {})
  const copy = [...variables.store.values()].find(
    (variable) =>
      variable.name === 'primitives/font/line-height/normal' &&
      variable.variableCollectionId === 'collection',
  )
  assert.ok(copy, 'the push creates its own copy of the colliding name')
  assert.deepEqual(plain(posted.styles.text.bindings), {
    fontSize: { bound: 0, failed: 0 },
    letterSpacing: { bound: 1, failed: 0 },
  })
})

test('parks a Kiter variable the push no longer names (S1, S2)', async () => {
  const { posted, variables } = await runPlugin({
    type: 'push',
    tokens: { primitives: { font: { size: { 14: 14 } } } },
    styles: { text: [], effects: [] },
  })

  const names = [...variables.store.values()].map((variable) => variable.name)
  assert.equal(posted.variables.parked, 1)
  assert.deepEqual(plain(posted.variables.parkedNames), [
    `_stale/${today()}/primitives/font/letter-spacing/normal`,
  ])
  // The stale name leaves the live set; the foreign one is never touched.
  assert.deepEqual(names.sort(), [
    `_stale/${today()}/primitives/font/letter-spacing/normal`,
    'primitives/font/line-height/normal',
    'primitives/font/size/14',
  ])
})

test('a parked multi-mode variable keeps every mode value (S2)', async () => {
  const { posted, variables } = await runPlugin(
    {
      type: 'push',
      tokens: { primitives: { font: { size: { 14: 14 } } } },
      styles: { text: [], effects: [] },
    },
    'bound',
    {
      seedVariables: [
        {
          id: 'variable-cyan',
          name: 'primitives/color/cyan/400',
          resolvedType: 'COLOR',
          variableCollectionId: 'collection',
          valuesByMode: {
            mode: { r: 0, g: 1, b: 1, a: 1 },
            'mode-dark': { r: 0, g: 0.6, b: 0.6, a: 1 },
          },
        },
      ],
    },
  )

  assert.equal(posted.variables.parked, 1)
  // A rename copies nothing, so every mode survives: the old copy carried one
  // mode's value and removed the original with the rest.
  assert.deepEqual(plain(variables.store.get('variable-cyan').valuesByMode), {
    mode: { r: 0, g: 1, b: 1, a: 1 },
    'mode-dark': { r: 0, g: 0.6, b: 0.6, a: 1 },
  })
})

// Parking renames, so a stale variable keeps its id: an alias, a style binding
// or a layer binding that points at it still resolves.
test('parks a stale variable by renaming it (S1, S2, R1-002)', async () => {
  const cyan = seeded('primitives/color/cyan/400', { r: 0, g: 1, b: 1, a: 1 })
  const size = seeded('primitives/font/size/14', 14)
  const older = seeded('_stale/2020-01-01/primitives/color/red/500', 1)
  const { posted, variables } = await runPlugin(
    {
      type: 'push',
      tokens: { primitives: { font: { size: { 14: 12 } } } },
      styles: { text: [], effects: [] },
    },
    'bound',
    { seedVariables: [cyan, size, older] },
  )

  const parkedName = `_stale/${today()}/primitives/color/cyan/400`
  assert.equal(posted.variables.parked, 1)
  assert.deepEqual(plain(posted.variables.parkedNames), [parkedName])
  // Same id, new name.
  assert.equal(variables.store.get(cyan.id).name, parkedName)
  // A name the tree still produces keeps its live name, and a name already
  // parked is not renamed a second time.
  assert.equal(variables.store.get(size.id).name, size.name)
  assert.equal(variables.store.get(older.id).name, older.name)
})

test('an empty token tree parks nothing (S5)', async () => {
  const { posted } = await runPlugin({
    type: 'push',
    tokens: {},
    styles: { text: [], effects: [] },
  })

  assert.equal(posted.variables.parked, 0)
  assert.deepEqual(plain(posted.variables.parkedNames), [])
})

function parkedSeed() {
  return [
    {
      id: 'variable-old',
      name: '_stale/2020-01-01/primitives/color/cyan/400',
      resolvedType: 'COLOR',
      variableCollectionId: 'collection',
      valuesByMode: { mode: { r: 0, g: 1, b: 1, a: 1 } },
    },
    {
      id: 'variable-fresh',
      name: `_stale/${today()}/primitives/color/red/500`,
      resolvedType: 'COLOR',
      variableCollectionId: 'collection',
      valuesByMode: { mode: { r: 1, g: 0, b: 0, a: 1 } },
    },
    {
      id: 'variable-live',
      name: 'primitives/font/size/14',
      resolvedType: 'FLOAT',
      variableCollectionId: 'collection',
      valuesByMode: { mode: 14 },
    },
    {
      id: 'variable-foreign-parked',
      name: '_stale/2020-01-01/primitives/color/blue/400',
      resolvedType: 'COLOR',
      variableCollectionId: 'other',
      valuesByMode: {},
    },
  ]
}

test('offers only parked names past the window (S2)', async () => {
  const { posted } = await runPlugin({ type: 'purge-plan' }, 'bound', {
    seedVariables: parkedSeed(),
  })

  assert.deepEqual(plain(posted.plan.names), [
    '_stale/2020-01-01/primitives/color/cyan/400',
  ])
  assert.equal(posted.plan.windowDays, 14)
})

test('purges only the parked names it was asked for (S2, S4)', async () => {
  const missing = '_stale/2020-01-01/primitives/color/magenta/400'
  const { posted, variables } = await runPlugin(
    {
      type: 'purge',
      names: [
        '_stale/2020-01-01/primitives/color/cyan/400',
        'primitives/font/size/14',
        '_stale/2020-01-01/primitives/color/blue/400',
        missing,
      ],
    },
    'bound',
    { seedVariables: parkedSeed() },
  )

  assert.equal(posted.counts.removed, 1)
  // A live name, a name from another collection and a name that is gone are
  // reported, not removed.
  assert.deepEqual(plain(posted.counts.skippedNames).sort(), [
    '_stale/2020-01-01/primitives/color/blue/400',
    missing,
    'primitives/font/size/14',
  ])
  assert.equal(variables.store.get('variable-old'), undefined)
  assert.ok(variables.store.get('variable-live'))
  assert.ok(variables.store.get('variable-foreign-parked'))
})

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
    fontSize: 'primitives/font/size/14',
    letterSpacing: 'primitives/font/letter-spacing/normal',
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

  assert.deepEqual(style.boundVariables, {
    fontSize: 'primitives/font/size/14',
  })
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
    letterSpacing: 'primitives/font/letter-spacing/normal',
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

test('skips a weight with no Figma cut before loading its font (R3-002)', async () => {
  const { posted, textStyles, loadedFonts } = await runPlugin({
    type: 'push',
    tokens: {},
    styles: {
      text: [
        { ...styles.text[0], fontWeight: 800 },
        { ...styles.text[0], name: 'typography/strong', fontWeight: 600 },
      ],
      effects: [],
    },
  })

  // Weight 800 has no cut, so the style is skipped: writing `Regular` for it
  // would push a different weight and still count it as created.
  assert.equal(posted?.type, 'push-result')
  assert.deepEqual(plain(loadedFonts), [
    { family: 'Instrument Sans', style: 'SemiBold' },
  ])
  assert.equal(posted.styles.text.created, 1)
  assert.equal(posted.styles.text.updated, 0)
  assert.equal(posted.styles.text.skipped, 1)
  assert.deepEqual(plain(posted.styles.text.skippedNames), ['typography/body'])
  assert.deepEqual(plain(posted.styles.text.skipReasons), [
    { name: 'typography/body', reason: 'weight' },
  ])
  assert.deepEqual(
    plain(textStyles.created.map((style) => [style.name, style.fontName])),
    [['typography/strong', { family: 'Instrument Sans', style: 'SemiBold' }]],
  )
})

// The reverse direction: a Figma text style is flattened to the raw values the
// server compares. Figma stores a font weight as a style name and a line height
// as `{ unit, value }`, so both are translated here, before they leave Figma.
async function runReadTextStyles(styles) {
  let handler
  const posts = []
  const figma = {
    showUI: () => {},
    closePlugin: () => {},
    ui: {
      postMessage: (value) => posts.push(value),
      set onmessage(fn) {
        handler = fn
      },
      get onmessage() {
        return handler
      },
    },
    getLocalTextStylesAsync: async () => styles,
    variables: {
      getLocalVariableCollectionsAsync: async () => [],
      getLocalVariablesAsync: async () => [],
    },
  }

  vm.runInNewContext(readFileSync(CODE, 'utf8'), {
    figma,
    __html__: '<html></html>',
  })
  await handler({ type: 'pull-styles' })
  const result = posts.find((message) => message.type === 'pull-styles-result')
  assert.ok(result, 'the plugin answers with the local text styles')
  return plain(result.styles)
}

test('reads text styles as pixel values and numeric weights', async () => {
  const styles = await runReadTextStyles([
    {
      name: 'typography/body',
      fontName: { family: 'Instrument Sans', style: 'Regular' },
      fontSize: 14,
      lineHeight: { unit: 'PIXELS', value: 21 },
      letterSpacing: { unit: 'PIXELS', value: 0 },
    },
    {
      name: 'typography/control-strong',
      fontName: { family: 'Instrument Sans', style: 'SemiBold' },
      fontSize: 13,
      lineHeight: { unit: 'PIXELS', value: 20 },
      letterSpacing: { unit: 'PIXELS', value: 0 },
    },
  ])

  assert.deepEqual(styles, [
    {
      name: 'typography/body',
      fontFamily: 'Instrument Sans',
      fontSize: 14,
      fontWeight: 400,
      lineHeight: 21,
      letterSpacing: 0,
    },
    {
      name: 'typography/control-strong',
      fontFamily: 'Instrument Sans',
      fontSize: 13,
      fontWeight: 600,
      lineHeight: 20,
      letterSpacing: 0,
    },
  ])
})

test('reports an unknown weight and a non-pixel line height unchanged', async () => {
  const styles = await runReadTextStyles([
    {
      name: 'typography/display/large',
      fontName: { family: 'Instrument Sans', style: 'Black' },
      fontSize: 48,
      lineHeight: { unit: 'PERCENT', value: 120 },
      letterSpacing: { unit: 'PERCENT', value: 2 },
    },
  ])

  // -1 matches no weight token, and the raw objects match no primitive either:
  // both are reported by the server instead of being guessed.
  assert.deepEqual(styles[0], {
    name: 'typography/display/large',
    fontFamily: 'Instrument Sans',
    fontSize: 48,
    fontWeight: -1,
    lineHeight: { unit: 'PERCENT', value: 120 },
    letterSpacing: { unit: 'PERCENT', value: 2 },
  })
})

test('a second park on the same day does not collide (R3-002)', async () => {
  const cyan = { mode: { r: 0, g: 1, b: 1, a: 1 } }
  const { posted } = await runPlugin(
    {
      type: 'push',
      tokens: { primitives: { font: { size: { 14: 14 } } } },
      styles: { text: [], effects: [] },
    },
    'bound',
    {
      seedVariables: [
        {
          id: 'variable-parked-today',
          name: `_stale/${today()}/primitives/color/cyan/400`,
          resolvedType: 'COLOR',
          variableCollectionId: 'collection',
          valuesByMode: cyan,
        },
        {
          id: 'variable-cyan-again',
          name: 'primitives/color/cyan/400',
          resolvedType: 'COLOR',
          variableCollectionId: 'collection',
          valuesByMode: cyan,
        },
      ],
    },
  )

  assert.deepEqual(plain(posted.variables.parkedNames), [
    `_stale/${today()}/primitives/color/cyan/400-2`,
  ])
})

test('the boundary day of the purge window is not eligible (R3-004)', async () => {
  const day = (offset) =>
    new Date(Date.now() - offset * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
  const { posted } = await runPlugin({ type: 'purge-plan' }, 'bound', {
    seedVariables: [
      {
        id: 'variable-boundary',
        name: `_stale/${day(14)}/primitives/color/cyan/400`,
        resolvedType: 'COLOR',
        variableCollectionId: 'collection',
        valuesByMode: {},
      },
      {
        id: 'variable-older',
        name: `_stale/${day(15)}/primitives/color/red/500`,
        resolvedType: 'COLOR',
        variableCollectionId: 'collection',
        valuesByMode: {},
      },
    ],
  })

  assert.deepEqual(plain(posted.plan.names), [
    `_stale/${day(15)}/primitives/color/red/500`,
  ])
})
