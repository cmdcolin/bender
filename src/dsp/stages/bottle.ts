import { IDX } from '../../engine/params.ts'
import { mulberry32 } from '../util/rng.ts'
import { Struck, type Body, type Couplings } from './struck.ts'

// A glass bottle on a table with a contact mic taped to its side. The wall
// rings in circumferential modes n = 2 to 6, each split into a pair by the
// bottle being slightly out of round, at three heights; the base thunks on the
// table and the strike clicks.

const RINGS = [2, 3, 4, 5, 6] as const
const HEIGHTS = [1, 1.14, 1.35] as const
const MODES = RINGS.length * HEIGHTS.length * 2 + 2
const THUNK = MODES - 2
const CLICK = MODES - 1
const WALL_HZ = 760
const THUNK_HZ = 165
const CLICK_HZ = 2900
const SPLIT = 0.0045
const NECK = 0.3
// One bottle, the same on every boot: the build's seed times only its taps.
const LAYOUT_SEED = 0
const PICKUPS = [
  [0.5, 0.75],
  [0.5 + 0.6 / Math.PI, 0.55],
] as const
const SHAKE_TILT_HZ = 600
const WALL_RING_S = 2.5
const WALL_RING_HZ_S = 2000
const THUNK_RING_S = 0.09
const CLICK_RING_S = 0.02
const LOW_HZ = 1000
const FILL_PITCH = 0.9
const FILL_DAMP = 2

const shell = (n: number) => (n * (n * n - 1)) / Math.sqrt(n * n + 1)

/** Where along the wall a strike lands, 0 at the shoulder and 1 at the base. */
const along = (y: number) =>
  Math.min(Math.max((y - NECK) / (1 - NECK), 0.06), 1)

function bottleBody(): Body {
  const ring = new Uint8Array(MODES)
  const height = new Uint8Array(MODES)
  const twin = new Uint8Array(MODES)
  const shape = (j: number, x: number, y: number) => {
    const angle = (x - 0.5) * Math.PI
    const n = ring[j]!
    return j === THUNK
      ? 0.4
      : j === CLICK
        ? 1
        : (twin[j] ? Math.sin(n * angle) : Math.cos(n * angle)) *
          Math.sin((height[j]! + 1) * Math.PI * along(y))
  }
  const lay = (c: Couplings) => {
    const rng = mulberry32(LAYOUT_SEED)
    let j = 0
    for (const n of RINGS)
      for (const [h, up] of HEIGHTS.entries())
        for (const t of [0, 1]) {
          ring[j] = n
          height[j] = h
          twin[j] = t
          c.hz[j] =
            ((WALL_HZ * shell(n)) / shell(2)) *
            up *
            (t ? 1 + SPLIT : 1) *
            (1 + (rng() - 0.5) * 0.004)
          j++
        }
    c.hz[THUNK] = THUNK_HZ
    c.hz[CLICK] = CLICK_HZ
    for (let k = 0; k < MODES; k++) {
      const wall = k < THUNK
      const weight = wall
        ? (height[k]! > 0 ? 0.5 : 1) / Math.sqrt(ring[k]!)
        : k === THUNK
          ? 1.5
          : 0.3
      c.outL[k] = (wall ? shape(k, PICKUPS[0][0], PICKUPS[0][1]) : 1) * weight
      c.outR[k] = (wall ? shape(k, PICKUPS[1][0], PICKUPS[1][1]) : 1) * weight
      c.drive[k] = c.outL[k]! / (1 + c.hz[k]! / SHAKE_TILT_HZ)
      c.rattleIn[k] = wall ? (rng() * 2 - 1) * 0.1 : k === THUNK ? 1 : 0.6
      c.low[k] = c.hz[k]! < LOW_HZ ? 1 : 0
    }
  }
  return {
    modes: MODES,
    outGain: 0.6,
    loud: 0.3,
    shakeGain: 0.004,
    lay,
    shape,
    ring(j, f, hold) {
      return j === THUNK
        ? THUNK_RING_S * hold ** 0.3
        : j === CLICK
          ? CLICK_RING_S
          : Math.min(WALL_RING_S, WALL_RING_HZ_S / f) * hold ** 0.6
    },
    retune(p, pitch, ringBy) {
      const fill = Math.min(Math.max(p[IDX.bottleFill]!, 0), 1)
      for (let k = 0; k < THUNK; k++) {
        pitch[k] = 1 / Math.sqrt(1 + FILL_PITCH * fill)
        ringBy[k] = 1 / (1 + FILL_DAMP * fill)
      }
      pitch[THUNK] = 1 - 0.3 * fill
    },
  }
}

export class Bottle extends Struck {
  constructor(sr: number, seed = 0xb077) {
    super('bottle', sr, seed, bottleBody())
  }
}
