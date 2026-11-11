/**
 * Writes token trees in the dialect `tokens/**\/*.json` is committed in.
 *
 * A generic formatter cannot do this job. `JSON.stringify` + Prettier always
 * reorders integer-like keys after the string keys, because a JavaScript object
 * enumerates them first, and `objectWrap: preserve` depends on source text a
 * round trip has already lost. Writing the dialect directly is what makes a
 * pull produce a one-line diff for a one-value change.
 *
 * The rules, applied recursively at every depth:
 *
 * 1. `$description` first, then integer-like keys in ascending numeric order,
 *    then every other key in insertion order.
 * 2. A group — an object that is not a token — is a section of the file and
 *    always expands, one member per line. The committed files never render one
 *    inline, and no width test can decide it: `objectWrap: preserve` kept some
 *    groups expanded although their single line would have fit.
 * 3. A token leaf, and any object or array inside a `$value`, stays on one line
 *    while that line, starting at its indentation depth, is at most 80 columns;
 *    otherwise it expands one member per line. A run of numbers is the one
 *    exception: it packs greedily, which is the shape a color's `components`
 *    has in every committed file.
 * 4. JSON stays valid: no trailing comma after the last member, and an empty
 *    container is `{}` or `[]`.
 */

const INDENT = '  '
const PRINT_WIDTH = 80
const INTEGER_KEY = /^(?:0|[1-9]\d*)$/

// A node carries structure while it maps token paths, and a value once it is
// inside a `$value`: `structure` nodes are groups and always expand, `value`
// nodes may share a line with their key.
const STRUCTURE = 'structure'
const VALUE = 'value'

/**
 * Serializes a parsed token tree. Scalars use `JSON.stringify`, so strings and
 * numbers escape and format exactly as the committed files do.
 */
export function serializeTokens(tree) {
  return `${formatNode(tree, 0, 0, STRUCTURE)}\n`
}

/**
 * Formats one value that starts at `depth` and is preceded on its line by
 * `prefixWidth` columns (the indentation plus a member's `"key": `).
 */
function formatNode(value, depth, prefixWidth, mode) {
  if (!isContainer(value)) {
    return JSON.stringify(value)
  }

  if (mayShareLine(value, mode) && fitsOnLine(value, depth, prefixWidth)) {
    return formatFlat(value)
  }

  return formatExpanded(value, depth, mode)
}

function mayShareLine(value, mode) {
  return mode === VALUE || Array.isArray(value) || isTokenLeaf(value)
}

function fitsOnLine(value, depth, prefixWidth) {
  const width = INDENT.length * depth + prefixWidth + formatFlat(value).length
  return width <= PRINT_WIDTH
}

/**
 * The single-line form of a value, with every nested container also flat. It is
 * what the width check measures, so a nested member that does not fit expands
 * its ancestors with it.
 */
function formatFlat(value) {
  if (!isContainer(value)) {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? '[]' : `[${value.map(formatFlat).join(', ')}]`
  }

  const keys = orderedKeys(value)
  if (keys.length === 0) {
    return '{}'
  }
  const members = keys.map(
    (key) => `${JSON.stringify(key)}: ${formatFlat(value[key])}`,
  )
  return `{ ${members.join(', ')} }`
}

function formatExpanded(value, depth, mode) {
  const innerIndent = INDENT.repeat(depth + 1)
  const outerIndent = INDENT.repeat(depth)
  const [open, close, lines] = Array.isArray(value)
    ? ['[', ']', formatArrayMembers(value, depth, innerIndent)]
    : ['{', '}', formatObjectMembers(value, depth, innerIndent, mode)]
  if (lines.length === 0) {
    return `${open}${close}`
  }
  const members = lines.map((line, index) =>
    index === lines.length - 1 ? line : `${line},`,
  )
  return `${open}\n${members.join('\n')}\n${outerIndent}${close}`
}

function formatArrayMembers(values, depth, innerIndent) {
  if (isNumericRun(values)) {
    return fillNumbers(values, innerIndent)
  }
  return values.map(
    (item) => `${innerIndent}${formatNode(item, depth + 1, 0, VALUE)}`,
  )
}

function formatObjectMembers(value, depth, innerIndent, mode) {
  return orderedKeys(value).map((key) => {
    const name = JSON.stringify(key)
    const memberMode = mode === VALUE || key === '$value' ? VALUE : STRUCTURE
    const member = formatNode(
      value[key],
      depth + 1,
      name.length + 2,
      memberMode,
    )
    return `${innerIndent}${name}: ${member}`
  })
}

/**
 * A run of numbers — a color's `components` is the only case in the tree —
 * packs as many values per line as fit instead of one value per line.
 */
function isNumericRun(values) {
  return values.length > 1 && values.every((item) => typeof item === 'number')
}

function fillNumbers(values, innerIndent) {
  const lines = []
  let line = ''
  for (const value of values) {
    const item = JSON.stringify(value)
    if (line === '') {
      line = `${innerIndent}${item}`
      continue
    }
    const candidate = `${line}, ${item}`
    if (candidate.length > PRINT_WIDTH) {
      lines.push(line)
      line = `${innerIndent}${item}`
      continue
    }
    line = candidate
  }
  lines.push(line)
  return lines
}

/**
 * The repository puts a group's documentation before its tokens and orders
 * numeric steps by value, because `"300"` after `"$description"` is what a
 * design token file reads like. A JavaScript object cannot express that on its
 * own: it enumerates integer-like keys first, in ascending order, before any
 * other key regardless of how it was written.
 */
function orderedKeys(value) {
  const keys = Object.keys(value)
  return [
    ...keys.filter((key) => key === '$description'),
    ...keys
      .filter((key) => INTEGER_KEY.test(key))
      .sort((left, right) => Number(left) - Number(right)),
    ...keys.filter((key) => key !== '$description' && !INTEGER_KEY.test(key)),
  ]
}

function isTokenLeaf(node) {
  return (
    isContainer(node) && !Array.isArray(node) && Object.hasOwn(node, '$value')
  )
}

function isContainer(value) {
  return typeof value === 'object' && value !== null
}
