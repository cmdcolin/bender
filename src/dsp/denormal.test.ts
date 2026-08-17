import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type ControlKey, type Controls } from '../controls'
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

// Everything here decays per sample at a rate set by the sample rate, so a slow
// rate reaches the same place in the same simulated minutes for a sixth of the
// work. What is under test is where a value comes to rest, not pitch.
const SR = 8000

function ring(hot: Partial<Controls>, cold: Partial<Controls>): string[] {
  const built = buildBender(SR, 7)
  const io: StereoBlock = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  built.transport.tune = true
  built.transport.drums = true
  const struck = packParams({ ...DEFAULT_CONTROLS, ...hot })
  for (let b = 0; b < (2 * SR) / BLOCK; b++) built.chain.process(io, struck)
  built.transport.tune = false
  built.transport.drums = false
  // Long enough for a double to halve its way down from unity to nothing.
  const after = packParams({ ...DEFAULT_CONTROLS, ...hot, ...cold })
  for (let b = 0; b < (400 * SR) / BLOCK; b++) built.chain.process(io, after)
  return denormals(built.chain)
}

// Everything that rings, struck once and then left alone.
const RINGING: Partial<Controls> = {
  chipLevel: 0.6,
  chipAccomp: 1,
  drumLevel: 0.6,
  revMix: 0.4,
  dlyMix: 0.3,
  filtMix: 0.4,
  combMix: 0.3,
  stompMix: 0.4,
  tapeMix: 0.4,
}

test('a board left ringing itself out never settles into denormal range', () => {
  expect(ring(RINGING, {})).toEqual([])
}, 30_000)

// The knobs that feed a value with nothing else driving it: at rest the state
// they wind up is multiplied down by itself for ever, and a decay that starts
// from zero never leaves it. So a stage is only honestly tested from the far
// side of a knob that was up and came back down — which is where the tape
// delay's flutter walk had been coasting into denormal range and costing the
// stage most of its own cost again, on a board that reads as untouched.
const WOUND_UP: Partial<Controls> = {
  flutter: 0.5,
  wowDepthMs: 3,
  tapeWow: 0.5,
  tapeFlutter: 0.5,
  tapeDrop: 0.3,
  tapePrint: 0.5,
  stompSag: 0.5,
  brownAmt: 0.4,
  brownCrackle: 0.3,
  humLevel: 0.3,
  crackleAmp: 0.3,
  chipStarve: 0.3,
  subLevel: 0.4,
  shiftMix: 0.5,
  shiftFb: 0.4,
  couple: 0.5,
}

test('nor does one whose knobs were turned back down', () => {
  const cold = Object.fromEntries(
    Object.keys(WOUND_UP).map(k => [k, DEFAULT_CONTROLS[k as ControlKey]]),
  )
  expect(ring({ ...RINGING, ...WOUND_UP, bendSlot5: 7 }, cold)).toEqual([])
}, 30_000)
