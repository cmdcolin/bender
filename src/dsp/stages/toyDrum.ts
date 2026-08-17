import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'
import type { Transport } from '../transport'
import { Transient } from '../util/follower'
import { mulberry32, type Rng } from '../util/rng'

const TAU = 2 * Math.PI
const STEPS = 16
const ACCENT_GAIN = 1.7

// Voice order is the bit order of a step, and the order of the rows in the
// panel's grid. The pattern lives in one sixteen-bit mask per voice, step 1 in
// the high bit.
const KICK = 0
const SNARE = 1
const HAT = 2
const CLAP = 3
const TOM = 4
const BELL = 5
const N_VOICES = 6

const VOICE_PARAM = [
  IDX.drumKick,
  IDX.drumSnare,
  IDX.drumHat,
  IDX.drumClap,
  IDX.drumTom,
  IDX.drumBell,
]

// Which envelope each amplifier leans across to, per drumCross choice. A voice
// wired to itself is a voice nobody bridged.
const CROSS_WIRING: readonly number[][] = [
  [KICK, SNARE, HAT, CLAP, TOM, BELL],
  [SNARE, KICK, HAT, CLAP, TOM, BELL],
  [KICK, HAT, SNARE, CLAP, TOM, BELL],
  [HAT, SNARE, KICK, CLAP, TOM, BELL],
  [SNARE, HAT, KICK, CLAP, TOM, BELL],
  [SNARE, HAT, CLAP, TOM, BELL, KICK],
]

export class ToyDrum implements Stage {
  label = 'toyDrum'
  /** The step the sequencer is on; the panel draws its playhead from this. */
  step = 0
  private stepClock = 0
  private retrigPhase = 0
  private env = new Float32Array(N_VOICES)
  private amp = new Float32Array(N_VOICES)
  // How hard the last trigger hit each voice, and what its amplifier is
  // hearing once the cross-patch has leaned it across. A voice that has never
  // fired still has an amplifier at unity, so a borrowed envelope drives it.
  private gain = new Float32Array(N_VOICES).fill(1)
  private weight = new Float32Array(N_VOICES).fill(1)
  private phase = new Float32Array(N_VOICES)
  private falls = new Float32Array(N_VOICES)
  private bellPhase2 = 0
  private bellLp = 0
  private snareLp = 0
  private clapFast = 0
  private clapSlow = 0
  private clapsLeft = 0
  private clapTimer = 0
  private lastReboot = 0
  private rng: Rng
  private micTrig: Transient

  constructor(
    private readonly sr: number,
    private readonly rail: ToyRail,
    private readonly transport: Transport,
  ) {
    this.rng = mulberry32(202)
    this.micTrig = new Transient(sr)
  }

  when(p: Float32Array) {
    const on = p[IDX.drumLevel]! > 0
    if (!on) this.rail.reported = 0
    return on
  }

  private bitsAt(p: Float32Array, step: number): number {
    let bits = 0
    for (let v = 0; v < N_VOICES; v++) {
      if ((Math.round(p[VOICE_PARAM[v]!]!) >> (STEPS - 1 - step)) & 1)
        bits |= 1 << v
    }
    return bits
  }

  // The trigger line: every voice the step names fires at once, at the step's
  // own weight. The clap is the odd one out — it doesn't strike, it claps.
  private trigger(bits: number, gain: number) {
    for (let v = 0; v < N_VOICES; v++) {
      if (!(bits & (1 << v))) continue
      this.gain[v] = gain
      if (v === CLAP) {
        this.clapsLeft = 3
        this.clapTimer = 0
      } else {
        this.env[v] = 1
        this.phase[v] = 0
      }
    }
  }

  private fire(p: Float32Array, accent: number, fallback = false) {
    const bits = fallback
      ? this.bitsAt(p, this.step) || 1
      : this.bitsAt(p, this.step)
    const hard = (accent >> (STEPS - 1 - this.step)) & 1
    this.trigger(bits, hard ? ACCENT_GAIN : 1)
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const level = p[IDX.drumLevel]!
    // Same divider, same cells as the keyboard: flat batteries drag the tempo.
    const stepHz = (p[IDX.drumBpm]! / 60) * 4 * this.rail.clockFactor
    const swing = Math.min(Math.max(p[IDX.drumSwing]!, 0), 0.9)
    const tune = p[IDX.drumTune]!
    const decay = Math.max(p[IDX.drumDecay]!, 0.05)
    const accent = Math.round(p[IDX.drumAccent]!)
    const baseRetrig = p[IDX.drumRetrigHz]!
    const mod = ctx.mod.read(DEST.retrig)
    const micTrig = p[IDX.micPatch] === 5
    const cross = Math.round(p[IDX.drumCross]!)
    const baseBleed = cross === 0 ? 0 : p[IDX.drumCrossAmt]!
    const modCross = cross === 0 ? null : ctx.mod.read(DEST.drumCross)
    const rail = this.rail
    // The kit shares one cheap DAC; the panel's Bit depth is its word length.
    const q = Math.pow(2, Math.max(p[IDX.drumBits]!, 1) - 1)

    if (rail.rebootCount !== this.lastReboot) {
      this.lastReboot = rail.rebootCount
      this.step = 0
      this.stepClock = 0
    }

    const fall = (rate: number) => Math.exp(-rate / (this.sr * decay))
    const clapBurstFall = fall(70)
    const falls = this.falls
    falls[KICK] = fall(9)
    falls[SNARE] = fall(22)
    falls[HAT] = fall(60)
    falls[CLAP] = fall(13)
    falls[TOM] = fall(11)
    falls[BELL] = fall(16)

    let loadSum = 0
    for (let i = 0; i < io.n; i++) {
      if (this.transport.drums) {
        // Swing holds the offbeat back and takes it off the step after, so a
        // pair still spans two steps and the tempo is what the knob says.
        const span = this.step % 2 === 0 ? 1 + swing * 0.5 : 1 - swing * 0.5
        this.stepClock += stepHz / this.sr
        if (this.stepClock >= span) {
          this.stepClock -= span
          this.step = (this.step + 1) % STEPS
          this.fire(p, accent)
        }
      }
      // the bend: hammer the current step's trigger line at audio rate
      const retrigHz = mod
        ? Math.min(baseRetrig * Math.pow(2, mod[i]! * 4), 8000)
        : baseRetrig
      if (this.transport.drums && retrigHz > 0.5) {
        this.retrigPhase += retrigHz / this.sr
        if (this.retrigPhase >= 1) {
          this.retrigPhase -= 1
          this.fire(p, accent, true)
        }
      }
      // mic soldered onto the trigger line: clap at it and the kit fires
      if (micTrig && this.micTrig.process(ctx.mic[i]!, 0.05)) {
        this.fire(p, accent, true)
      }

      // Bridged envelope pins: each amplifier leans across to a neighbour's
      // envelope instead of its own. All the way over is a full swap, so the
      // kick fires on snare steps and the noise swells on kicks.
      const env = this.env
      const amp = this.amp
      const weight = this.weight
      const bleed = modCross
        ? Math.min(Math.max(baseBleed + modCross[i]!, 0), 1)
        : baseBleed
      amp.set(env)
      weight.set(this.gain)
      if (bleed > 0) {
        const wiring = CROSS_WIRING[cross] ?? CROSS_WIRING[0]!
        for (let v = 0; v < N_VOICES; v++) {
          const from = wiring[v]!
          amp[v]! += bleed * (env[from]! - env[v]!)
          weight[v]! += bleed * (this.gain[from]! - this.gain[v]!)
        }
      }

      let out = 0
      if (!rail.booting) {
        const pf = rail.pitchFactor * tune
        if (amp[KICK]! > 0.002) {
          const hz = (40 + 90 * amp[KICK]! * amp[KICK]!) * pf
          this.phase[KICK] = (this.phase[KICK]! + hz / this.sr) % 1
          out +=
            Math.sin(this.phase[KICK]! * TAU) * amp[KICK]! * weight[KICK]! * 1.2
        }
        if (amp[SNARE]! > 0.002) {
          const noise = this.rng() * 2 - 1
          this.snareLp += 0.25 * (noise - this.snareLp)
          out +=
            (noise - this.snareLp * 0.5) * amp[SNARE]! * weight[SNARE]! * 0.8
        }
        if (amp[HAT]! > 0.002) {
          const noise = this.rng() * 2 - 1
          out += (noise - this.snareLp) * amp[HAT]! * weight[HAT]! * 0.35
        }
        // The clap is three bursts nine milliseconds apart and then the room:
        // one noise source, retriggered, with the last hit left to ring on.
        if (this.clapsLeft > 0) {
          this.clapTimer -= 1 / this.sr
          if (this.clapTimer <= 0) {
            this.clapTimer = 0.009
            this.clapsLeft--
            env[CLAP] = 1
            amp[CLAP] = 1
          }
        }
        if (amp[CLAP]! > 0.002) {
          const noise = this.rng() * 2 - 1
          this.clapFast += 0.45 * (noise - this.clapFast)
          this.clapSlow += 0.05 * (noise - this.clapSlow)
          out +=
            (this.clapFast - this.clapSlow) * amp[CLAP]! * weight[CLAP]! * 1.6
        }
        if (amp[TOM]! > 0.002) {
          const hz = (90 + 70 * amp[TOM]!) * pf
          this.phase[TOM] = (this.phase[TOM]! + hz / this.sr) % 1
          out += Math.sin(this.phase[TOM]! * TAU) * amp[TOM]! * weight[TOM]!
        }
        if (amp[BELL]! > 0.002) {
          this.phase[BELL] = (this.phase[BELL]! + (540 * pf) / this.sr) % 1
          this.bellPhase2 = (this.bellPhase2 + (800 * pf) / this.sr) % 1
          const sq =
            (this.phase[BELL]! < 0.5 ? 1 : -1) +
            (this.bellPhase2 < 0.5 ? 1 : -1)
          this.bellLp += 0.4 * (sq - this.bellLp)
          out += (sq - this.bellLp) * amp[BELL]! * weight[BELL]! * 0.3
        }
        // Every voice's envelope falls on its own, whatever its amplifier is
        // hearing. Decaying the envelope inside the output test instead left a
        // bridged voice stuck at full: a kick leaning all the way over to a
        // snare that never fires has nothing to open its own amplifier with, so
        // nothing was left to run its envelope down, and unpatching the bridge
        // dropped a hit that had been waiting there for minutes.
        for (let v = 0; v < N_VOICES; v++) {
          env[v]! *=
            v === CLAP && this.clapsLeft > 0 ? clapBurstFall : falls[v]!
        }
        out = Math.round(out * q) / q
        out *= rail.ampFactor
      }

      out *= level * 0.6
      loadSum += Math.abs(out)
      io.l[i]! += out
      io.r[i]! += out
    }
    rail.reported = loadSum / io.n
  }

  panic() {
    this.env.fill(0)
    this.amp.fill(0)
    this.gain.fill(1)
    this.weight.fill(1)
    this.phase.fill(0)
    this.bellPhase2 = 0
    this.bellLp = 0
    this.snareLp = 0
    this.clapFast = 0
    this.clapSlow = 0
    this.clapsLeft = 0
    this.micTrig.reset()
  }
}
