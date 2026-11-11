/**
 * Rebuilds the canonical DTCG value from the raw value Figma returns. The
 * repository token guides the rebuild, so no type or shape is guessed: the
 * plugin never learns the DTCG vocabulary.
 */
export function encodeLeaf(existingToken, flatValue) {
  if (!isPlainObject(existingToken)) {
    return flatValue
  }
  if (existingToken.$type === 'color') {
    return decodeColorValue(flatValue) ?? flatValue
  }
  if (existingToken.$type === 'dimension') {
    if (typeof flatValue === 'number') {
      return { value: flatValue, unit: 'px' }
    }
    if (typeof flatValue === 'string') {
      return decodeDimension(flatValue) ?? flatValue
    }
    return flatValue
  }
  if (existingToken.$type === 'shadow' && typeof flatValue === 'string') {
    return decodeShadow(flatValue) ?? flatValue
  }
  return flatValue
}

function decodeColorValue(value) {
  if (typeof value === 'string') {
    return decodeColor(value)
  }
  if (!isPlainObject(value)) {
    return undefined
  }
  const channels = [value.r, value.g, value.b]
  if (!channels.every((channel) => typeof channel === 'number')) {
    return undefined
  }
  // Figma reports 0..1 channels with its own precision. The repository stores
  // exact 8-bit `n / 255` components, so quantize instead of trusting the
  // incoming float: a Figma round trip then reproduces the token exactly.
  const bytes = channels.map((channel) =>
    Math.min(255, Math.max(0, Math.round(channel * 255))),
  )
  return repoColor(bytes, typeof value.a === 'number' ? value.a : 1)
}

function decodeColor(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const digits = hex[1]
    const bytes = [0, 2, 4].map((start) =>
      Number.parseInt(digits.slice(start, start + 2), 16),
    )
    return repoColor(bytes, 1)
  }
  const rgba =
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d*\.?\d+)\s*\)$/i.exec(
      value,
    )
  if (rgba) {
    return repoColor(
      [rgba[1], rgba[2], rgba[3]].map((channel) => Number(channel)),
      Number(rgba[4]),
    )
  }
  return undefined
}

function repoColor(bytes, alpha) {
  const components = bytes.map((byte) => byte / 255)
  if (alpha === 1) {
    return {
      colorSpace: 'srgb',
      components,
      hex: `#${bytes.map(hexPair).join('')}`,
    }
  }
  return { colorSpace: 'srgb', components, alpha }
}

function hexPair(byte) {
  return byte.toString(16).padStart(2, '0').toUpperCase()
}

function decodeDimension(value) {
  const match = /^(-?\d+(?:\.\d+)?)([a-z]+)$/i.exec(value)
  if (!match) {
    return undefined
  }
  return { value: Number(match[1]), unit: match[2] }
}

function decodeShadow(value) {
  const match = /^(.+?)\s+(rgba?\([^)]*\)|#[0-9a-f]{6})\s*(inset)?$/i.exec(
    value.trim(),
  )
  if (!match) {
    return undefined
  }
  const [offsetX, offsetY, blur, spread] = match[1]
    .split(/\s+/)
    .map(decodeDimension)
  const color = decodeColor(match[2])
  if (!offsetX || !offsetY || !blur || !spread || !color) {
    return undefined
  }
  const shadow = { color, offsetX, offsetY, blur, spread }
  if (match[3]) {
    shadow.inset = true
  }
  return shadow
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
