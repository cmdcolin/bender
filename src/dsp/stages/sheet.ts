import { IDX } from '../../engine/params.ts'
import { mulberry32 } from '../util/rng.ts'
import { KEY_CHOICE, Struck, type Body, type Couplings } from './struck.ts'

export const SHEET_KEY_CHOICE = KEY_CHOICE

const MODES = 128
const GRID = 56
const WIDTH = 1.2
const DEPTH = 0.9
const KAPPA = 1.22
const LOWEST_HZ = 25
const TOP_HZ = 12000
const MODES_PER_HZ = ((Math.PI / 4) * WIDTH * DEPTH) / ((Math.PI / 2) * KAPPA)
const PICKUPS = [
  [0.31 / WIDTH, 0.17 / DEPTH],
  [0.83 / WIDTH, 0.64 / DEPTH],
] as const
const DRIVER = [0.74 / WIDTH, 0.52 / DEPTH] as const
const TILT_HZ = 1500
const SHAKE_TILT_HZ = 600
const MAX_BOOST = 4
const LOW_HZ = 400
const RING_SPREAD = 0.7
const HIGH_RING_S = 0.2

const plateHz = (kx: number, ky: number) =>
  (Math.PI / 2) * KAPPA * ((kx / Math.PI) ** 2 + (ky / Math.PI) ** 2)

// A 1.2 by 0.9 m steel sheet, 0.8 mm thick, lying on a floor: the lowest 56
// modes as the plate has them, the rest log-spaced to 12 kHz with random
// wavenumber angles.
function sheetBody(seed: number): Body {
  const kx = new Float64Array(MODES)
  const ky = new Float64Array(MODES)
  const px = new Float64Array(MODES)
  const py = new Float64Array(MODES)
  const boost = new Float64Array(MODES)
  const spread = new Float64Array(MODES)
  const shape = (j: number, x: number, y: number) =>
    boost[j]! *
    Math.sin(kx[j]! * x * WIDTH + px[j]!) *
    Math.sin(ky[j]! * y * DEPTH + py[j]!)
  const lay = (c: Couplings) => {
    const rng = mulberry32(seed ^ 0x1a7e)
    const grid: [number, number][] = []
    for (let m = 1; m < 40; m++)
      for (let n = 1; n < 40; n++) {
        const gx = (m * Math.PI) / WIDTH
        const gy = (n * Math.PI) / DEPTH
        if (plateHz(gx, gy) >= LOWEST_HZ) grid.push([gx, gy])
      }
    grid.sort((a, b) => plateHz(...a) - plateHz(...b))
    const gridTop = plateHz(...grid[GRID - 1]!)
    const sampled = MODES - GRID
    for (let j = 0; j < MODES; j++) {
      const inGrid = j < GRID
      const f = inGrid
        ? plateHz(...grid[j]!)
        : gridTop * (TOP_HZ / gridTop) ** ((j - GRID + rng()) / sampled)
      const k = Math.PI * Math.sqrt(f / ((Math.PI / 2) * KAPPA))
      const angle = rng() * 2 * Math.PI
      kx[j] = inGrid ? grid[j]![0] : k * Math.cos(angle)
      ky[j] = inGrid ? grid[j]![1] : k * Math.sin(angle)
      px[j] = inGrid ? 0 : rng() * 2 * Math.PI
      py[j] = inGrid ? 0 : rng() * 2 * Math.PI
      boost[j] = inGrid
        ? 1
        : Math.min(
            MAX_BOOST,
            Math.sqrt(
              (MODES_PER_HZ * f * Math.log(TOP_HZ / gridTop)) / sampled,
            ),
          )
      c.hz[j] = f * (1 + (rng() - 0.5) * 0.03)
      spread[j] = Math.exp(
        RING_SPREAD *
          Math.sqrt(-2 * Math.log(rng() + 1e-12)) *
          Math.cos(2 * Math.PI * rng()),
      )
      const tilt = 1 / (1 + f / TILT_HZ)
      c.outL[j] = shape(j, PICKUPS[0][0], PICKUPS[0][1]) * tilt
      c.outR[j] = shape(j, PICKUPS[1][0], PICKUPS[1][1]) * tilt
      c.drive[j] = shape(j, DRIVER[0], DRIVER[1]) / (1 + f / SHAKE_TILT_HZ)
      c.rattleIn[j] = (rng() * 2 - 1) * boost[j]! * Math.min(1, f / 2500)
      c.low[j] = f < LOW_HZ ? 1 : 0
    }
  }
  return {
    modes: MODES,
    outGain: 0.06,
    loud: 1.2,
    shakeGain: 0.004,
    lay,
    shape,
    ring(j, f, hold) {
      const ring = hold * (0.05 + (1.6 * 50) / (f + 50)) * spread[j]!
      return f > 2000 ? Math.min(ring, HIGH_RING_S * hold) : ring
    },
  }
}

export class Sheet extends Struck {
  constructor(sr: number, seed = 0x5ee7) {
    super('sheet', sr, seed, sheetBody(seed), {
      level: IDX.sheetLevel,
      strikes: IDX.sheetStrikes,
      struckBy: IDX.sheetStruckBy,
      hard: IDX.sheetHard,
      size: IDX.sheetSize,
      hold: IDX.sheetHold,
      shake: IDX.sheetShake,
      rattle: IDX.sheetRattle,
    })
  }
}
