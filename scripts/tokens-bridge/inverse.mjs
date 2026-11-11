/**
 * Rebuilds the canonical DTCG value from the flat value Figma returns. The
 * repository token guides the rebuild, so no type or shape is guessed.
 */
export function encodeLeaf(existingToken, flatValue) {
  if (!isPlainObject(existingToken)) {
    return flatValue
  }
  if (existingToken.$type === 'color' && typeof flatValue === 'string') {
    return decodeColor(flatValue) ?? flatValue
  }
  if (existingToken.$type === 'dimension' && typeof flatValue === 'string') {
    return decodeDimension(flatValue) ?? flatValue
  }
  if (existingToken.$type === 'shadow' && typeof flatValue === 'string') {
    return decodeShadow(flatValue) ?? flatValue
  }
  return flatValue
}

function decodeColor(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const digits = hex[1]
    const channels = [0, 2, 4].map((start) =>
      Number.parseInt(digits.slice(start, start + 2), 16),
    )
    return {
      colorSpace: 'srgb',
      components: channels.map((channel) => channel / 255),
      hex: `#${digits.toUpperCase()}`,
    }
  }
  const rgba =
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d*\.?\d+)\s*\)$/i.exec(
      value,
    )
  if (rgba) {
    return {
      colorSpace: 'srgb',
      components: [rgba[1], rgba[2], rgba[3]].map(
        (channel) => Number(channel) / 255,
      ),
      alpha: Number(rgba[4]),
    }
  }
  return undefined
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
