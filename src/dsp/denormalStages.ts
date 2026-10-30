import { expect, test } from 'vitest'

import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../controls.ts'
import { ROCK } from '../drums.ts'
import { packParams } from '../engine/params.ts'
import {
  BENDS,
  GROUPS,
  HOLD_KEYS,
  type Group,
  type SliderDef,
} from '../ui/controls/index.ts'
import { buildBender } from './build.ts'
import { BLOCK, type StereoBlock } from './stage.ts'
import { SMALLEST_NORMAL, tinyValues, type Tiny } from './testSubnormals.ts'
import { mulberry32, type Rng } from './util/rng.ts'

// Each stage struck on its own and left alone, its whole state then searched
// for a value come to rest in subnormal range.
//
// Nothing flushDenormal looks after sits under 1e-15, so a value under FALLING
// that is still shrinking is a decay nobody flushes, on its way down. The run
// lasts until anything with a time constant up to SLOWEST_TAU_S has had time to
// fall that far, then follows whatever is falling to where it stops: zero, or
// a subnormal that the pole's own rounding holds there for ever.
//
// A tank of Float32Arrays can hum for ever at float32 subnormal size, held
// there by float32 rounding. That costs nothing, since the arithmetic on it is
// in doubles, where it is normal; but it jitters, so it cannot be told from a
// decay while it sits in that band. A decay passing through gets the time it
// takes to cross the band instead. The hum's sums can cancel below the band
// and jitter there, so a value counts as falling only once it has shrunk at
// the same place SHRINKS scans running, which a decay does every scan.
const SHRINKS = 3
const FALLING = 1e-20
const SLOWEST_TAU_S = 1
const SCAN_EVERY = 64
const F32_BAND_TOP = 1.1754943508222875e-38
const F32_BAND_FLOOR = 1e-46
const blocksFor = (from: number, to: number, sr: number) =>
  Math.ceil((Math.log(from / to) * SLOWEST_TAU_S * sr) / BLOCK)
const KEY = 7
const parked = (tiny: Tiny[]) =>
  tiny.filter(t => Math.abs(t.value) < SMALLEST_NORMAL)
const inF32Band = (v: number) =>
  Math.abs(v) < F32_BAND_TOP && Math.abs(v) >= F32_BAND_FLOOR

const STRUCK: Partial<Controls> = {
  ...ROCK,
  chipAccomp: 1,
  drumLevel: 0.6,
  micLevel: 1,
}

interface Rig {
  name: string
  hot: Partial<Controls>
  /** Knobs turned back to stock once the input stops. */
  cold: Partial<Controls>
}

function settle({ hot, cold }: Rig, sr: number) {
  const settleBlocks = blocksFor(1, FALLING, sr)
  const followBlocks = blocksFor(FALLING, SMALLEST_NORMAL, sr)
  const crossBandBlocks = blocksFor(F32_BAND_TOP, F32_BAND_FLOOR, sr)
  const built = buildBender(sr, 7)
  const io: StereoBlock = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const mic = new Float32Array(BLOCK)
  const noise = mulberry32(99)
  built.transport.tune = true
  built.transport.drums = true
  built.toyChip.noteOn(KEY)
  const struck = packParams({ ...DEFAULT_CONTROLS, ...STRUCK, ...hot })
  for (let b = 0; b < (2 * sr) / BLOCK; b++) {
    for (let i = 0; i < BLOCK; i++) mic[i] = noise() - 0.5
    built.chain.process(io, struck, mic)
  }
  built.noteOff(KEY)
  built.transport.tune = false
  built.transport.drums = false
  const quiet = packParams({ ...DEFAULT_CONTROLS, ...STRUCK, ...hot, ...cold })
  let was = new Map<string, { value: number; shrinks: number }>()
  const scan = () => {
    const tiny = tinyValues(built, 'bender', FALLING)
    const now = new Map(
      tiny.map(t => {
        const before = was.get(t.path)
        const shrank =
          before !== undefined &&
          !inF32Band(t.value) &&
          Math.abs(t.value) < Math.abs(before.value)
        const shrinks = shrank ? before.shrinks + 1 : 0
        return [t.path, { value: t.value, shrinks }]
      }),
    )
    was = now
    const falling = tiny.filter(t => now.get(t.path)!.shrinks >= SHRINKS)
    return { stuck: parked(tiny), falling }
  }
  let now = scan()
  let blocks = 0
  let lastFell = 0
  while (
    now.stuck.length === 0 &&
    (blocks < settleBlocks ||
      (blocks - lastFell <= crossBandBlocks &&
        blocks < settleBlocks + followBlocks))
  ) {
    for (let b = 0; b < SCAN_EVERY; b++) built.chain.process(io, quiet)
    blocks += SCAN_EVERY
    now = scan()
    if (now.falling.length > 0) lastFell = blocks
  }
  const at = `${((blocks * BLOCK) / sr).toFixed(1)} s`
  return now.stuck.length > 0
    ? now.stuck.map(t => `${t.path} = ${t.value} at ${at}`)
    : now.falling.map(t => `${t.path} = ${t.value} still falling at ${at}`)
}

// The decays that were found parked once already, each struck the one way that
// wakes it.
const WAKE: Rig[] = [
  {
    name: 'octave bounce crossfade on the note clock',
    hot: { bendSlot0: 8, octMix: 1, octBounce: 2, octClock: 1 },
    cold: {},
  },
  {
    name: 'octave bounce crossfade on the step clock',
    hot: { bendSlot0: 8, octMix: 1, octBounce: 2, octClock: 2 },
    cold: {},
  },
  {
    name: 'rack verb damping',
    hot: {
      bendSlot0: 10,
      rackMix: 1,
      rackDamp: 0.9,
      rackDecay: 0.3,
      rackBits: 16,
    },
    cold: {},
  },
  { name: 'brownout kick pump', hot: { brownKick: 1 }, cold: {} },
  {
    name: 'mod envelope onto a sustain of nothing',
    hot: {
      mod0Src: 15,
      mod0Dest: 0,
      mod0Depth: 1,
      modEnvGate: 2,
      modEnvDecay: 5,
      modEnvSustain: 0,
      modEnvHold: 16,
    },
    cold: {},
  },
]

const roll = (def: SliderDef, rng: Rng) => {
  const r = rng()
  const span = def.max - def.min
  const value = r < 0.15 ? def.min : r < 0.3 ? def.max : def.min + rng() * span
  return def.choices ? Math.round(value) : value
}

// Every group on the panel, its own knobs rolled at random and its mix or level
// up: one take left alone with the knobs where they landed, one with them
// turned back down, so a stage nobody wrote a rig for is still struck.
function rolled(group: Group, seed: number): Partial<Controls> {
  const rng = mulberry32(seed)
  const bend = BENDS.findIndex(b => b.group === group.name)
  const c: Partial<Controls> = bend >= 0 ? { bendSlot0: bend + 1 } : {}
  for (const def of group.sliders) {
    if (!HOLD_KEYS.has(def.key)) {
      c[def.key] = def.role ? def.max : roll(def, rng)
    }
  }
  return c
}

const stock = (hot: Partial<Controls>, group: Group) => {
  const c: Partial<Controls> = {}
  for (const def of group.sliders) {
    const key: ControlKey = def.key
    if (!def.role && key in hot) c[key] = DEFAULT_CONTROLS[key]
  }
  return c
}

const ROLLS: Rig[] = GROUPS.flatMap((group, g) => {
  const held = rolled(group, 0x5e7 + g)
  const dropped = rolled(group, 0xd0e + g)
  return [
    { name: `${group.name}, rolled and left`, hot: held, cold: {} },
    {
      name: `${group.name}, rolled and turned back down`,
      hot: dropped,
      cold: stock(dropped, group),
    },
  ]
})

// Minutes of CPU across the lot, so `pnpm test` skips these and `pnpm denormal`
// runs them, a file per rate so the rates run side by side.
export function stageRigs(sr: number) {
  test.skipIf(!process.env.DENORMAL).each([...WAKE, ...ROLLS])(
    'left alone, $name settles out of denormal range',
    rig => {
      expect(settle(rig, sr)).toEqual([])
    },
    (sr / 8000) * 120_000,
  )
}
