import { DEFAULT_CONTROLS, type Controls } from '../src/controls.ts'
import { buildBender } from '../src/dsp/build.ts'
import { packParams } from '../src/engine/params.ts'
import { applyPreset, PRESETS } from '../src/ui/presets/index.ts'
import { BOARDS } from './boards.ts'

// Every preset and every board in boards.ts, rendered through the chain, so a
// change meant to leave the sound alone can be shown to, sample for sample.
//
//   pnpm golden write          keep the takes, before the change
//   pnpm golden check          render again and compare
//   pnpm golden check heavy    only the boards whose name has this in it
//
// The takes go in node_modules/.cache/golden, so they belong to this checkout.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const SR = 48000
const SECONDS = 4
const BLOCK = 128
const DIR = new URL('../node_modules/.cache/golden/', import.meta.url).pathname

const [mode, only = ''] = process.argv.slice(2)
if (mode !== 'write' && mode !== 'check') {
  console.error('pnpm golden write | check [name]')
  process.exit(2)
}

const boards: [string, Controls][] = [
  ...Object.entries(BOARDS).map(([name, c]): [string, Controls] => [
    name,
    { ...DEFAULT_CONTROLS, ...c },
  ]),
  ...PRESETS.map((p): [string, Controls] => [
    `preset ${p.name}`,
    applyPreset(p, DEFAULT_CONTROLS),
  ]),
]

// Both sides, block by block, with the song and the kit running and a tone on
// the mic, from a board built on a fixed seed.
function render(c: Controls) {
  const built = buildBender(SR, 7)
  built.transport.tune = true
  built.transport.drums = true
  const p = packParams(c)
  const io = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const mic = new Float32Array(BLOCK)
  const blocks = (SECONDS * SR) / BLOCK
  const out = new Float32Array(2 * blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < BLOCK; i++)
      mic[i] = 0.3 * Math.sin((2 * Math.PI * 220 * (b * BLOCK + i)) / SR)
    built.chain.process(io, p, mic)
    out.set(io.l, 2 * b * BLOCK)
    out.set(io.r, (2 * b + 1) * BLOCK)
  }
  return out
}

const fileFor = (name: string) =>
  `${DIR}${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.f32`

if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })
const chosen = boards.filter(([name]) => name.includes(only))
let differ = 0
for (const [name, c] of chosen) {
  const out = render(c)
  const file = fileFor(name)
  if (mode === 'write') writeFileSync(file, out)
  else if (!existsSync(file)) {
    differ++
    console.log(`${name}: no take kept, run pnpm golden write first`)
  } else {
    const was = new Float32Array(readFileSync(file).buffer.slice(0))
    let off = 0
    let first = -1
    for (let i = 0; i < out.length; i++)
      if (!Object.is(out[i], was[i])) {
        off++
        if (first < 0) first = i
      }
    if (off > 0) {
      differ++
      console.log(
        `${name}: ${off} samples differ, first at ${first} (${was[first]} then, ${out[first]} now)`,
      )
    }
  }
}
console.log(
  mode === 'write'
    ? `kept ${chosen.length} takes`
    : differ > 0
      ? `${differ} of ${chosen.length} boards differ`
      : `all ${chosen.length} boards match`,
)
process.exit(differ > 0 ? 1 : 0)
