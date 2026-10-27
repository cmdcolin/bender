import { VOICE_LABELS, voiceBit } from '../drums.ts'
import { IDX, type SOURCE_TAPS } from '../engine/params.ts'
import {
  asLaneLen,
  asLaneValue,
  LANE_KEYS,
  LANE_LEN_KEYS,
  LANE_MAX,
} from '../lanes.ts'
import { BLOCK } from './stage.ts'
import { Adsr, adsrRates } from './util/adsr.ts'
import { Chaos, Drunk } from './util/drift.ts'
import { Decay, Follower, coef } from './util/follower.ts'
import { wrap1 } from './util/pitch.ts'
import { mulberry32, type Rng } from './util/rng.ts'

import type { TriggerBus } from './trigbus.ts'

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
  // The oscillator's own starve pot, which is not the one above it. `starve` is
  // the toy's supply and reaches the three chips hanging off it; the chaos osc
  // runs off its own supply and was the last source in the bay with a knob no
  // wire could turn.
  oscStarve: 25,
  // And its pitch. Every other pitched thing on the board has had a lane since
  // the bay was built — the toy's clock, the kit's tune, the capstan, the comb,
  // the carrier, the shifter — and the one source that is nothing but two
  // oscillator frequencies had none, so the only way to move it was a hand.
  oscHz: 26,
  chipLevel: 27,
  drumLevel: 28,
  fmLevel: 29,
  oscLevel: 30,
  noiseLevel: 31,
  sampleLevel: 32,
  filtRes: 33,
  fmBright: 34,
  fbMs: 35,
  chipDataLine: 36,
  chipDataFault: 37,
  chipAddrLine: 38,
  chipAddrFault: 39,
  drumDataLine: 40,
  drumDataFault: 41,
  drumAddrLine: 42,
  drumAddrFault: 43,
  fmDataLine: 44,
  fmDataFault: 45,
  fmAddrLine: 46,
  fmAddrFault: 47,
  fmWaveLine: 48,
  fmWaveFault: 49,
  fmWaveDataLine: 50,
  fmWaveDataFault: 51,
  // How far through the trace the knife went, and how far across the table's
  // pins the blob of solder ran. Every other lane here moves something the
  // board was built to move; neither of these is a setting the factory
  // shipped.
  fmBusCut: 52,
  fmNoiseBlob: 53,
  // The ring mod's dry/wet, which is the carrier's own depth rather than a
  // balance beside it. A wire here is a VCA on the carrier: a drum hit clangs
  // every kick and fades back to the clean note, and the output envelope means
  // only the loud passages ring at all.
  ringMix: 54,
  // Seven ids a retired source once held. Nothing reads them, so a wire left
  // pointing here lands on nothing; the ids stay so that every later one keeps
  // its number.
  gone55: 55,
  gone56: 56,
  gone57: 57,
  gone58: 58,
  gone59: 59,
  gone60: 60,
  gone61: 61,
  drumBpm: 62,
  drumSwing: 63,
  drumChance: 64,
  drumDecay: 65,
  drumRing: 66,
  dlyLoopHz: 67,
  // Outside the chain altogether: the deck the whole board is printed to, so a
  // wire here drags the machine playing everything above it back rather than
  // any one stage on it.
  deckSpeed: 68,
  // The ensemble's sweep, which is the one thing on that pedal a hand alone
  // cannot move in time with anything else.
  ensRate: 69,
  // The home keyboard's fader and its two buses, after the deck and the
  // ensemble because they landed after them.
  pcmLevel: 70,
  pcmAddrLine: 71,
  pcmAddrFault: 72,
  pcmDataLine: 73,
  pcmDataFault: 74,
  monoLevel: 75,
  monoCutoff: 76,
  monoEmph: 77,
  monoPitch: 78,
  // The toy chip's pins, its envelope cap, its key matrix and the knives on its
  // song and divider wires.
  chipCrosstalk: 79,
  chipScan: 80,
  chipPwm: 81,
  chipShort: 82,
  chipEnvCap: 83,
  chipGhost: 84,
  chipLoopFrom: 85,
  chipLoopTo: 86,
  chipBankLine: 87,
  chipBankFault: 88,
  chipDivLine: 89,
  chipDivFault: 90,
  fmPatchLine: 91,
  fmPatchFault: 92,
  fmPatchDataLine: 93,
  fmPatchDataFault: 94,
  fmClock: 95,
  fmCpuClock: 96,
  revWarble: 97,
  drumRefDepth: 98,
  fmDacSlot: 99,
  fmDacSlip: 100,
  fmAlloc: 101,
  fmColdBoot: 102,
  fmAdder: 103,
  fourLevel: 104,
  fourPitch: 105,
  fourAux: 106,
  four1MidHz: 107,
  // The toy chip's feedback bends, and its output on the FM chip's data bus.
  chipStepTap: 108,
  chipEnvRelax: 109,
  chipEnvDiv: 110,
  chipOutAddr: 111,
  chipOutData: 112,
  chipPwmTap: 113,
  fmToyBus: 114,
  chipFmClock: 115,
  chipHold: 116,
  chipHardSync: 117,
  chipXor: 118,
  chipEnvBits: 119,
  chipDutyEnv: 120,
  pcmRunOn: 121,
  pcmWrite: 122,
  pcmSignDir: 123,
  pcmLatch: 124,
  crushDataLine: 125,
  crushDataFault: 126,
  crushBusCut: 127,
  crushLadder: 128,
  crushRefDepth: 129,
  starve2: 130,
  distDraw: 131,
  distPinGain: 132,
  octRate: 133,
  octChaos: 134,
  drumWander: 135,
  drumStepTap: 136,
  chipKitAddr: 137,
  gndBounce: 138,
  pcmGlint: 139,
} as const
export const N_DEST = 140

/** A selector moved by its lane, read once a block. A push of one is a lap of
    the list, and it wraps round, so an S&H lands anywhere on it and a sweep
    walks it in order. */
export function hop(
  choice: number,
  choices: number,
  lane: Float32Array | null,
): number {
  const at = Math.round(choice)
  if (!lane) return at
  const k = (at + Math.round(lane[0]! * choices)) % choices
  return k < 0 ? k + choices : k
}

// A fader's lane, in the order the chain sums the sources. The chain applies it
// to what the source put on the bus, so a wire there is a VCA on the channel.
export const SOURCE_LEVEL_DEST = [
  DEST.chipLevel,
  DEST.drumLevel,
  DEST.fmLevel,
  DEST.pcmLevel,
  DEST.monoLevel,
  DEST.oscLevel,
  DEST.noiseLevel,
  DEST.sampleLevel,
  DEST.fourLevel,
] as const satisfies { length: typeof SOURCE_TAPS.length }

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
  laneA: 12,
  laneB: 13,
  phrase: 14,
  adsr: 15,
}

// Long enough to take the click off a lane on a level, short enough that a
// lane has landed well inside the block it steps in.
const LANE_RAMP_S = 0.0007

const LANE_IDX = LANE_KEYS.map(keys => keys.map(k => IDX[k]))
const LANE_LEN_IDX = LANE_LEN_KEYS.map(k => IDX[k])

// Sources pick() answers with a lane of their own. Every other source reads the
// LFO.
const OWN_LANE = new Set<number>([
  SRC.supply,
  SRC.env,
  SRC.mic,
  SRC.fb,
  SRC.rom,
  SRC.drum,
  SRC.key,
  SRC.heat,
  SRC.bodyX,
  SRC.bodyY,
  SRC.laneA,
  SRC.laneB,
  SRC.phrase,
  SRC.adsr,
])

const WIRES = [
  [IDX.mod0Src, IDX.mod0Dest, IDX.mod0Depth],
  [IDX.mod1Src, IDX.mod1Dest, IDX.mod1Depth],
  [IDX.mod2Src, IDX.mod2Dest, IDX.mod2Depth],
  [IDX.mod3Src, IDX.mod3Dest, IDX.mod3Depth],
] as const

export const LFO_SYNC_MODES = [
  'off',
  'four bars',
  'two bars',
  'bars',
  'halves',
  'quarters',
  'dotted eighths',
  'eighths',
  'eighth triplets',
  'sixteenths',
  'thirty-seconds',
]
// One cycle in sixths of a kit step, so every division is a whole number.
const LFO_SYNC_SIXTHS = [0, 384, 192, 96, 48, 24, 18, 12, 8, 6, 3]

/** What opens the bay's ADSR: a held key, any hit of the kit, or one voice. */
export const ENV_GATES = ['keys', 'any hit', ...VOICE_LABELS]

export const PHRASE_BARS = [1, 2, 4, 8, 16, 32]
export const PHRASE_SHAPES = [
  'rise',
  'build',
  'fall',
  'swell',
  'stairs',
  'wave',
]
const BAR_STEPS = 16

/** Where a phrase stands at `t` of the way through it. Every shape but wave
    runs 0 to 1, so a wire pushes one way from where its knob sits; stairs
    climbs a notch a bar, or a beat in a phrase under four bars. */
export function phraseShape(t: number, shape: number, bars: number): number {
  switch (shape) {
    case 1:
      return t * t * t
    case 2:
      return 1 - t
    case 3:
      return 1 - Math.abs(2 * t - 1)
    case 4: {
      const n = Math.max(bars, 4)
      return Math.min(Math.floor(t * n), n - 1) / (n - 1)
    }
    case 5:
      return Math.sin(t * 2 * Math.PI)
    default:
      return t
  }
}

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
  private readonly stepLanes = LANE_IDX.map(() => new Float32Array(BLOCK))
  private readonly laneAt = LANE_IDX.map(() => 0)
  private readonly laneFrom = LANE_IDX.map(() => 0)
  private readonly laneOut = LANE_IDX.map(() => 0)
  private readonly laneRamp = LANE_IDX.map(() => 0)
  private readonly phrase = new Float32Array(BLOCK)
  // Steps into the phrase: set from the kit's counter on each strobe, and run
  // on at the kit's tempo in between, or with the kit stopped.
  private phrasePos = 0
  private readonly env = new Adsr()
  private readonly envLane = new Float32Array(BLOCK)
  private keysWere = 0
  private holdLeft = 0
  private lfoPhase = 0
  private shValue = 0
  private mic = new Follower()
  private drumHit = new Decay()
  private keyHit = new Decay()
  private chaos = new Chaos()
  private drunk = new Drunk()
  private rng: Rng

  private readonly sr: number

  constructor(sr: number, seed = 808) {
    this.sr = sr
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
    const cycle = LFO_SYNC_SIXTHS[Math.round(p[IDX.modLfoSync]!)] ?? 0
    const kitHz = src.trig.kitStepHz || p[IDX.drumBpm]! / 15
    const hz = cycle ? (6 * kitHz) / cycle : p[IDX.modLfoHz]!
    const strobe = src.trig.drumStep
    const shape = Math.round(p[IDX.modLfoShape]!)
    const attack = coef(0.005, this.sr)
    const release = coef(0.12, this.sr)
    const fall = Math.exp(-1 / (0.12 * this.sr))
    const rampLen = Math.max(1, Math.round(LANE_RAMP_S * this.sr))
    // The phase, the held value and the chaos and drunk walks carry state and
    // advance every sample. The other shapes are functions of the phase, so
    // their lane is only written when a wire reads it.
    let wired = false
    let phrased = false
    let enveloped = false
    for (let w = 0; w < WIRES.length; w++) {
      const from = Math.round(p[WIRES[w]![0]]!)
      if (from !== SRC.off && !OWN_LANE.has(from)) wired = true
      if (from === SRC.phrase) phrased = true
      if (from === SRC.adsr) enveloped = true
    }
    const bars = PHRASE_BARS[Math.round(p[IDX.modPhraseBars]!)] ?? 8
    const phraseSteps = bars * BAR_STEPS
    const phraseShapeAt = Math.round(p[IDX.modPhraseShape]!)
    if (enveloped) this.runEnv(n, p, src.trig, kitHz)
    for (let i = 0; i < n; i++) {
      const prev = this.lfoPhase
      this.lfoPhase = wrap1(this.lfoPhase + hz / this.sr)
      let wrapped = this.lfoPhase < prev
      // A strobe on a cycle boundary puts the phase back on the bar.
      if (cycle && strobe[i] && ((strobe[i]! - 1) * 6) % cycle === 0) {
        wrapped ||= this.lfoPhase > 0.5
        this.lfoPhase = 0
      }
      if (wrapped) this.shValue = this.rng() * 2 - 1
      if (shape === 4) this.lfo[i] = this.chaos.step(hz, this.sr)
      else if (shape === 5) this.lfo[i] = this.drunk.step(hz, this.sr, this.rng)
      else if (wired) this.lfo[i] = lfoShape(this.lfoPhase, shape, this.shValue)
      this.micEnv[i] = Math.min(
        this.mic.process(src.mic[i]!, attack, release) * 2,
        1,
      )
      this.drumEnv[i] = this.drumHit.process(
        Math.min(src.trig.drumGain[i]!, 1),
        fall,
      )
      this.keyEnv[i] = this.keyHit.process(src.trig.key[i]! > 0 ? 1 : 0, fall)
      const at = strobe[i]!
      this.phrasePos = at
        ? (at - 1) % phraseSteps
        : (this.phrasePos + kitHz / this.sr) % phraseSteps
      if (phrased)
        this.phrase[i] = phraseShape(
          this.phrasePos / phraseSteps,
          phraseShapeAt,
          bars,
        )
      for (let l = 0; l < LANE_IDX.length; l++) {
        if (at) {
          const len = asLaneLen(p[LANE_LEN_IDX[l]!]!)
          this.laneAt[l] =
            asLaneValue(p[LANE_IDX[l]![(at - 1) % len]!]!) / LANE_MAX
          this.laneFrom[l] = this.laneOut[l]!
          this.laneRamp[l] = rampLen
        }
        const to = this.laneAt[l]!
        const left = this.laneRamp[l]!
        if (left > 1) {
          this.laneRamp[l] = left - 1
          this.laneOut[l] =
            to + ((this.laneFrom[l]! - to) * (left - 1)) / rampLen
        } else {
          this.laneRamp[l] = 0
          this.laneOut[l] = to
        }
        this.stepLanes[l]![i] = this.laneOut[l]!
      }
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

  // A key going down retriggers the envelope, and the last one up lets it go.
  // A hit holds the gate open for Hold steps of the kit, and a hit inside the
  // hold starts the attack again.
  private runEnv(n: number, p: Float32Array, trig: TriggerBus, kitHz: number) {
    const rates = adsrRates(
      this.sr,
      p[IDX.modEnvAttack]! / 1000,
      p[IDX.modEnvDecay]! / 1000,
      p[IDX.modEnvSustain]!,
      p[IDX.modEnvRelease]! / 1000,
    )
    const gate = Math.round(p[IDX.modEnvGate]!)
    const down = trig.keysDown.size
    const mask = gate === 1 ? -1 : voiceBit(gate - 2)
    const stepLen = trig.drumStepLen || this.sr / Math.max(kitHz, 0.5)
    const hold = Math.round(p[IDX.modEnvHold]!) * stepLen
    if (gate === 0) {
      if (down > this.keysWere) this.env.trigger()
      else if (down === 0 && this.keysWere > 0) this.env.release()
      this.holdLeft = 0
    }
    this.keysWere = down
    for (let i = 0; i < n; i++) {
      if (gate > 0) {
        if ((trig.drumBits[i]! & mask) !== 0) {
          this.env.trigger()
          this.holdLeft = hold
        } else if (this.holdLeft > 0 && --this.holdLeft <= 0) this.env.release()
      }
      this.envLane[i] = this.env.step(rates)
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
      case SRC.laneA:
        return this.stepLanes[0]!
      case SRC.laneB:
        return this.stepLanes[1]!
      case SRC.phrase:
        return this.phrase
      case SRC.adsr:
        return this.envLane
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
    this.phrasePos = 0
    this.env.reset()
    this.keysWere = 0
    this.holdLeft = 0
    this.laneAt.fill(0)
    this.laneOut.fill(0)
    this.laneFrom.fill(0)
    this.laneRamp.fill(0)
    this.mic.reset()
    this.drumHit.reset()
    this.keyHit.reset()
    this.chaos.reset()
    this.drunk.reset()
  }
}
