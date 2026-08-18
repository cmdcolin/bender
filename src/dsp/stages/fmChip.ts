import { IDX } from '../../engine/params'
import { Bus } from '../bus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'
import { softclip } from '../util/softclip'
import { mulberry32 } from '../util/rng'
import {
  type Cpu,
  EFFECT_CH,
  EFFECTS,
  loadEffect,
  stopEffect,
} from './fmEffects'
import { KEY_ON, PATCH_BYTES, REG } from './fmVoices'

// The other chip on the board: two operators a voice, four voices, and a
// register file the CPU writes over a bus.
//
// The register file is the point. Nothing here is played — it is *configured*,
// one byte at a time, by a processor that decides what the sound is and then
// tells the chip. Every note is a handful of writes: the patch, the frequency,
// the key going down, and later the key coming up. Put a knife through the wires
// carrying those writes and the chip does not malfunction. It receives a byte
// with one bit wrong and executes it perfectly, and it goes on executing it,
// because a register holds what it was last told until something tells it
// otherwise. That persistence is what nothing else on this board does: a bent
// supply is a sound that lasts as long as your hand is on the knob, and a bent
// data line is a sound that lasts until the CPU happens to write that register
// again — which might be the next note, or might be never.
//
// It is why the key-off write is the famous one. Miss it and the note does not
// glitch; it simply never ends.

const N_CH = 4
const N_REGS = 64

// A9 down: what the frequency number is counted against. The chip holds nine
// bits of frequency and three of octave, so the nine bits only ever have to
// cover one octave and the block shifts it. Which is why a cut frequency line
// is a lattice rather than a slide — the note lands on the nearest count the
// remaining wires can still express, and the same wrong count every time.
const FNUM_BASE = 32.7
const FNUM_FULL = 256

// The multiplier table, as the part shipped it: not a scale, and not even
// monotonic at the top, because the last few entries repeat.
const MULT = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 12, 12, 15, 15]

// Attenuation, in the two step sizes the register file uses: three quarters of
// a decibel for the modulator's six bits, three for the carrier's four.
const atten = (steps: number, perStep: number) =>
  Math.pow(10, (-steps * perStep) / 20)

// Envelope rates. Four bits each, counted off the same divider as everything
// else on this board, so a starving rail drags the envelopes out along with the
// pitch and the tempo — one oscillator, as ever.
const attackSecs = (r: number) => 0.0005 * Math.pow(2, (15 - r) * 0.6)
const fallSecs = (r: number) => 0.004 * Math.pow(2, (15 - r) * 0.62)

// Half a sine is the other waveform the part had, and the reason an FM chip of
// this era can sound reedy rather than glassy: rectifying one operator doubles
// its fundamental and fills in odd harmonics the sine never had.
const wave = (phase: number, half: number) => {
  const s = Math.sin(phase * 2 * Math.PI)
  return half ? Math.max(s, 0) : s
}

const ENV_FLOOR = 0.0005

/** The noise byte the effect ROM reads, which is a table on the real part. */
const EFFECT_SEED = 0x5e

const IDLE = 0
const ATTACK = 1
const DECAY = 2
const SUSTAIN = 3
const RELEASE = 4

interface Op {
  phase: number
  env: number
  stage: number
  /** last two outputs, for the modulator's feedback into itself */
  fb1: number
  fb2: number
}

const newOp = (): Op => ({ phase: 0, env: 0, stage: IDLE, fb1: 0, fb2: 0 })

interface Channel {
  mod: Op
  car: Op
  note: number
  started: number
  /** samples until the CPU gets round to writing the key back up */
  offIn: number
}

// One coefficient set per operator per block. Recomputed from the rail once a
// block rather than once a sample: an envelope rate that arrives 2.7 ms late is
// an envelope rate nobody can hear arriving late, and the alternative is eight
// exponentials a sample for a stage that is only sometimes on.
interface Rates {
  attack: number
  decay: number
  release: number
  sustain: number
  mult: number
  level: number
  half: number
  sustained: boolean
}

const newRates = (): Rates => ({
  attack: 1,
  decay: 1,
  release: 1,
  sustain: 1,
  mult: 1,
  level: 1,
  half: 0,
  sustained: false,
})

export class FmChip implements Stage {
  label = 'fmChip'
  private regs = new Uint8Array(N_REGS)
  private ch: Channel[] = Array.from({ length: N_CH }, () => ({
    mod: newOp(),
    car: newOp(),
    note: 0,
    started: 0,
    offIn: 0,
  }))
  private clock = 0
  private modRates = newRates()
  private carRates = newRates()
  private feedback = 0
  private dataBus = new Bus(8)
  private addrBus = new Bus(6)
  private dataLine = -1
  private dataFault = 0
  private addrLine = -1
  private addrFault = 0
  private busCut = 1
  // What the CPU last sent the chip, so it only sends the patch again when
  // something it knows about has moved. A processor that rewrote eight registers
  // every sample would paper over every fault the moment it landed.
  private sentVoice = -1
  private sentBright = -1
  private sentFeedback = -1
  // The effect ROM, and the driver running it: a script of writes over time,
  // clocked off the CPU rather than off the rail.
  private effect = -1
  private effectTick = 0
  private effectClock = 0
  private cpu: Cpu = {
    write: (addr, data) => this.write(addr, data),
    rng: mulberry32(EFFECT_SEED),
    s: new Float64Array(4),
  }

  constructor(
    private readonly sr: number,
    private readonly rail: ToyRail,
  ) {}

  when(p: Float32Array) {
    return p[IDX.fmLevel]! > 0
  }

  // The only way anything reaches the register file. Both buses are in the path,
  // so a fault on the address side files a perfectly good byte under the wrong
  // register and a fault on the data side files the wrong byte under the right
  // one — and either way it stays there.
  private write(addr: number, data: number) {
    const a = this.addrBus.read(
      addr,
      this.addrLine,
      this.addrFault,
      this.busCut,
    )
    const d = this.dataBus.read(
      data,
      this.dataLine,
      this.dataFault,
      this.busCut,
    )
    const reg = a % N_REGS
    const before = this.regs[reg]!
    this.regs[reg] = d & 0xff

    // The chip watches its own key bits, and an edge on one is the only thing
    // that ever starts or ends a note. Which is the whole bend in one line: a
    // wire that cannot change is a wire the chip never sees change. The
    // processor can write the key up as often as it likes and the envelope has
    // no reason to move, so the note goes on — and the next note lands on the
    // same channel as a change of pitch under an envelope that never restarted.
    const ch = reg - REG.keyBlock
    if (ch < 0 || ch >= N_CH) return
    const was = (before & KEY_ON) !== 0
    const now = (this.regs[reg]! & KEY_ON) !== 0
    if (now && !was) this.attack(ch)
    else if (was && !now) this.release(ch)
  }

  private attack(i: number) {
    for (const op of [this.ch[i]!.mod, this.ch[i]!.car]) {
      op.stage = ATTACK
      op.phase = 0
      op.fb1 = 0
      op.fb2 = 0
    }
  }

  private release(i: number) {
    const c = this.ch[i]!
    if (c.mod.stage !== IDLE) c.mod.stage = RELEASE
    if (c.car.stage !== IDLE) c.car.stage = RELEASE
  }

  // The patch, as the CPU sends it: eight bytes out of the voice table with the
  // two knobs folded in on the way past. Which is why moving a slider is when a
  // cut line bites — the corruption arrives with the write, not with the note.
  private sendVoice(voice: number, bright: number, fb: number) {
    const bytes = PATCH_BYTES[voice] ?? PATCH_BYTES[0]!
    for (let i = 0; i < 8; i++) {
      let byte = bytes[i]!
      if (i === REG.modLevel) {
        // Brightness is the modulator's own volume, and the register counts
        // attenuation, so a brighter patch is a smaller number.
        byte = (byte & 0xc0) | Math.round((byte & 0x3f) * (1 - bright * 0.9))
      }
      if (i === REG.feedback) byte = (byte & ~0x07) | fb
      this.write(i, byte)
    }
  }

  // A driver running an effect keeps the top channel for it and gives the
  // keyboard the rest, which is what four channels and one effect button always
  // meant: the sound the button makes is a voice you no longer have.
  private pick(note: number): Channel {
    const free = this.effect >= 0 ? EFFECT_CH : N_CH
    for (let i = 0; i < free; i++) {
      const c = this.ch[i]!
      if (c.note === note && c.car.stage !== IDLE) return c
    }
    for (let i = 0; i < free; i++)
      if (this.ch[i]!.car.stage === IDLE) return this.ch[i]!
    let steal = this.ch[0]!
    for (let i = 1; i < free; i++)
      if (this.ch[i]!.started < steal.started) steal = this.ch[i]!
    return steal
  }

  // A note, as the CPU spells it out: the frequency split into a count and an
  // octave, the low byte, then the high bits and the key going down in one
  // write — which is the write that also carries the top bit of the frequency,
  // exactly as the part laid it out. One wire wrong up there moves the pitch and
  // whether the note happens at all.
  private keyOn(note: number, lengthSamples: number) {
    const hz = 220 * Math.pow(2, note / 12)
    const block = Math.min(
      Math.max(Math.floor(Math.log2(hz / FNUM_BASE)), 0),
      7,
    )
    const fnum = Math.min(
      Math.round((hz / Math.pow(2, block) / FNUM_BASE) * FNUM_FULL),
      511,
    )
    const i = this.ch.indexOf(this.pick(note))
    const c = this.ch[i]!
    c.note = note
    c.started = this.clock++
    c.offIn = lengthSamples
    // The key up before the key down, which is how a driver retriggers a channel
    // it is already using: the chip has no other way to be told this is a new
    // note. It is also the write that stops arriving first when a line goes.
    this.write(REG.keyBlock + i, this.regs[REG.keyBlock + i]! & ~KEY_ON)
    // Volume goes out with the note, as the part expected: one nibble, and a
    // wire stuck in it leaves that channel at the wrong level for good.
    this.write(REG.instVol + i, 0)
    this.write(REG.fnumLo + i, fnum & 0xff)
    this.write(REG.keyBlock + i, ((fnum >> 8) & 1) | (block << 1) | KEY_ON)
  }

  // The write the whole bend is named after. The CPU clears one bit of one
  // register; a wire that cannot go low means the bit never clears, the chip
  // goes on being told the key is down, and the note does not end.
  private keyOff(i: number) {
    this.ch[i]!.offIn = 0
    this.write(REG.keyBlock + i, this.regs[REG.keyBlock + i]! & ~KEY_ON)
  }

  noteOff(note: number) {
    const n = this.effect >= 0 ? EFFECT_CH : N_CH
    for (let i = 0; i < n; i++) if (this.ch[i]!.note === note) this.keyOff(i)
  }

  // The effect button, pressed or let go. Going in, eight patch bytes; coming
  // out, the one write that ends whatever the script left keyed on, and the
  // melody patch sent again the way a driver re-selects its instrument. Both are
  // writes like any other, so both are somewhere a cut line can land.
  private setEffect(next: number) {
    if (this.effect >= 0) stopEffect(this.cpu)
    this.effect = next
    this.effectTick = 0
    this.effectClock = 0
    this.cpu.s.fill(0)
    // Whatever the keyboard had queued on that channel is not the driver's any
    // more, so the key-up it was waiting to send never goes.
    this.ch[EFFECT_CH]!.offIn = 0
    const eff = EFFECTS[next]
    if (eff) loadEffect(this.cpu, eff)
    else this.sentVoice = -1
  }

  // The patch registers turned into something a sample loop can use. Done once a
  // block, off whatever the register file holds right now — so a byte that
  // arrived wrong is read wrong here, every block, until it is written again.
  private readPatch(clockFactor: number) {
    const rates = (
      out: Rates,
      flags: number,
      ad: number,
      sr: number,
      level: number,
      half: number,
    ) => {
      const scale = Math.max(clockFactor, 0.05)
      out.mult = MULT[flags & 0x0f]!
      out.sustained = (flags & 0x20) !== 0
      out.attack = 1 - Math.exp(-1 / (attackSecs(ad >> 4) * scale * this.sr))
      out.decay = Math.exp(-1 / (fallSecs(ad & 0x0f) * scale * this.sr))
      out.release = Math.exp(-1 / (fallSecs(sr & 0x0f) * scale * this.sr))
      out.sustain = atten(sr >> 4, 3)
      out.level = level
      out.half = half
    }
    const r = this.regs
    const shape = r[REG.feedback]!
    rates(
      this.modRates,
      r[REG.modFlags]!,
      r[REG.modAttack]!,
      r[REG.modSustain]!,
      atten(r[REG.modLevel]! & 0x3f, 0.75),
      shape & 0x10,
    )
    rates(
      this.carRates,
      r[REG.carFlags]!,
      r[REG.carAttack]!,
      r[REG.carSustain]!,
      1,
      shape & 0x08,
    )
    this.feedback = (shape & 0x07) === 0 ? 0 : Math.pow(2, (shape & 0x07) - 8)
  }

  private stepEnv(op: Op, r: Rates) {
    switch (op.stage) {
      case ATTACK:
        op.env += (1.02 - op.env) * r.attack
        if (op.env >= 1) {
          op.env = 1
          op.stage = DECAY
        }
        break
      case DECAY:
        op.env *= r.decay
        if (op.env <= r.sustain) op.stage = r.sustained ? SUSTAIN : RELEASE
        break
      case RELEASE:
        op.env *= r.release
        if (op.env < ENV_FLOOR) {
          op.env = 0
          op.stage = IDLE
        }
        break
    }
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const level = p[IDX.fmLevel]!
    const voice = Math.round(p[IDX.fmVoice]!)
    const bright = p[IDX.fmBright]!
    const fb = Math.round(p[IDX.fmFeedback]!)
    this.dataLine = Math.round(p[IDX.fmDataLine]!) - 1
    this.dataFault = Math.round(p[IDX.fmDataFault]!)
    this.addrLine = Math.round(p[IDX.fmAddrLine]!) - 1
    this.addrFault = Math.round(p[IDX.fmAddrFault]!)
    this.busCut = p[IDX.fmBusCut]!
    const rail = this.rail
    const lengthSamples = Math.round(p[IDX.fmLength]! * this.sr)

    const effect = Math.round(p[IDX.fmEffect]!) - 1
    if (effect !== this.effect) this.setEffect(effect)
    const script = EFFECTS[this.effect]

    // A driver with an effect running does not re-select the melody instrument
    // behind it. The script owns the patch registers until the button comes up,
    // and letting it go is what sends the voice again — so a knob moved while a
    // bird is calling is a knob nothing acts on until the calling stops. Send it
    // anyway and it lands on top of the effect's own patch, which is the whole
    // sound of the effect: the feedback the weather is made of never arrives.
    if (
      voice !== this.sentVoice ||
      bright !== this.sentBright ||
      fb !== this.sentFeedback
    ) {
      this.sentVoice = voice
      this.sentBright = bright
      this.sentFeedback = fb
      if (this.effect < 0) this.sendVoice(voice, bright, fb)
    }

    this.readPatch(rail.clockFactor)
    const mod = this.modRates
    const car = this.carRates
    const drive = 0.4
    let load = 0

    for (let i = 0; i < io.n; i++) {
      // The effect ROM, running. Its rate is the CPU's crystal and nothing on
      // this board reaches that, so the gesture keeps its own time however far
      // the rail has dragged the chip it is writing to — which is the whole
      // sound of it: a bird call in tempo, driving a synthesiser that has been
      // told nonsense.
      if (script) {
        this.effectClock += script.hz / this.sr
        while (this.effectClock >= 1) {
          this.effectClock -= 1
          const tick = this.effectTick++
          script.run(this.cpu, tick, tick / script.hz)
        }
      }

      // The key line the toy brings out, which is every note anything on this
      // board strikes: the demo song, your hands, a controller, or a drum hit
      // that came back round. Somebody soldered it onto this chip's key input,
      // so the two boxes play the same part.
      const struck = ctx.trig.key[i]!
      if (struck !== 0) this.keyOn(struck - 128, lengthSamples)

      let sum = 0
      const pitch = rail.pitchFactor
      for (let n = 0; n < N_CH; n++) {
        const c = this.ch[n]!
        // The CPU coming back to write the key up. Whether that write does
        // anything is between it and the wires.
        if (c.offIn > 0 && --c.offIn === 0) this.keyOff(n)
        if (c.car.stage === IDLE) continue

        // Frequency straight back out of the registers rather than off the note
        // that was asked for, so a byte that landed wrong is a pitch that comes
        // out wrong.
        const key = this.regs[REG.keyBlock + n]!
        const fnum = this.regs[REG.fnumLo + n]! | ((key & 1) << 8)
        const hz =
          (fnum / FNUM_FULL) * FNUM_BASE * Math.pow(2, (key >> 1) & 7) * pitch

        this.stepEnv(c.mod, mod)
        this.stepEnv(c.car, car)

        const inc = hz / this.sr
        c.mod.phase = (c.mod.phase + inc * mod.mult) % 1
        const self = (c.mod.fb1 + c.mod.fb2) * this.feedback
        const m = wave(c.mod.phase + self, mod.half) * c.mod.env * mod.level
        c.mod.fb2 = c.mod.fb1
        c.mod.fb1 = m

        c.car.phase = (c.car.phase + inc * car.mult) % 1
        // The modulator's swing in carrier cycles: what makes it an FM chip and
        // not two oscillators.
        sum += wave(c.car.phase + m * 2, car.half) * c.car.env * this.volume(n)
      }

      // One small output stage for four voices, as ever on a board like this.
      const out = (softclip(sum * drive) / drive) * rail.ampFactor * level * 0.3
      load += Math.abs(out)
      io.l[i]! += out
      io.r[i]! += out
    }
    // The kit owns the reported load and writes it first, so this adds to it:
    // two chips on one supply are two chips' worth of current.
    rail.reported += load / io.n
  }

  private volume(n: number) {
    return atten(this.regs[REG.instVol + n]! & 0x0f, 3)
  }

  /** The eight patch bytes as they currently stand, for a test to read. */
  patchRegs() {
    return this.regs.slice(0, PATCH_BYTES[0]!.length)
  }

  panic() {
    this.regs.fill(0)
    this.effect = -1
    this.effectTick = 0
    this.effectClock = 0
    this.cpu.s.fill(0)
    this.cpu.rng = mulberry32(EFFECT_SEED)
    for (const c of this.ch) {
      c.mod = newOp()
      c.car = newOp()
      c.offIn = 0
    }
    this.dataBus.reset()
    this.addrBus.reset()
    this.sentVoice = -1
    this.sentBright = -1
    this.sentFeedback = -1
  }
}
