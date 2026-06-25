import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src = join(root, 'public', 'icon-source.png')
const out = join(root, 'public')

const sizes = [
  { name: 'icon-192.png', size: 192, padding: 0 },
  { name: 'icon-512.png', size: 512, padding: 0 },
  { name: 'icon-192-maskable.png', size: 192, padding: 0.2 },
  { name: 'icon-512-maskable.png', size: 512, padding: 0.2 },
]

for (const { name, size, padding } of sizes) {
  const resize = size * (1 - padding * 2)
  const offset = Math.round((size - resize) / 2)

  const pipeline = sharp(src).resize(Math.round(resize), Math.round(resize))

  if (padding > 0) {
    const buffer = await pipeline.toBuffer()
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: buffer, top: offset, left: offset }])
      .png()
      .toFile(join(out, name))
  } else {
    await pipeline.png().toFile(join(out, name))
  }
  console.log(`✓ ${name} (${size}x${size}${padding ? ', maskable' : ''})`)
}
