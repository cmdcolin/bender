import { afterAll, expect, test, vi } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { ROCK } from '../drums.ts'
import { packParams } from '../engine/params.ts'
import { OWNER_BY_KEY } from '../ui/controls/index.ts'
import { wildBoard } from '../ui/wild.ts'
import { buildBender } from './build.ts'
import { BLOCK } from './stage.ts'
import { ENS_MODE } from './stages/ensemble.ts'
import { peaksOf } from './stages/sampler.ts'
import { makeIo, sine } from './testRender.ts'

import type { ToWorklet } from '../engine/messages.ts'

import { GCProfiler, getHeapStatistics } from 'node:v8'

const SR = 48000

interface Allocation {
  what: string
  stack: string
}

class FakePort {
  onmessage: ((e: { data: ToWorklet }) => void) | null = null
  posted = 0
  postMessage() {
    this.posted++
  }
  send(msg: ToWorklet) {
    if (this.onmessage) this.onmessage({ data: msg })
    else throw new Error('the worklet never took its port')
  }
}

const GLOBAL_CONSTRUCTORS = [
  'Array',
  'ArrayBuffer',
  'SharedArrayBuffer',
  'DataView',
  'Float32Array',
  'Float64Array',
  'Int8Array',
  'Int16Array',
  'Int32Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Uint16Array',
  'Uint32Array',
  'BigInt64Array',
  'BigUint64Array',
  'Map',
  'Set',
  'Promise',
]

function copyingMethods(): [object, string, string[]][] {
  const typedArray: object = Object.getPrototypeOf(Float32Array.prototype)
  return [
    [
      typedArray,
      'TypedArray',
      ['subarray', 'slice', 'map', 'filter', 'toSorted', 'toReversed', 'with'],
    ],
    [
      Array.prototype,
      'Array',
      [
        'slice',
        'splice',
        'map',
        'filter',
        'concat',
        'flat',
        'flatMap',
        'toSorted',
        'toReversed',
        'toSpliced',
        'with',
      ],
    ],
    [Array, 'Array', ['from', 'of']],
    [Object, 'Object', ['keys', 'values', 'entries', 'fromEntries', 'assign']],
    [Function.prototype, 'Function', ['bind']],
    [String.prototype, 'String', ['split']],
  ]
}

// Every constructor that hands back a fresh buffer or collection, and every
// method that copies into one, swapped for a proxy that writes down who called
// it. A bare `new Float32Array` resolves the global when it runs rather than
// when its module loaded, so a proxy on globalThis sees every one of them.
function allocationsDuring(run: () => void): Allocation[] {
  const found: Allocation[] = []
  let noting = false
  const note = (what: string) => {
    if (!noting) {
      noting = true
      found.push({ what, stack: String(new Error().stack) })
      noting = false
    }
  }
  const restore: (() => void)[] = []
  const patch = (owner: object, key: string, label: string) => {
    const saved = Object.getOwnPropertyDescriptor(owner, key)
    const original: unknown = saved?.value
    if (saved && typeof original === 'function') {
      const counted = new Proxy(original, {
        construct(target, args, newTarget) {
          note(`new ${label}`)
          return Reflect.construct(target, args, newTarget)
        },
        apply(target, self, args) {
          note(label)
          return Reflect.apply(target, self, args)
        },
      })
      Object.defineProperty(owner, key, { ...saved, value: counted })
      restore.push(() => Object.defineProperty(owner, key, saved))
    }
  }
  for (const [owner, where, keys] of copyingMethods())
    for (const key of keys) patch(owner, key, `${where}.${key}`)
  for (const name of GLOBAL_CONSTRUCTORS) patch(globalThis, name, name)
  try {
    run()
  } finally {
    for (let i = restore.length - 1; i >= 0; i--) restore[i]!()
  }
  return found
}

test('the counter sees an allocation made by a module loaded before it', () => {
  const before = Float32Array
  const found = allocationsDuring(() => {
    makeIo()
    new Float32Array(4).subarray(1)
    ;[1, 2].map(x => x)
  })
  expect(found.map(a => a.what)).toEqual([
    'new Float32Array',
    'new Float32Array',
    'new Float32Array',
    'TypedArray.subarray',
    'Array.map',
  ])
  expect(Float32Array).toBe(before)
})

// The worklet as the browser runs it, with a port that only counts what is
// posted on it. Loaded once: registering is what the module does on import.
async function processorClass() {
  const ports: FakePort[] = []
  class FakeProcessor {
    readonly port = new FakePort()
    constructor() {
      ports.push(this.port)
    }
  }
  const registered: (new () => AudioWorkletProcessor)[] = []
  vi.stubGlobal('sampleRate', SR)
  vi.stubGlobal('AudioWorkletProcessor', FakeProcessor)
  vi.stubGlobal(
    'registerProcessor',
    (_name: string, ctor: new () => AudioWorkletProcessor) =>
      registered.push(ctor),
  )
  await import('./worklet.ts')
  const Processor = registered[0]
  if (!Processor) throw new Error('the worklet registered no processor')
  return () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(0x5eed)
    const processor = new Processor()
    const port = ports.at(-1)
    if (!port) throw new Error('the processor took no port')
    return { processor, port }
  }
}

// Every stage on the board awake at once: the four sources and the chips on
// their keys, the bends, the pedals, the desk, the faults, the tape at the
// end, the sampler threading and recording a reel, a track of the four-track
// armed, four wires in the bay and both lanes stepping.
const EVERYTHING: Partial<Controls> = {
  ...ROCK,
  chipLevel: 0.6,
  chipAccomp: 1,
  chipStarve: 0.3,
  drumLevel: 0.6,
  drumRom: 1,
  drumWander: 0.5,
  drumEvent3: 2,
  drumEventEvery: 1,
  fmLevel: 0.5,
  pcmLevel: 0.5,
  pcmEnv: 2,
  pcmVibrato: 1,
  monoLevel: 0.5,
  monoEmph: 0.9,
  monoLoop: 0.5,
  oscLevel: 0.3,
  noiseLevel: 0.2,
  crackleAmp: 0.3,
  micLevel: 0.4,
  sampleLevel: 0.5,
  loopRec: 0.8,
  loopSecs: 1.5,
  loopWear: 0.3,
  loopHiss: 0.3,
  loopHold: 0.5,
  fourLevel: 0.6,
  fourDbx: 1,
  fourWear: 0.3,
  fourBattery: 0.3,
  fourAux: 0.5,
  four1Rec: 1,
  four1Fader: 0.8,
  four2Fader: 0.6,
  four2Send: 0.5,
  ringMix: 0.4,
  crushMix: 0.4,
  subLevel: 0.4,
  distMix: 0.4,
  combMix: 0.3,
  glitchMix: 0.4,
  filtMix: 0.4,
  shiftMix: 0.4,
  shiftFb: 0.4,
  octMix: 0.4,
  codecMix: 0.4,
  rackMix: 0.4,
  stompMix: 0.4,
  stompSag: 0.5,
  dlyMix: 0.3,
  flutter: 0.5,
  wowDepthMs: 3,
  echoLevel: 0.3,
  revMix: 0.4,
  ensMix: 0.4,
  ensMode: ENS_MODE.flange,
  ensFeedback: 0.9,
  ampMix: 0.4,
  ampGain: 0.7,
  fbAmt: 0.4,
  fb2Amt: 0.3,
  fb3Amt: 0.3,
  fbCross: 0.3,
  fbSag: 0.3,
  brownAmt: 0.4,
  brownCrackle: 0.3,
  humLevel: 0.3,
  couple: 0.5,
  tapeMix: 0.4,
  tapeWow: 0.5,
  tapeFlutter: 0.5,
  tapeDrop: 0.3,
  tapePrint: 0.5,
  heatAmt: 0.5,
  faultCluster: 0.5,
  jointChatter: 0.3,
  relayRate: 0.3,
  gndBounce: 0.3,
  deckSpeed: 0.85,
  arcDepth: 1,
  mod0Src: 1,
  mod0Dest: 0,
  mod1Src: 12,
  mod1Dest: 1,
  mod2Src: 13,
  mod2Dest: 22,
  mod3Src: 15,
  mod3Dest: 16,
  modEnvGate: 1,
  modLaneA0: 0.8,
  modLaneA5: -0.6,
  modLaneA9: 0.4,
  modLaneB2: 0.7,
  modLaneB11: -0.9,
}

// Six slots for ten bends, so two boards between them seat every one.
const FIRST_BENDS: Partial<Controls> = {
  bendSlot0: 1,
  bendSlot1: 2,
  bendSlot2: 3,
  bendSlot3: 4,
  bendSlot4: 5,
  bendSlot5: 6,
}
const LAST_BENDS: Partial<Controls> = {
  bendSlot0: 7,
  bendSlot1: 8,
  bendSlot2: 9,
  bendSlot3: 10,
  bendSlot4: 1,
  bendSlot5: 6,
}

// What the main thread sends while a board plays, in the order a hand might.
// Built up front, because a message arrives already built: the clone that
// carries it across is the platform's, not the block's.
function gestures(board: Controls): ToWorklet[] {
  const nudged = packParams({ ...board, ringHz: board.ringHz * 1.5 })
  const pack = packParams(board)
  const wild = wildBoard(board, 3, new Set(OWNER_BY_KEY.values()))
  const clip = sine(110, 0.5)
  return [
    { kind: 'sample', mono: clip, peaks: peaksOf(clip) },
    { kind: 'params', pack: nudged },
    { kind: 'noteOn', semitone: 3, dest: 'toy', gain: 1 },
    { kind: 'noteOn', semitone: 5, dest: 'fm', gain: 0.8 },
    { kind: 'noteOn', semitone: 7, dest: 'pcm', gain: 0.6 },
    { kind: 'noteOn', semitone: 9, dest: 'mono', gain: 1 },
    { kind: 'drumHit', bits: 0b101, gain: 1, skipTick: 1 << 20 },
    { kind: 'sfx', sfx: 2, on: true, dest: 'toy' },
    { kind: 'sfx', sfx: 1, on: true, dest: 'fm' },
    { kind: 'wild', wild },
    { kind: 'params', pack },
    { kind: 'seek', frac: 0.4 },
    { kind: 'noteOff', semitone: 3, dest: 'toy' },
    { kind: 'noteOff', semitone: 5, dest: 'fm' },
    { kind: 'noteOff', semitone: 7, dest: 'pcm' },
    { kind: 'noteOff', semitone: 9, dest: 'mono' },
    { kind: 'sfx', sfx: 2, on: false, dest: 'toy' },
    { kind: 'sfx', sfx: 1, on: false, dest: 'fm' },
    { kind: 'retroFlush' },
    { kind: 'closeTake' },
    { kind: 'undoTake' },
    { kind: 'undoTake' },
    { kind: 'fourBlank' },
    { kind: 'record', on: false },
    { kind: 'record', on: true, stems: true },
    { kind: 'transport', tune: false, drums: true },
    { kind: 'transport', tune: true, drums: true },
    { kind: 'wild', wild: null },
    { kind: 'panic' },
  ]
}

const SECONDS = process.env.BENDER_FULL ? 6 : 2
const GARBAGE_WARM_SECONDS = 6
const GARBAGE_SECONDS = 6
const GARBAGE_BUDGET_MB = 250
const GESTURE_EVERY = 12

type Make = Awaited<ReturnType<typeof processorClass>>

function rig(make: Make, overrides: Partial<Controls>) {
  const board: Controls = { ...DEFAULT_CONTROLS, ...EVERYTHING, ...overrides }
  const { processor, port } = make()
  const mic = [new Float32Array(BLOCK), new Float32Array(BLOCK)]
  const out = [new Float32Array(BLOCK), new Float32Array(BLOCK)]
  const inputs = [mic]
  const outputs = [out]
  const opening: ToWorklet[] = [
    { kind: 'transport', tune: true, drums: true },
    { kind: 'params', pack: packParams(board) },
    { kind: 'record', on: true, stems: true },
  ]
  const said = gestures(board)
  let frame = 0
  let blocks = 0
  const block = () => {
    for (let i = 0; i < BLOCK; i++) {
      const t = (frame + i) / SR
      mic[0]![i] = 0.4 * Math.sin(2 * Math.PI * 220 * t)
      mic[1]![i] = 0.3 * Math.sin(2 * Math.PI * 331 * t)
    }
    processor.process(inputs, outputs, {})
    frame += BLOCK
    blocks++
    if (blocks % GESTURE_EVERY === 0)
      port.send(said[(blocks / GESTURE_EVERY) % said.length]!)
  }
  const render = (seconds: number) => {
    for (let b = 0; b < (seconds * SR) / BLOCK; b++) block()
  }
  const open = () => {
    for (const msg of opening) port.send(msg)
  }
  return { open, render, out, port }
}

// From the first message on: a stage that sets itself up the first time it is
// used is setting itself up on the audio thread.
function playing(make: Make, overrides: Partial<Controls>) {
  const { open, render, out, port } = rig(make, overrides)
  const found = allocationsDuring(() => {
    open()
    render(SECONDS)
  })
  return { found, out, port }
}

// Every byte the heap took on while a warm board rendered, collected or not:
// what each collection found, less what the one before it left, plus the ends.
function garbagePerSecond(make: Make, overrides: Partial<Controls>) {
  const { open, render } = rig(make, overrides)
  open()
  render(GARBAGE_WARM_SECONDS)
  const profiler = new GCProfiler()
  const startedAt = getHeapStatistics().used_heap_size
  profiler.start()
  render(GARBAGE_SECONDS)
  const endedAt = getHeapStatistics().used_heap_size
  const profiled = profiler.stop()
  if (!profiled) throw new Error('the gc profiler never started')
  let bytes = 0
  let from = startedAt
  for (const gc of profiled.statistics) {
    bytes += gc.beforeGC.heapStatistics.usedHeapSize - from
    from = gc.afterGC.heapStatistics.usedHeapSize
  }
  bytes += endedAt - from
  return bytes / GARBAGE_SECONDS
}

const frames = ({ stack }: Allocation) =>
  stack
    .split('\n')
    .filter(line => line.includes('/src/') && !line.includes('alloc.test'))
    .slice(0, 4)
    .map(line => line.trim())

const ALLOWED = {
  samplerThreadsABlankReelAsAViewOntoTheOneLaidBy: {
    what: 'TypedArray.subarray',
    at: 'Sampler.thread',
  },
  samplerCutsAClosedTakeAsAViewOntoTheReel: {
    what: 'TypedArray.subarray',
    at: 'Sampler.closeTake',
  },
}

const excuse = (found: Allocation) =>
  Object.entries(ALLOWED).find(
    ([, { what, at }]) =>
      found.what === what && frames(found)[0]?.startsWith(`at ${at} `),
  )?.[0]

// Who did it, by the first frames of the board's own code under the call.
function report(found: Allocation[]) {
  const excused = new Set<string>()
  const unexplained = new Set<string>()
  for (const a of found) {
    const name = excuse(a)
    if (name) excused.add(name)
    else unexplained.add([a.what, ...frames(a)].join('\n  '))
  }
  return { excused: [...excused].toSorted(), unexplained: [...unexplained] }
}

const make = await processorClass()

afterAll(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// What the board under test is worth: a stage it leaves asleep is a stage
// whose allocations nobody is counting.
function woken(overrides: Partial<Controls>) {
  const built = buildBender(SR)
  built.transport.tune = true
  built.transport.drums = true
  const { chain } = built
  const stages = [
    ...chain.sources,
    ...chain.bendById.filter(s => s !== undefined),
    ...chain.pedals,
    ...chain.post,
  ]
  const ran = new Set<string>()
  for (const stage of stages) {
    const run = stage.process.bind(stage)
    stage.process = (io, p, ctx) => {
      ran.add(stage.label)
      run(io, p, ctx)
    }
  }
  const p = packParams({ ...DEFAULT_CONTROLS, ...EVERYTHING, ...overrides })
  const io = makeIo()
  for (let b = 0; b < (0.1 * SR) / BLOCK; b++) chain.process(io, p)
  return { all: stages.map(s => s.label), ran }
}

test('between them the two boards wake every stage there is', () => {
  const first = woken(FIRST_BENDS)
  const last = woken(LAST_BENDS)
  const ran = new Set([...first.ran, ...last.ran])
  expect(first.all.filter(label => !ran.has(label))).toEqual([])
})

test('a board with everything on allocates nothing from its first block', () => {
  const { found, out, port } = playing(make, FIRST_BENDS)
  const { excused, unexplained } = report(found)
  expect(unexplained).toEqual([])
  expect(excused).toEqual(Object.keys(ALLOWED).toSorted())
  expect(out[0]!.every(v => Number.isFinite(v))).toBe(true)
  expect(port.posted).toBeGreaterThan(0)
})

test('nor with the other four bends in the slots', () => {
  const { found } = playing(make, LAST_BENDS)
  expect(report(found).unexplained).toEqual([])
})

// Nearly all of it is doubles boxed where TurboFan ran out of inlining budget
// and called a helper instead, so it moves with the JIT rather than with any
// one allocation the counter above could catch. Both boards measured 135-155
// MB a second in Node 24; the budget is there to catch a stage falling off a
// cliff, not a few calls more.
test.runIf(process.env.BENDER_FULL)(
  'a warm board makes no more than its budget of garbage a second',
  () => {
    for (const bends of [FIRST_BENDS, LAST_BENDS]) {
      const mb = garbagePerSecond(make, bends) / 1e6
      expect(Math.round(mb), 'MB a second').toBeLessThan(GARBAGE_BUDGET_MB)
    }
  },
)
