import sharp from 'sharp'

export function createPng(): Promise<Buffer> {
  return sharp({
    create: { width: 2, height: 3, channels: 4, background: '#ff0000' },
  })
    .png()
    .toBuffer()
}
