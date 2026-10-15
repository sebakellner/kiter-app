export function createWav(duration = 2) {
  const rate = 22050
  const frames = Math.round(rate * duration)
  const bytes = frames * 4
  const buffer = Buffer.alloc(44 + bytes)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + bytes, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(2, 22)
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE(rate * 4, 28)
  buffer.writeUInt16LE(4, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(bytes, 40)
  for (let index = 0; index < frames; index++) {
    const sample = Math.sin((index * 2 * Math.PI * 440) / rate)
    buffer.writeInt16LE(Math.round(sample * 0.25 * 32767), 44 + index * 4)
    buffer.writeInt16LE(Math.round(-sample * 0.65 * 32767), 46 + index * 4)
  }
  return buffer
}
