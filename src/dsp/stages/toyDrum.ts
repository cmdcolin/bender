import { ACCENT_GAIN, asLen, DRUM_VOICES, GRID_ROWS, STEPS } from '../../drums'
import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'
import type { Transport } from '../transport'
import { N_DRUM_VOICES, STEP_CHOICE, voiceMask } from '../trigbus'
import { Transient } from '../util/follower'
import { octaves, wrap1 } from '../util/pitch'
import { mulberry32, type Rng } from '../util/rng'

const TAU = 2 * Math.PI

// The widest word the converter has resistors for, and how far out the reel
// they came off was sold as. The grade is a knob and this is where it rests: it
// scales as a ratio against this number, so a kit nobody has re-graded renders
// the samples it always did.
//
// A ladder DAC halves the weight at every rung down the word, and it does that
// with resistors somebody bought by the reel. Each one is out by its tolerance,
// so the steps are uneven — and unevenly, because the error scales with the rung
// it sits on: the top resistor is worth half of full scale and half of its
// tolerance is an enormous number of counts. Which is why the sound of a cheap
// converter is not hiss. It is one lurch, at the code where every bit changes at
// once, and for a signal that code is the zero crossing.
const LADDER_BITS = 16
const LADDER_TOL = 0.15

// How close to nominal the best rung on the board can be.
//
// A part is not a coin toss around its marked value. Anything that came out of
// the press inside a tighter band was measured, sorted and sold as a tighter
// grade, so what is left in the cheap bin is the parts that missed — reliably
// out, by somewhere between most of the tolerance and all of it. Drawing flat
// through zero instead gave the board a rung or two that happened to be nearly
// right, and the stock word length landed on one of them: the knob did least at
// the setting the kit ships at.
const LADDER_FLOOR = 0.4

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
  private noiseLp = 0
  private clapFast = 0
  private clapSlow = 0
  private clapsLeft = 0
  private clapTimer = 0
  private lastReboot = 0
  private rng: Rng
  private micTrig: Transient
  // What this board's resistors came out at, in counts of the rung they sit on.
  // Drawn once: the knob says how bad the ladder is, not which parts are wrong.
  private trim = new Float32Array(LADDER_BITS)
  // A hit from outside the box — a pad on a controller, struck by hand rather
  // than by the sequencer. It waits here for the top of the next block: the
  // trigger line is a wire the DSP reads, and nothing on the main thread can
  // reach into the middle of one.
  private struckBits = 0
  private struckGain = 0
  // Voices that have fired since the panel last looked. Every hit stamps it —
  // the sequencer's, the retrigger bend's, the mic's, a bridged trigger line's,
  // a pad's — because the grid lights for whatever strikes the kit, and all but
  // the first of those land on steps nobody can see coming.
  private firedSince = 0

  constructor(
    private readonly sr: number,
    private readonly rail: ToyRail,
    private readonly transport: Transport,
    seed = 202,
  ) {
    this.rng = mulberry32(seed)
    this.micTrig = new Transient(sr)
    // Off its own stream: the resistors were soldered on before the kit made a
    // sound, and drawing them out of the noise source would move every hit.
    const parts = mulberry32(seed ^ 0x1adde4)
    // At the stock grade. Re-grading scales these rather than redrawing them, so
    // which rungs are long and which are short stays soldered in and only how
    // far out they are moves.
    for (let k = 0; k < LADDER_BITS; k++) {
      const off =
        (LADDER_FLOOR + (1 - LADDER_FLOOR) * parts()) * LADDER_TOL * (1 << k)
      this.trim[k] = parts() < 0.5 ? -off : off
    }
  }

  // What the converter puts out instead of the code it was handed, in counts.
  // Bit depth is where the word is tapped off the ladder, so shortening it hands
  // the top of the scale to a different resistor and the error changes character
  // as well as size.
  private ladderErr(
    code: number,
    bits: number,
    amt: number,
    tol: number,
  ): number {
    const word = code + (1 << (bits - 1))
    let err = 0
    for (let k = 0; k < bits; k++) if ((word >> k) & 1) err += this.trim[k]!
    return err * amt * (tol / LADDER_TOL)
  }

  when(p: Float32Array) {
    const on = p[IDX.drumLevel]! > 0
    if (!on) this.rail.reported = 0
    return on
  }

  /** Strike voices by hand. `bits` is the bit order of a step, so one message
      can land a whole kit's worth; two hits inside one block fold together and
      the harder one sets the weight. */
  strike(bits: number, gain: number) {
    this.struckBits |= bits
    this.struckGain = Math.max(this.struckGain, gain)
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
    this.firedSince |= bits
    ctx.trig.drumFired(i, bits, gain)
  }

  private fire(p: Float32Array, ctx: Ctx, i: number, fallback = false) {
    const named = this.bitsAt(p, this.tick)
    const bits = fallback ? named || 1 : named
    this.hit(bits, this.accentAt(p, this.tick) ? ACCENT_GAIN : 1, ctx, i)
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const level = p[IDX.drumLevel]!
    const rail = this.rail
    // Same divider, same cells as the keyboard: flat batteries drag the tempo,
    // and everything else this chip counts — see perSample below.
    const clock = rail.clockFactor
    const stepHz = (p[IDX.drumBpm]! / 60) * 4 * clock
    const swing = Math.min(Math.max(p[IDX.drumSwing]!, 0), 0.9)
    const baseTune = p[IDX.drumTune]!
    const modTune = ctx.mod.read(DEST.drumTune)
    const decay = Math.max(p[IDX.drumDecay]!, 0.05)
    const baseRetrig = p[IDX.drumRetrigHz]!
    const mod = ctx.mod.read(DEST.retrig)
    const micTrig = Math.round(p[IDX.micPatch]!) === 5
    const keyTrig = Math.round(p[IDX.trigToDrum]!)
    const cross = Math.round(p[IDX.drumCross]!)
    const baseBleed = cross === 0 ? 0 : p[IDX.drumCrossAmt]!
    const modCross = cross === 0 ? null : ctx.mod.read(DEST.drumCross)
    // The kit shares one cheap DAC; the panel's Bit depth is its word length.
    const bits = Math.max(Math.round(p[IDX.drumBits]!), 1)
    const q = Math.pow(2, bits - 1)
    const ladder = p[IDX.drumLadder]!
    const ladderTol = p[IDX.drumLadderTol]!

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

    // There is one oscillator in the chip and the envelopes are counted off it,
    // the same as the tempo and the pitch. So a rail that drags the pattern slow
    // drags every tail out with it, and a kit going down with the batteries goes
    // low, late and long rather than only low and late. Decay is a divisor on
    // that count, not a time: the knob keeps saying what it always said.
    const perSample = -clock / (this.sr * decay)
    const clapBurstFall = Math.exp(70 * perSample)
    // The clap's nine milliseconds are counted off the same oscillator, so on a
    // sagging rail the three bursts spread into a flam.
    const clapGap = 0.009 / clock
    const falls = this.falls
    falls[KICK] = Math.exp(9 * perSample)
    falls[SNARE] = Math.exp(22 * perSample)
    falls[HAT] = Math.exp(60 * perSample)
    falls[CLAP] = Math.exp(13 * perSample)
    falls[TOM] = Math.exp(11 * perSample)
    falls[BELL] = Math.exp(16 * perSample)

    let loadSum = 0
    for (let i = 0; i < io.n; i++) {
      // Hands first, and whether or not the pattern is running: a pad is a
      // finger on the trigger line, and the kit answers a finger with the
      // machine stopped the way it answers the mic.
      if (i === 0 && this.struckBits !== 0) {
        this.hit(this.struckBits, this.struckGain, ctx, i)
        this.struckBits = 0
        this.struckGain = 0
      }
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
        ? Math.min(baseRetrig * octaves(mod[i]! * 4), 8000)
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
        const tune = modTune ? baseTune * octaves(2 * modTune[i]!) : baseTune
        const pf = rail.pitchFactor * tune
        if (amp[KICK]! > 0.002) {
          const hz = (40 + 90 * amp[KICK]! * amp[KICK]!) * pf
          this.phase[KICK] = wrap1(this.phase[KICK]! + hz / this.sr)
          out +=
            Math.sin(this.phase[KICK]! * TAU) * amp[KICK]! * weight[KICK]! * 1.2
        }
        // The clap is three bursts nine milliseconds apart and then the room:
        // one noise source, retriggered, with the last hit left to ring on.
        if (this.clapsLeft > 0) {
          this.clapTimer -= 1 / this.sr
          if (this.clapTimer <= 0) {
            this.clapTimer = clapGap
            this.clapsLeft--
            env[CLAP] = 1
            amp[CLAP] = 1
          }
        }
        // There is one noise transistor on the board, and the snare, the hat and
        // the clap are all hung off it. Two of them on the same step hear the
        // same hiss, so they sum coherently into one crack instead of standing
        // beside each other as two — and the hat is a high-pass rather than a
        // second noise minus a first one, because what it subtracts is the
        // filtered version of the sample it is holding.
        //
        // The filter is a cap on the board and it keeps its charge between hits,
        // so it runs when anything is drawing on the transistor and stops when
        // nothing is: the kit's idle cost is one branch, not one draw.
        if (amp[SNARE]! > 0.002 || amp[HAT]! > 0.002 || amp[CLAP]! > 0.002) {
          const noise = this.rng() * 2 - 1
          this.noiseLp += 0.25 * (noise - this.noiseLp)
          if (amp[SNARE]! > 0.002)
            out +=
              (noise - this.noiseLp * 0.5) * amp[SNARE]! * weight[SNARE]! * 0.8
          if (amp[HAT]! > 0.002)
            out += (noise - this.noiseLp) * amp[HAT]! * weight[HAT]! * 0.35
          if (amp[CLAP]! > 0.002) {
            this.clapFast += 0.45 * (noise - this.clapFast)
            this.clapSlow += 0.05 * (noise - this.clapSlow)
            out +=
              (this.clapFast - this.clapSlow) * amp[CLAP]! * weight[CLAP]! * 1.6
          }
        }
        if (amp[TOM]! > 0.002) {
          const hz = (90 + 70 * amp[TOM]!) * pf
          this.phase[TOM] = wrap1(this.phase[TOM]! + hz / this.sr)
          out += Math.sin(this.phase[TOM]! * TAU) * amp[TOM]! * weight[TOM]!
        }
        if (amp[BELL]! > 0.002) {
          this.phase[BELL] = wrap1(this.phase[BELL]! + (540 * pf) / this.sr)
          this.bellPhase2 = wrap1(this.bellPhase2 + (800 * pf) / this.sr)
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
        const code = Math.round(out * q)
        out = (code + this.ladderErr(code, bits, ladder, ladderTol)) / q
        out *= rail.ampFactor
      }

      out *= level * 0.6
      loadSum += Math.abs(out)
      io.l[i]! += out
      io.r[i]! += out
    }
    rail.reported = loadSum / io.n
  }

  /** Voices that have fired since the last read, as the bit order of a step.
      Reading takes them: the panel is drawing one report per frame and a hit it
      has already lit is a hit that has been seen. */
  takeFired(): number {
    const bits = this.firedSince
    this.firedSince = 0
    return bits
  }

  panic() {
    this.struckBits = 0
    this.struckGain = 0
    this.firedSince = 0
    this.env.fill(0)
    this.amp.fill(0)
    this.gain.fill(1)
    this.weight.fill(1)
    this.phase.fill(0)
    this.bellPhase2 = 0
    this.bellLp = 0
    this.noiseLp = 0
    this.clapFast = 0
    this.clapSlow = 0
    this.clapsLeft = 0
    this.micTrig.reset()
  }
}
