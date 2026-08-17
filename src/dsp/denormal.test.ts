import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { packParams } from '../engine/params'
import { buildBender } from './build'
import { BLOCK, type StereoBlock } from './stage'

// The smallest double the hardware still handles in one piece. Under it,
// arithmetic falls to microcode and runs about twenty times slower.
const SMALLEST_NORMAL = 2.2250738585072014e-308

// Nothing on the board may come to rest in denormal range.
//
// Every envelope here decays geometrically, and one left multiplying itself
// down never arrives at zero — it arrives at 1e-320 and stays, and from then on
// the stage costs twenty times what it did. That is the one kind of slowdown
// that sounds like the app breaking rather than working hard: a board is fine
// for five minutes and then it is not, permanently, until the page is reloaded.
//
// A walk over the whole graph rather than a list of the fields that have caught
// it so far, because the next one will be somewhere nobody thought to look.
// Values kept in a Float32Array are exempt: that format bottoms out at 1e-45
// and flushes itself to zero on the way past.
function denormals(root: object): string[] {
  const found: string[] = []
  const seen = new Set<object>()
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'number') {
      if (node !== 0 && Math.abs(node) < SMALLEST_NORMAL) {
        found.push(`${path} = ${node}`)
      }
      return
    }
    if (node === null || typeof node !== 'object') return
    if (ArrayBuffer.isView(node) || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`))
      return
    }
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`)
  }
  walk(root, 'chain')
  return found
}

test('a board left ringing itself out never settles into denormal range', () => {
  // Everything here decays per sample at a rate set by the sample rate, so a
  // slow rate reaches the same place in the same simulated minutes for a sixth
  // of the work. What is under test is where a value comes to rest, not pitch.
  const sr = 8000
  const built = buildBender(sr, 7)
  const io: StereoBlock = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  // Everything that rings, struck once and then left alone.
  const p = packParams({
    ...DEFAULT_CONTROLS,
    chipLevel: 0.6,
    chipAccomp: 1,
    drumLevel: 0.6,
    revMix: 0.4,
    dlyMix: 0.3,
    filtMix: 0.4,
    combMix: 0.3,
    stompMix: 0.4,
    tapeMix: 0.4,
  })

  built.transport.tune = true
  built.transport.drums = true
  for (let b = 0; b < (2 * sr) / BLOCK; b++) built.chain.process(io, p)
  built.transport.tune = false
  built.transport.drums = false
  // Long enough for a double to halve its way down from unity to nothing.
  for (let b = 0; b < (400 * sr) / BLOCK; b++) built.chain.process(io, p)

  expect(denormals(built.chain)).toEqual([])
}, 30_000)
