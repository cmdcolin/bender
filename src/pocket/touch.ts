import { BEND_SLOT_KEYS } from '../ui/controls/index.ts'
import { inChain } from '../ui/presets/scenarios.ts'

import type { ControlKey, Controls } from '../controls.ts'

export const TOUCH = 'pocket:touch'
export const TILT = 'pocket:tilt'

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)
const sweep = (lo: number, hi: number, t: number) => lo * (hi / lo) ** t
const atLeast = (c: Controls, key: ControlKey, floor: number) =>
  Math.max(c[key], floor)

// A bend the board has pulled out of its chain borrows the last slot while the
// push is held. The slot value is the bend's place in BENDS, counted from 1.
const lend = (c: Controls, group: string, slot: number) =>
  inChain(c, group) ? {} : { [BEND_SLOT_KEYS.at(-1)!]: slot }

export interface TouchMode {
  name: string
  icon: string
  /** What across and up do, for the help card. */
  says: string
  push: (x: number, y: number, c: Controls) => Partial<Controls>
}

export const TOUCH_MODES: readonly TouchMode[] = [
  {
    name: 'dub',
    icon: '◎',
    says: 'across sweeps the screech filter, up feeds Wraith past 1',
    push: (x, y, c) => ({
      ...lend(c, 'Screech filter', 6),
      filtMix: 1,
      filtHz: Math.round(sweep(120, 7000, x)),
      filtRes: atLeast(c, 'filtRes', 0.8),
      dlySend: 1,
      dlyMix: atLeast(c, 'dlyMix', 0.2 + 0.5 * y),
      dlyFb: Math.round((0.3 + 0.95 * y) * 100) / 100,
    }),
  },
  {
    name: 'starve',
    icon: '↯',
    says: 'across drags the toy’s clock, up starves its supply',
    push: (x, y, c) => ({
      chipLevel: atLeast(c, 'chipLevel', 0.6),
      chipClockX: Math.round(sweep(0.25, 4, x) * 100) / 100,
      chipStarve: Math.round(0.95 * y * 100) / 100,
    }),
  },
  {
    name: 'crush',
    icon: '▦',
    says: 'across sets the sample rate, up takes bits away',
    push: (x, y, c) => ({
      ...lend(c, 'Crusher', 2),
      crushMix: 1,
      srHz: Math.round(sweep(300, 24000, x)),
      bits: Math.round(12 - 10 * y),
      srJitter: Math.round(0.5 * y * 100) / 100,
    }),
  },
  {
    name: 'glitch',
    icon: '⧉',
    says: 'across sets the slice length, up makes it stutter more often',
    push: (x, y, c) => ({
      ...lend(c, 'Glitch buffer', 5),
      glitchMix: 1,
      glitchSliceMs: Math.round(sweep(20, 600, x)),
      glitchProb: Math.round((0.15 + 0.85 * y) * 100) / 100,
      glitchRepeat: Math.round(2 + 6 * y),
    }),
  },
]

export const touchMode = (name: string | null): TouchMode =>
  TOUCH_MODES.find(m => m.name === name) ?? TOUCH_MODES[0]!

export const nextMode = (mode: TouchMode): TouchMode =>
  TOUCH_MODES[(TOUCH_MODES.indexOf(mode) + 1) % TOUCH_MODES.length]!

export function touchPush(
  mode: TouchMode,
  x: number,
  y: number,
  c: Controls,
): Partial<Controls> {
  return mode.push(clamp01(x), clamp01(y), c)
}

export interface Tilt {
  beta: number
  gamma: number
}

const TILT_SPAN = 50

/** A tilt as a point on the stage, measured from where the phone sat when tilt
    came on: tipping right moves across, tipping the top away moves up. */
export const tiltPoint = (now: Tilt, rest: Tilt) => ({
  x: clamp01(0.5 + (now.gamma - rest.gamma) / TILT_SPAN),
  y: clamp01(0.5 + (rest.beta - now.beta) / TILT_SPAN),
})
