// Downloads the CC0 photo-scanned textures used by the renderer from Poly Haven
// (https://polyhaven.com, CC0 licence) into public/assets. The game falls back to
// procedural materials when these files are missing.
import { mkdir, writeFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Buffer } from 'node:buffer'

const out = resolve('public/assets')
const textures = {
  road: 'asphalt_02',
  pavement: 'concrete_pavement',
  wall: 'plastered_wall',
  roof: 'corrugated_iron',
  soil: 'red_laterite_soil_stones',
}

async function download(url, file) {
  try { await access(file); console.log('exists', file); return } catch { /* fetch it */ }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
  console.log('saved', file)
}

await mkdir(out, { recursive: true })
for (const [name, id] of Object.entries(textures)) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json()
  await download(files.Diffuse['1k'].jpg.url, resolve(out, `${name}_diff.jpg`))
  await download(files.nor_gl['1k'].jpg.url, resolve(out, `${name}_nor.jpg`))
}
