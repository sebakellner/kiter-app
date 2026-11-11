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

function dynamicPageError(name) {
  return new Error(
    `in ${name}: Cannot call with documentAccess: dynamic-page. Use ${name}Async instead.`,
  )
}

function styleStore() {
  const store = new Map()
  return {
    store,
    get: (name) => store.get(name),
    create: () => {
      const style = {
        name: '',
        fontSize: 0,
        lineHeight: null,
        letterSpacing: null,
      }
      style.remove = () => store.delete(style.name)
      return style
    },
  }
}

async function runPlugin(message) {
  const textStyles = styleStore()
  const effectStyles = styleStore()
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
      getLocalVariablesAsync: async () => [],
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
  return posted
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

test('writes styles with the async accessors required by dynamic-page', async () => {
  const posted = await runPlugin({ type: 'push', tokens: {}, styles })
  assert.equal(posted?.type, 'push-result')
  assert.equal(posted.styles.text.created, 1)
  assert.equal(posted.styles.text.skipped, 0)
  assert.equal(posted.styles.effects.created, 1)
  assert.equal(posted.styles.effects.skipped, 0)
})
