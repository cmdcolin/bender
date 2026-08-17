import { asLen, DRUM_VOICES, GRID_ROWS, STEPS } from '../../drums'
import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'
import type { Transport } from '../transport'
import { N_DRUM_VOICES, STEP_CHOICE, voiceMask } from '../trigbus'
import { Transient } from '../util/follower'
import { mulberry32, type Rng } from '../util/rng'

const TAU = 2 * Math.PI
const ACCENT_GAIN = 1.7

// Voice order is the bit order of a step, and the order of the rows in the
// panel's grid — both come off the one table in drums.ts. The pattern lives in
// one sixteen-bit mask per voice, step 1 in the high bit.
const KICK = 0
const SNARE = 1
const HAT = 2
const CLAP = 3
const TOM = 4
const BELL = 5
const N_VOICES = N_DRUM_VOICES

const VOICE_PARAM = DRUM_VOICES.map(v => IDX[v.key])
const LEN_PARAM = GRID_ROWS.map(r => IDX[r.len])
const ACCENT_ROW = GRID_ROWS.length - 1

// Every pattern length divides this, so the counter can wrap without a row
// jumping mid-bar: it is the least common multiple of 1 through 16. At the
// fastest tempo the panel offers, one lap of it is over an hour.
export const CYCLE = 720720

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
  /**
   * Steps clocked since the machine started, not the column it is on: with a
   * length per row there is no one column. Each row's playhead is this counter
   * modulo its own length, which is how the panel draws them and how the
   * sequencer reads them.
   */
  tick = 0
  private stepClock = 0
  /** Each row's length this block, clamped to something a modulo can use. */
  private lens = new Uint8Array(GRID_ROWS.length).fill(STEPS)
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
    seed = 202,
  ) {
    this.rng = mulberry32(seed)
    this.micTrig = new Transient(sr)
  }

  when(p: Float32Array) {
    const on = p[IDX.drumLevel]! > 0
    if (!on) this.rail.reported = 0
    return on
  }

  // Which voices this tick names. Each row reads its own column, so a row five
  // steps long is round again while the kick is still in the first bar — the
  // pattern drifts against itself for as long as the two lengths take to line
  // back up, which on a five against sixteen is eighty steps.
  private bitsAt(p: Float32Array, tick: number): number {
    let bits = 0
    for (let v = 0; v < N_VOICES; v++) {
      const step = tick % this.lens[v]!
      if ((Math.round(p[VOICE_PARAM[v]!]!) >> (STEPS - 1 - step)) & 1)
        bits |= 1 << v
    }
    return bits
  }

  private accentAt(p: Float32Array, tick: number): boolean {
    const step = tick % this.lens[ACCENT_ROW]!
    return ((Math.round(p[IDX.drumAccent]!) >> (STEPS - 1 - step)) & 1) === 1
  }

  // The trigger line: every voice the step names fires at once, at the step's
  // own weight. The clap is the odd one out — it doesn't strike, it claps.
  //
  // Every hit is stamped on the bus as it goes, whether the sequencer struck it,
  // the retrigger bend hammered it, a shout came in the mic or the keyboard's
  // gate reached across. The line is one node; what is soldered to it decides.
  private hit(bits: number, gain: number, ctx: Ctx, i: number) {
    if (!bits) return
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
    ctx.trig.drumFired(i, bits, gain)
  }

  private fire(p: Float32Array, ctx: Ctx, i: number, fallback = false) {
    const named = this.bitsAt(p, this.tick)
    const bits = fallback ? named || 1 : named
    this.hit(bits, this.accentAt(p, this.tick) ? ACCENT_GAIN : 1, ctx, i)
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const level = p[IDX.drumLevel]!
    // Same divider, same cells as the keyboard: flat batteries drag the tempo.
    const stepHz = (p[IDX.drumBpm]! / 60) * 4 * this.rail.clockFactor
    const swing = Math.min(Math.max(p[IDX.drumSwing]!, 0), 0.9)
    const baseTune = p[IDX.drumTune]!
    const modTune = ctx.mod.read(DEST.drumTune)
    const decay = Math.max(p[IDX.drumDecay]!, 0.05)
    const baseRetrig = p[IDX.drumRetrigHz]!
    const mod = ctx.mod.read(DEST.retrig)
    const micTrig = p[IDX.micPatch] === 5
    const keyTrig = Math.round(p[IDX.trigToDrum]!)
    const cross = Math.round(p[IDX.drumCross]!)
    const baseBleed = cross === 0 ? 0 : p[IDX.drumCrossAmt]!
    const modCross = cross === 0 ? null : ctx.mod.read(DEST.drumCross)
    const rail = this.rail
    // The kit shares one cheap DAC; the panel's Bit depth is its word length.
    const q = Math.pow(2, Math.max(p[IDX.drumBits]!, 1) - 1)

    // Every row's length, read once a block: a length that moved mid-block would
    // move a playhead the panel has already drawn.
    for (let r = 0; r < this.lens.length; r++) {
      this.lens[r] = asLen(p[LEN_PARAM[r]!]!)
    }

    if (rail.rebootCount !== this.lastReboot) {
      this.lastReboot = rail.rebootCount
      this.tick = 0
      this.stepClock = 0
    }

    const perSample = -1 / (this.sr * decay)
    const clapBurstFall = Math.exp(70 * perSample)
    const falls = this.falls
    falls[KICK] = Math.exp(9 * perSample)
    falls[SNARE] = Math.exp(22 * perSample)
    falls[HAT] = Math.exp(60 * perSample)
    falls[CLAP] = Math.exp(13 * perSample)
    falls[TOM] = Math.exp(11 * perSample)
    falls[BELL] = Math.exp(16 * perSample)

    let loadSum = 0
    for (let i = 0; i < io.n; i++) {
      if (this.transport.drums) {
        // Swing holds the offbeat back and takes it off the step after, so a
        // pair still spans two steps and the tempo is what the knob says.
        const span = this.tick % 2 === 0 ? 1 + swing * 0.5 : 1 - swing * 0.5
        this.stepClock += stepHz / this.sr
        if (this.stepClock >= span) {
          this.stepClock -= span
          this.tick = (this.tick + 1) % CYCLE
          this.fire(p, ctx, i)
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
          this.fire(p, ctx, i, true)
        }
      }
      // mic soldered onto the trigger line: clap at it and the kit fires
      if (micTrig && this.micTrig.process(ctx.mic[i]!, 0.05)) {
        this.fire(p, ctx, i, true)
      }
      // The keyboard's gate, reaching across: every note the chip strikes hits
      // the kit, whether the pattern is running or not. 'the step' hands the
      // grid to your hands — a key plays whatever column the sequencer is on.
      if (keyTrig > 0 && ctx.trig.key[i]! > 0) {
        if (keyTrig === STEP_CHOICE) this.fire(p, ctx, i, true)
        else this.hit(voiceMask(keyTrig), 1, ctx, i)
      }

      // Bridged envelope pins: each amplifier leans across to a neighbour's
      // envelope instead of its own. All the way over is a full swap, so the
      // kick fires on snare steps and the noise swells on kicks.
      //
      // With nothing bridged an amplifier hears its own envelope, so it reads
      // that array rather than a copy of it: the leaned-across pair only exists
      // while something is leaning, and copying twelve floats a sample to say
      // nothing was bridged is the kit's whole idle cost.
      const env = this.env
      const bleed = modCross
        ? Math.min(Math.max(baseBleed + modCross[i]!, 0), 1)
        : baseBleed
      let amp = env
      let weight = this.gain
      if (bleed > 0) {
        amp = this.amp
        weight = this.weight
        const wiring = CROSS_WIRING[cross] ?? CROSS_WIRING[0]!
        for (let v = 0; v < N_VOICES; v++) {
          const from = wiring[v]!
          amp[v] = env[v]! + bleed * (env[from]! - env[v]!)
          weight[v] = this.gain[v]! + bleed * (this.gain[from]! - this.gain[v]!)
        }
      }

      let out = 0
      if (!rail.booting) {
        // One trimmer for the whole kit, so a wire on it moves every struck
        // voice together — two octaves either way at full depth.
        const tune = modTune
          ? baseTune * Math.pow(2, 2 * modTune[i]!)
          : baseTune
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
