// Renders the showcase demos into `public/demos/*.mp3` through the same board
// the worklet builds, so a clip is what the app plays today. `pnpm build` runs
// it, and the clips stay out of git.
//
// Run: pnpm reel. Needs ffmpeg on the path.
import { DEFAULT_CONTROLS } from '../src/controls'
import { buildBender } from '../src/dsp/build'
import { BLOCK } from '../src/dsp/stage'
import { packParams } from '../src/engine/params'
import { clipPath, showcase } from '../src/home/demos'
import { boardFromUrl } from '../src/ui/share'

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
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

for (const demo of showcase) {
  const out = join('public', clipPath(demo))
  mkdirSync(join('public', 'demos'), { recursive: true })
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
  console.log(out)
}
