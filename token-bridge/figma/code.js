// Runs in the Figma plugin sandbox: document access only, no network. A
// variable's name is its token path with `/` separators, and the payload is one
// tree for the whole document: Figma cannot tell which repository folder a
// variable belongs to.
figma.showUI(__html__, { width: 420, height: 400, title: 'Kiter Token Bridge' })

const COLLECTION_NAME = 'Kiter'
const ALIAS_TYPE = 'VARIABLE_ALIAS'
const FIRST_MODE = 0

figma.ui.onmessage = async (message) => {
  if (!message || typeof message.type !== 'string') {
    return
  }
  try {
    if (message.type === 'describe') {
      await describeDocument()
      return
    }
    if (message.type === 'pull') {
      const tokens = buildTree(await readVariables())
      figma.ui.postMessage({ type: 'pull-result', tokens })
      return
    }
    if (message.type === 'pull-styles') {
      const styles = await readTextStyles()
      figma.ui.postMessage({ type: 'pull-styles-result', styles })
      return
    }
    if (message.type === 'push') {
      const variables = await writeTokens(message.tokens)
      const styles = await writeStyles(message.styles)
      figma.ui.postMessage({ type: 'push-result', variables, styles })
      return
    }
    if (message.type === 'close') {
      figma.closePlugin()
    }
  } catch (error) {
    figma.ui.postMessage({ type: 'error', error: errorText(error) })
  }
}

async function describeDocument() {
  if (!figma.variables) {
    figma.ui.postMessage({
      type: 'document',
      supported: false,
      collections: [],
      total: 0,
    })
    return
  }
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const described = collections.map((collection) => ({
    name: collection.name,
    count: collection.variableIds.length,
  }))
  const total = described.reduce((sum, entry) => sum + entry.count, 0)
  figma.ui.postMessage({
    type: 'document',
    supported: true,
    collections: described,
    total,
  })
}

// Every local variable becomes one record. A value the payload cannot carry is
// left out instead of being guessed.
async function readVariables() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const modeByCollection = {}
  for (const collection of collections) {
    const modes = collection.modes || []
    if (modes.length > FIRST_MODE) {
      modeByCollection[collection.id] = modes[FIRST_MODE].modeId
    }
  }

  const variables = await figma.variables.getLocalVariablesAsync()
  const pathById = {}
  for (const variable of variables) {
    pathById[variable.id] = toPath(variable.name)
  }

  const records = []
  for (const variable of variables) {
    const path = pathById[variable.id]
    const modeId = modeByCollection[variable.variableCollectionId]
    if (!path || !modeId) {
      continue
    }
    const value = await readValue(variable, modeId, pathById)
    if (value === undefined) {
      continue
    }
    records.push({ path, resolvedType: variable.resolvedType, value })
  }
  return records
}

async function readValue(variable, modeId, pathById) {
  const values = variable.valuesByMode || {}
  const raw = values[modeId]
  if (raw === undefined || raw === null) {
    return undefined
  }
  if (isPlainObject(raw) && raw.type === ALIAS_TYPE) {
    const target = await aliasTargetPath(raw.id, pathById)
    return target ? { alias: target } : undefined
  }
  if (variable.resolvedType === 'COLOR') {
    if (!isColorValue(raw)) {
      return undefined
    }
    return {
      r: raw.r,
      g: raw.g,
      b: raw.b,
      a: typeof raw.a === 'number' ? raw.a : 1,
    }
  }
  if (variable.resolvedType === 'FLOAT') {
    return typeof raw === 'number' ? raw : undefined
  }
  if (variable.resolvedType === 'STRING') {
    return typeof raw === 'string' ? raw : undefined
  }
  // BOOLEAN and anything Figma adds later has no token shape.
  return undefined
}

// Every local text style becomes one flattened record. The style stores resolved
// values, so the server has to invert the composite by value; this function only
// translates Figma's own shapes and never decides whether a value is writable.
//
// A style whose line height or letter spacing is not in pixels is reported with
// the raw `{ unit, value }` object, which matches no primitive and is therefore
// reported instead of written.
async function readTextStyles() {
  const styles = await figma.getLocalTextStylesAsync()
  const records = []
  for (const style of styles) {
    const fontName = style.fontName || {}
    records.push({
      name: style.name,
      fontFamily: typeof fontName.family === 'string' ? fontName.family : '',
      fontSize: style.fontSize,
      fontWeight:
        WEIGHT_VALUES[fontName.style] === undefined
          ? -1
          : WEIGHT_VALUES[fontName.style],
      lineHeight: pixelOrRaw(style.lineHeight),
      letterSpacing: pixelOrRaw(style.letterSpacing),
    })
  }
  return records
}

// A style keeps these values as `{ unit, value }`. Only a pixel value is a number
// the repository can compare, so anything else travels raw.
function pixelOrRaw(spacing) {
  if (!isPlainObject(spacing)) {
    return spacing
  }
  return spacing.unit === 'PIXELS' ? spacing.value : spacing
}

async function aliasTargetPath(id, pathById) {
  if (pathById[id]) {
    return pathById[id]
  }
  if (typeof figma.variables.getVariableByIdAsync !== 'function') {
    return undefined
  }
  const variable = await figma.variables.getVariableByIdAsync(id)
  if (!variable) {
    return undefined
  }
  const path = toPath(variable.name)
  if (path) {
    pathById[id] = path
  }
  return path
}

// The plugin knows nothing about the repository format: it forwards raw values
// and markers, and the local server decides what they mean.
function buildTree(records) {
  const tree = {}
  for (const record of records) {
    const keys = record.path.split('.')
    const last = keys.length - 1
    let node = tree
    let blocked = false
    for (let index = 0; index < last; index += 1) {
      const key = keys[index]
      if (node[key] === undefined) {
        node[key] = {}
      } else if (!isPlainObject(node[key])) {
        // A name is both a token and a group. A tree cannot hold both, so the
        // token form is left out instead of overwriting the group.
        blocked = true
        break
      }
      node = node[key]
    }
    if (blocked) {
      continue
    }
    node[keys[last]] = record.value
  }
  return tree
}

async function writeTokens(tree) {
  const collection = await ensureCollection()
  const modeId = modeIdOf(collection)
  const variables = await figma.variables.getLocalVariablesAsync()

  const byName = {}
  for (const variable of variables) {
    // A same-named variable in another collection cannot take this collection's
    // mode id, so adopting it would skip the write: only the Kiter copy is used.
    if (isKiterCollection(variable, collection)) {
      byName[variable.name] = variable
    }
  }

  const counts = { created: 0, updated: 0, skipped: 0 }
  const aliases = []

  for (const pair of flattenTree(tree)) {
    const target = aliasTarget(pair.value)
    if (target) {
      aliases.push({ name: pair.name, target })
      continue
    }
    const resolvedType = resolvedTypeOf(pair.value)
    if (!resolvedType) {
      counts.skipped += 1
      continue
    }
    const existing = byName[pair.name]
    if (!existing) {
      const created = figma.variables.createVariable(
        pair.name,
        collection,
        resolvedType,
      )
      created.setValueForMode(modeId, figmaValue(pair.value, resolvedType))
      byName[pair.name] = created
      counts.created += 1
      continue
    }
    if (existing.resolvedType !== resolvedType) {
      // Never delete or rename: a variable of another type is left alone and
      // reported, so the mismatch is visible in the panel.
      counts.skipped += 1
      continue
    }
    existing.setValueForMode(modeId, figmaValue(pair.value, resolvedType))
    counts.updated += 1
  }

  // Aliases run last: their target may be a variable created in this same push.
  for (const alias of aliases) {
    const target = byName[toName(alias.target)]
    if (!target) {
      counts.skipped += 1
      continue
    }
    const existing = byName[alias.name]
    if (!existing) {
      const created = figma.variables.createVariable(
        alias.name,
        collection,
        target.resolvedType,
      )
      created.setValueForMode(modeId, { type: ALIAS_TYPE, id: target.id })
      byName[alias.name] = created
      counts.created += 1
      continue
    }
    if (
      existing.resolvedType !== target.resolvedType ||
      existing.id === target.id
    ) {
      counts.skipped += 1
      continue
    }
    existing.setValueForMode(modeId, { type: ALIAS_TYPE, id: target.id })
    counts.updated += 1
  }

  return counts
}

async function ensureCollection() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const existing = findCollection(collections)
  if (existing) {
    return existing
  }
  const created = figma.variables.createVariableCollection(COLLECTION_NAME)
  modeIdOf(created)
  return created
}

// A collection the push can write into: the Kiter one, with at least one mode.
function findCollection(collections) {
  for (const collection of collections || []) {
    const modes = collection.modes || []
    if (collection.name === COLLECTION_NAME && modes.length > 0) {
      return collection
    }
  }
  return undefined
}

function modeIdOf(collection) {
  const modes = collection.modes || []
  if (modes.length <= FIRST_MODE) {
    throw new Error(`collection "${collection.name}" has no mode`)
  }
  return modes[FIRST_MODE].modeId
}

// Typography and shadow composites have no variable type, so they are written
// as styles. Writing is what this direction owns: a text style can come back
// through `readTextStyles`, but an effect style is still push-only. Nothing is
// deleted, and an existing style keeps the name it already has unless the
// payload carries that name.
//
// `skippedNames` is additive to the reported counts: the panel names the styles
// it could not write, because a silent skip hides a missing text style.
async function writeStyles(styles) {
  return {
    text: await writeTextStyles(styles && styles.text),
    effects: await writeEffectStyles(styles && styles.effects),
  }
}

async function writeTextStyles(entries) {
  const counts = {
    created: 0,
    updated: 0,
    skipped: 0,
    skippedNames: [],
    // Additive to the counts above: a skipped style keeps the reason it was
    // skipped for, so a missing cut is not mistaken for a missing family.
    skipReasons: [],
    // Additive to the counts above: a style can be written and still carry a
    // literal where the panel expects a variable.
    bindings: bindingCounts(),
    partiallyBoundNames: [],
    bindingIssues: [],
  }
  const list = Array.isArray(entries) ? entries : []
  if (list.length === 0) {
    return counts
  }
  const byName = {}
  // documentAccess: dynamic-page forbids the synchronous style accessors.
  for (const style of await figma.getLocalTextStylesAsync()) {
    byName[style.name] = style
  }
  // The variables were just written by this same push, so they are read again
  // here instead of keeping a second name table alive across the two passes.
  const variables = await variablesByName()
  for (const entry of list) {
    const name = trimName(entry)
    if (!name || typeof entry.fontSize !== 'number') {
      skipStyle(counts, name)
      continue
    }
    if (!hasWeightCut(entry.fontWeight)) {
      // An unmapped weight would be written as `Regular`, pushing a different
      // weight: it is skipped before any font is loaded.
      skipStyle(counts, name, 'weight')
      continue
    }
    const fontName = fontNameOf(entry)
    if (!fontName) {
      skipStyle(counts, name)
      continue
    }
    try {
      // Figma refuses to write a font the plugin has not loaded. A family the
      // document does not have fails here, and only this style is skipped.
      await figma.loadFontAsync(fontName)
    } catch {
      skipStyle(counts, name)
      continue
    }
    const existing = byName[name]
    let style
    try {
      style = existing || figma.createTextStyle()
      style.fontName = fontName
      style.fontSize = entry.fontSize
      style.lineHeight = {
        unit: 'PIXELS',
        value: numberOr(entry.lineHeight, entry.fontSize),
      }
      style.letterSpacing = {
        unit: 'PIXELS',
        value: numberOr(entry.letterSpacing, 0),
      }
      style.name = name
      byName[name] = style
    } catch {
      skipStyle(counts, name)
      continue
    }
    // The literals are written first, so a binding that is missing, refused or
    // rejected leaves a usable style instead of an empty one.
    recordBindings(counts, name, await bindTextStyle(style, entry, variables))
    if (existing) {
      counts.updated += 1
      continue
    }
    counts.created += 1
  }
  return counts
}

// The properties this bridge can bind, each with its outcome counters. A
// payload may name another property, so the counters are also created on
// demand by `countOf`.
function bindingCounts() {
  return {
    fontSize: { bound: 0, failed: 0 },
    letterSpacing: { bound: 0, failed: 0 },
  }
}

/**
 * Binds the properties the payload names a variable for. `lineHeight` never
 * arrives here: the style stores `fontSize x multiplier` in pixels and the
 * repository has no token for that product, so the literal stays on purpose.
 *
 * Every guard is per property and none of them aborts the batch: a missing API,
 * a missing variable and a refusal all keep the literal and are reported, so the
 * next push shows what actually happened in the document.
 */
async function bindTextStyle(style, entry, variables) {
  const outcome = { bound: [], failed: [] }
  const bindings = isPlainObject(entry.bindings) ? entry.bindings : {}
  for (const property of Object.keys(bindings)) {
    const variableName = bindings[property]
    if (typeof variableName !== 'string' || variableName.trim() === '') {
      continue
    }
    if (typeof style.setBoundVariable !== 'function') {
      outcome.failed.push({ property, reason: 'no-api' })
      continue
    }
    const variable = variables.get(toName(variableName.trim()))
    if (!variable) {
      outcome.failed.push({ property, reason: 'no-variable' })
      continue
    }
    try {
      // Awaited so an implementation that answers with a promise is reported
      // like a rejection instead of passing for a success.
      await style.setBoundVariable(property, variable)
      outcome.bound.push(property)
    } catch {
      outcome.failed.push({ property, reason: 'rejected' })
    }
  }
  return outcome
}

function recordBindings(counts, name, outcome) {
  for (const property of outcome.bound) {
    countOf(counts.bindings, property).bound += 1
  }
  for (const failure of outcome.failed) {
    countOf(counts.bindings, failure.property).failed += 1
    counts.bindingIssues.push({
      name,
      property: failure.property,
      reason: failure.reason,
    })
  }
  // A partially bound style is one that kept at least one literal while another
  // property points at a variable. A style nothing bound is not partial, but its
  // reasons are already in `bindingIssues`.
  if (
    name &&
    outcome.bound.length > 0 &&
    outcome.failed.length > 0 &&
    counts.partiallyBoundNames.indexOf(name) === -1
  ) {
    counts.partiallyBoundNames.push(name)
  }
}

function countOf(bindings, property) {
  if (!Object.prototype.hasOwnProperty.call(bindings, property)) {
    bindings[property] = { bound: 0, failed: 0 }
  }
  return bindings[property]
}

// The variables this push can write, by name: only the Kiter collection, so a
// binding never points at a same-named variable another collection owns.
async function variablesByName() {
  const byName = new Map()
  if (
    !figma.variables ||
    typeof figma.variables.getLocalVariablesAsync !== 'function'
  ) {
    return byName
  }
  let collectionId
  try {
    const collections =
      typeof figma.variables.getLocalVariableCollectionsAsync === 'function'
        ? await figma.variables.getLocalVariableCollectionsAsync()
        : []
    const collection = findCollection(collections)
    collectionId = collection ? collection.id : undefined
  } catch {
    collectionId = undefined
  }
  let variables
  try {
    variables = await figma.variables.getLocalVariablesAsync()
  } catch {
    return byName
  }
  for (const variable of variables) {
    if (variable.variableCollectionId !== collectionId) {
      continue
    }
    byName.set(variable.name, variable)
  }
  return byName
}

async function writeEffectStyles(entries) {
  const counts = { created: 0, updated: 0, skipped: 0, skippedNames: [] }
  const list = Array.isArray(entries) ? entries : []
  if (list.length === 0) {
    return counts
  }
  const byName = {}
  for (const style of await figma.getLocalEffectStylesAsync()) {
    byName[style.name] = style
  }
  for (const entry of list) {
    const effects = Array.isArray(entry && entry.effects)
      ? entry.effects
      : undefined
    const name = trimName(entry)
    if (!name || !effects) {
      skipStyle(counts, name)
      continue
    }
    const existing = byName[name]
    try {
      const style = existing || figma.createEffectStyle()
      style.effects = effects.map(cloneEffect)
      style.name = name
      byName[name] = style
    } catch {
      skipStyle(counts, name)
      continue
    }
    if (existing) {
      counts.updated += 1
      continue
    }
    counts.created += 1
  }
  return counts
}

function skipStyle(counts, name, reason) {
  counts.skipped += 1
  if (name) {
    counts.skippedNames.push(name)
  }
  if (reason) {
    counts.skipReasons.push({ name, reason })
  }
}

function trimName(entry) {
  if (!entry || typeof entry.name !== 'string') {
    return undefined
  }
  const name = entry.name.trim()
  return name === '' ? undefined : name
}

// The Figma cut for a repository weight. An unmapped weight keeps the family at
// its regular cut instead of failing the style.
const WEIGHT_STYLES = {
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
}

// The reverse cut, for reading a style back. An unknown style name maps to
// nothing, so the style is reported as an unmatched weight instead of borrowing
// one.
const WEIGHT_VALUES = {
  Regular: 400,
  Medium: 500,
  SemiBold: 600,
  Bold: 700,
}

// A family the payload does not name cannot be loaded, so the style is skipped
// instead of borrowing another family.
function fontNameOf(entry) {
  const family =
    typeof entry.fontFamily === 'string' ? entry.fontFamily.trim() : ''
  if (family === '') {
    return undefined
  }
  return { family, style: WEIGHT_STYLES[entry.fontWeight] || 'Regular' }
}

// Only a weight the cut table maps can be written. An explicit weight without a
// cut has no style name to load, and a fallback would silently write another
// weight while still counting the style as created or updated.
function hasWeightCut(weight) {
  if (weight === undefined || weight === null) {
    return true
  }
  return Object.hasOwn(WEIGHT_STYLES, weight)
}

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

// Figma keeps its own objects; handing it the payload object keeps a reference
// the panel still owns. A shallow copy is enough: effects are flat.
function cloneEffect(effect) {
  if (!isPlainObject(effect)) {
    return effect
  }
  const copy = {}
  for (const key of Object.keys(effect)) {
    copy[key] = effect[key]
  }
  if (isPlainObject(effect.color)) {
    copy.color = {
      r: effect.color.r,
      g: effect.color.g,
      b: effect.color.b,
      a: typeof effect.color.a === 'number' ? effect.color.a : 1,
    }
  }
  if (isPlainObject(effect.offset)) {
    copy.offset = { x: effect.offset.x, y: effect.offset.y }
  }
  return copy
}

function isKiterCollection(variable, collection) {
  return variable.variableCollectionId === collection.id
}

// `path.to.token` -> `path/to/token`: the name is the path.
function toName(path) {
  return path.split('.').filter(Boolean).join('/')
}

function toPath(name) {
  return String(name)
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('.')
}

// A node is a group unless it already looks like a value.
function flattenTree(tree, prefix, pairs) {
  const path = prefix || []
  const flattened = pairs || []
  if (!isPlainObject(tree)) {
    return flattened
  }
  for (const key of Object.keys(tree)) {
    const value = tree[key]
    const next = path.concat(key)
    if (isPlainObject(value) && !isColorValue(value) && !isAliasMarker(value)) {
      flattenTree(value, next, flattened)
      continue
    }
    flattened.push({ name: toName(next.join('.')), value })
  }
  return flattened
}

function aliasTarget(value) {
  return aliasPath(value) || undefined
}

function aliasPath(value) {
  if (isAliasMarker(value)) {
    return value.alias
  }
  if (typeof value === 'string') {
    const match = /^\{([^{}]+)\}$/.exec(value.trim())
    return match ? match[1] : undefined
  }
  return undefined
}

function resolvedTypeOf(value) {
  if (typeof value === 'number') {
    return 'FLOAT'
  }
  if (typeof value === 'string') {
    return 'STRING'
  }
  if (isColorValue(value)) {
    return 'COLOR'
  }
  return undefined
}

function figmaValue(value, resolvedType) {
  if (resolvedType === 'COLOR') {
    return {
      r: value.r,
      g: value.g,
      b: value.b,
      a: typeof value.a === 'number' ? value.a : 1,
    }
  }
  return value
}

function isAliasMarker(value) {
  return isPlainObject(value) && typeof value.alias === 'string'
}

function isColorValue(value) {
  return (
    isPlainObject(value) &&
    typeof value.r === 'number' &&
    typeof value.g === 'number' &&
    typeof value.b === 'number'
  )
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

describeDocument()
