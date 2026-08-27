import { IDX } from '../engine/params'
import { BLOCK } from './stage'
import type { TriggerBus } from './trigbus'
import { Chaos, Drunk } from './util/drift'
import { Decay, Follower, coef } from './util/follower'
import { wrap1 } from './util/pitch'
import { mulberry32, type Rng } from './util/rng'

// Where a patch wire can land. Ids match the mod*Dest choices.
export const DEST = {
  filtHz: 0,
  ringHz: 1,
  combHz: 2,
  crushHz: 3,
  chipClock: 4,
  retrig: 5,
  tapeSpeed: 6,
  glitch: 7,
  fbAmt: 8,
  stompDrive: 9,
  shiftHz: 10,
  bits: 11,
  drumCross: 12,
  starve: 13,
  drumTune: 14,
  revDecay: 15,
  delayMs: 16,
  wDepth0: 17,
  wDepth1: 18,
  wDepth2: 19,
  wDepth3: 20,
  // Past the depth lanes rather than before them: an id is what a saved board
  // and a shared link name a destination by, so a lane added in the middle
  // would land every wire on this board's neighbour of the one it was patched
  // to. New lanes go on the end, wherever the end happens to be.
  echoMs: 21,
  // The tape's own three. Everything else on the board dives with the rail and
  // the sampler did not — it was the one source with a speed control nothing in
  // the bay could reach, so a starve took the toy, the kit and the FM chip down
  // and left the tape running at exactly the speed you set it.
  sampleSpeed: 22,
  loopSlide: 23,
  loopSpan: 24,
} as const
export const N_DEST = 25

// The lanes a wire can land on that aren't a stage: another wire's own depth,
// in wire order, so wire i's depth is DEPTH_DEST[i]. They were once the last
// four ids and a depth lane was anything at or past the first of them; they are
// four contiguous ids now, and asked for by name.
const DEPTH_DEST = [
  DEST.wDepth0,
  DEST.wDepth1,
  DEST.wDepth2,
  DEST.wDepth3,
] as const
const onDepth = (dest: number) => dest >= DEST.wDepth0 && dest <= DEST.wDepth3

// Ids match the mod*Src choices.
const SRC = {
  off: 0,
  lfo: 1,
  supply: 2,
  env: 3,
  mic: 4,
  bodyX: 5,
  bodyY: 6,
  fb: 7,
  rom: 8,
  drum: 9,
  key: 10,
  heat: 11,
}

const WIRES = [
  [IDX.mod0Src, IDX.mod0Dest, IDX.mod0Depth],
  [IDX.mod1Src, IDX.mod1Dest, IDX.mod1Depth],
  [IDX.mod2Src, IDX.mod2Dest, IDX.mod2Depth],
  [IDX.mod3Src, IDX.mod3Dest, IDX.mod3Depth],
] as const

function lfoShape(phase: number, shape: number, sh: number): number {
  switch (shape) {
    case 1:
      return 2 * phase - 1
    case 2:
      return phase < 0.5 ? 1 : -1
    case 3:
      return sh
    default:
      return Math.sin(phase * 2 * Math.PI)
  }
}

export interface ModSources {
  mic: Float32Array
  droop: Float32Array
  env: Float32Array
  fb: Float32Array
  step: Float32Array
  trig: TriggerBus
  heat: number
}

// The patch bay: two wires, each soldered from a source onto a destination
// parameter. Stages ask for their lane and get null when nothing is wired
// there, so an unpatched board runs exactly as it did before.
export class ModBus {
  private readonly lanes: Float32Array[] = []
  private readonly live = new Uint8Array(N_DEST)
  private readonly lfo = new Float32Array(BLOCK)
  private readonly micEnv = new Float32Array(BLOCK)
  // One per wire: two wires picking up the same held value would otherwise
  // share a buffer, and the second would overwrite what the first is about to
  // read.
  private readonly held = WIRES.map(() => new Float32Array(BLOCK))
  // What each wire picked up this block, in a field the bus keeps: build() runs
  // 375 times a second, and a fresh array and closure each time is work the
  // audio thread does not have to do.
  private readonly picks: (Float32Array | null)[] = WIRES.map(() => null)
  // A trigger line is a spike one sample wide; an envelope follower would barely
  // notice one. These snap up to the hit and fall from there, so a wire off the
  // kit or off the keys pushes what it is soldered to on every hit.
  private readonly drumEnv = new Float32Array(BLOCK)
  private readonly keyEnv = new Float32Array(BLOCK)
  private lfoPhase = 0
  private shValue = 0
  private mic = new Follower()
  private drumHit = new Decay()
  private keyHit = new Decay()
  private chaos = new Chaos()
  private drunk = new Drunk()
  private rng: Rng

  constructor(
    private readonly sr: number,
    seed = 808,
  ) {
    for (let i = 0; i < N_DEST; i++) this.lanes.push(new Float32Array(BLOCK))
    this.rng = mulberry32(seed)
  }

  read(dest: number): Float32Array | null {
    return this.live[dest] ? this.lanes[dest]! : null
  }

  // Sources are sampled where they are cheapest to reach: supply droop, output
  // envelope and the feedback bus are a block old, the LFO, mic and body pad
  // are current. A block is 2.7 ms — under the resolution of every wire here.
  build(n: number, p: Float32Array, src: ModSources) {
    this.live.fill(0)
    const hz = p[IDX.modLfoHz]!
    const shape = Math.round(p[IDX.modLfoShape]!)
    const attack = coef(0.005, this.sr)
    const release = coef(0.12, this.sr)
    const fall = Math.exp(-1 / (0.12 * this.sr))
    for (let i = 0; i < n; i++) {
      const prev = this.lfoPhase
      this.lfoPhase = wrap1(this.lfoPhase + hz / this.sr)
      if (this.lfoPhase < prev) this.shValue = this.rng() * 2 - 1
      this.lfo[i] =
        shape === 4
          ? this.chaos.step(hz, this.sr)
          : shape === 5
            ? this.drunk.step(hz, this.sr, this.rng)
            : lfoShape(this.lfoPhase, shape, this.shValue)
      this.micEnv[i] = Math.min(
        this.mic.process(src.mic[i]!, attack, release) * 2,
        1,
      )
      this.drumEnv[i] = this.drumHit.process(
        Math.min(src.trig.drumGain[i]!, 1),
        fall,
      )
      this.keyEnv[i] = this.keyHit.process(src.trig.key[i]! > 0 ? 1 : 0, fall)
    }

    // What each wire picks up, before anything decides how hard it pushes. All
    // are resolved first because any may be the thing that sets another's
    // depth, and a wire that only worked in one direction would make the pair
    // an ordering rule rather than a pair.
    const picks = this.picks
    for (let w = 0; w < WIRES.length; w++) {
      const from = Math.round(p[WIRES[w]![0]]!)
      picks[w] = from === SRC.off ? null : this.pick(from, w, n, p, src)
    }

    // Depth lanes first, so a wire's own depth is settled before it lands.
    for (let w = 0; w < WIRES.length; w++) {
      const [, destIdx, depthIdx] = WIRES[w]!
      const dest = Math.round(p[destIdx]!)
      if (picks[w] && onDepth(dest)) {
        this.add(dest, n, p[depthIdx]!, picks[w]!, null)
      }
    }

    for (let w = 0; w < WIRES.length; w++) {
      const [, destIdx, depthIdx] = WIRES[w]!
      const dest = Math.round(p[destIdx]!)
      const depth = p[depthIdx]!
      const mod = this.read(DEPTH_DEST[w]!)
      if (!picks[w] || dest < 0 || dest >= N_DEST || onDepth(dest)) continue
      if (depth === 0 && !mod) continue
      this.add(dest, n, depth, picks[w]!, mod)
    }
  }

  private add(
    dest: number,
    n: number,
    depth: number,
    wire: Float32Array,
    depthMod: Float32Array | null,
  ) {
    const lane = this.lanes[dest]!
    if (!this.live[dest]) {
      lane.fill(0, 0, n)
      this.live[dest] = 1
    }
    for (let i = 0; i < n; i++) {
      const d = depthMod
        ? Math.min(Math.max(depth + depthMod[i]!, -2), 2)
        : depth
      lane[i]! += d * wire[i]!
    }
  }

  private pick(
    from: number,
    wire: number,
    n: number,
    p: Float32Array,
    src: ModSources,
  ): Float32Array {
    switch (from) {
      case SRC.supply:
        return src.droop
      case SRC.env:
        return src.env
      case SRC.mic:
        return this.micEnv
      case SRC.fb:
        return src.fb
      case SRC.rom:
        return src.step
      case SRC.drum:
        return this.drumEnv
      case SRC.key:
        return this.keyEnv
      case SRC.heat:
      case SRC.bodyX:
      case SRC.bodyY: {
        const held = this.held[wire]!
        held.fill(
          from === SRC.heat
            ? src.heat
            : p[from === SRC.bodyX ? IDX.bodyX : IDX.bodyY]!,
          0,
          n,
        )
        return held
      }
      default:
        return this.lfo
    }
  }

  panic() {
    this.live.fill(0)
    this.lfoPhase = 0
    this.shValue = 0
    this.mic.reset()
    this.drumHit.reset()
    this.keyHit.reset()
    this.chaos.reset()
    this.drunk.reset()
  }
}
