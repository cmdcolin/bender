// Renders the showcase demos into `public/demos/*.mp3` through the same board
// the worklet builds, so a clip is what the app plays today. `pnpm build` runs
// it, and the clips stay out of git. `pnpm dev` runs it with `--missing`, which
// renders only the clips with no file or whose demo link changed since, so the
// landing page's play buttons work on a dev server too.
//
// Run: pnpm reel [--missing]. Needs ffmpeg on the path.
import { DEFAULT_CONTROLS } from '../src/controls.ts'
import { buildBender } from '../src/dsp/build.ts'
import { BLOCK } from '../src/dsp/stage.ts'
import { packParams } from '../src/engine/params.ts'
import { clipPath, showcase } from '../src/home/demos.ts'
import { boardFromUrl } from '../src/ui/share.ts'

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SR = 48000
const SECONDS = 24
const FADE = 1.5

function take(query: string) {
  const built = buildBender(SR)
  built.transport.tune = true
  built.transport.drums = true
  const p = packParams({
    ...DEFAULT_CONTROLS,
    ...boardFromUrl('', `#${query}`),
  })
  const io = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const blocks = Math.ceil((SECONDS * SR) / BLOCK)
  const pcm = new Float32Array(blocks * BLOCK * 2)
  for (let b = 0; b < blocks; b++) {
    built.chain.process(io, p)
    for (let i = 0; i < BLOCK; i++) {
      pcm[(b * BLOCK + i) * 2] = io.l[i]!
      pcm[(b * BLOCK + i) * 2 + 1] = io.r[i]!
    }
  }
  return pcm
}

const DIR = join('public', 'demos')
const RENDERED = join(DIR, 'rendered.json')
const missingOnly = process.argv.includes('--missing')

function readRendered(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(RENDERED, 'utf8'))
  } catch {
    return {}
  }
}

const rendered = readRendered()
mkdirSync(DIR, { recursive: true })
for (const demo of showcase) {
  const out = join('public', clipPath(demo))
  if (missingOnly && existsSync(out) && rendered[out] === demo.query) continue
  execFileSync(
    'ffmpeg',
    [
      ['-y', '-loglevel', 'error'],
      ['-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', '-'],
      [
        '-af',
        `loudnorm=I=-16:TP=-1.5,afade=t=out:st=${SECONDS - FADE}:d=${FADE}`,
      ],
      ['-ar', String(SR), '-b:a', '112k', out],
    ].flat(),
    { input: Buffer.from(take(demo.query).buffer) },
  )
  rendered[out] = demo.query
  writeFileSync(RENDERED, `${JSON.stringify(rendered, null, 2)}\n`)
  console.log(out)
}
