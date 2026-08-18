import { IDX } from '../../engine/params'
import { Bus, Strobe } from '../bus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'
import { N_DRUM_VOICES, voiceMask } from '../trigbus'
import { ACCENT_GAIN } from '../../drums'
import { softclip } from '../util/softclip'
import { mulberry32 } from '../util/rng'
import {
  type Cpu,
  EFFECT_CH,
  EFFECTS,
  loadEffect,
  stopEffect,
} from './fmEffects'
import {
  attackSecs,
  fallSecs,
  KEY_ON,
  MULT,
  PATCH_BYTES,
  REG,
  TEST,
} from './fmVoices'

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

// Attenuation, in the two step sizes the register file uses: three quarters of
// a decibel for the modulator's six bits, three for the carrier's four.
const atten = (steps: number, perStep: number) =>
  Math.pow(10, (-steps * perStep) / 20)

// Envelope rates come off the same divider as everything else on this board, so
// a starving rail drags the envelopes out along with the pitch and the tempo —
// one oscillator, as ever. The table itself lives with the register map.

// The sine, as the part stores it rather than as mathematics has it: nothing on
// this chip computes a sine, it looks one up. A quarter of a wave, 256 entries,
// and two more bits of phase to build the other three quarters — one mirrors the
// quarter back on itself, one flips the sign.
//
// Which makes the waveform an *address*, and an address is a bus like any other.
// It is the one bus on the chip the processor never touches: the register file
// is written a few times a note, and this is read eight times a sample, so a
// knife here is the opposite bend to a knife on the data lines. Nothing
// accumulates and nothing persists. It is under your hand for as long as the
// note is held, and it changes the shape of the wave rather than the number the
// chip was told.
const SINE_BITS = 10
const SINE_STEPS = 1 << SINE_BITS
/** the quarter the table holds, and the two bits that make the rest of it */
const QUARTER = SINE_STEPS >> 2
const MIRROR = QUARTER
const SIGN = QUARTER << 1

const sineQuarter = Float64Array.from({ length: QUARTER }, (_, i) =>
  Math.sin(((i + 0.5) / QUARTER) * (Math.PI / 2)),
)

const sineAt = (addr: number) => {
  const i = addr & (QUARTER - 1)
  const s = sineQuarter[addr & MIRROR ? QUARTER - 1 - i : i]!
  return addr & SIGN ? -s : s
}

/** Which way the stale bit falls on a cut waveform line. */
const WAVE_SEED = 0x1d

const ENV_FLOOR = 0.0005

// What the kit plays when its trigger lines are clipped to this chip's key
// input. A drum machine has no notes to send — a trigger line carries a strike
// and nothing else — so the note has to be decided at this end, and one note per
// voice in the kit's own row order is the decision the wire makes for you. They
// are a pentatonic apart on purpose: a pattern written for drums comes out as a
// riff rather than a cluster.
const DRUM_NOTES = [0, 12, 24, 15, 5, 19]

/** The noise byte the effect ROM reads, which is a table on the real part. */
const EFFECT_SEED = 0x5e

/** Which strobe pulses come out too narrow, which is a race and not a pattern. */
const STROBE_SEED = 0xa3

const IDLE = 0
const ATTACK = 1
const DECAY = 2
const SUSTAIN = 3
const RELEASE = 4

// What the panel adds to a patch on its way to the chip: the tone controls the
// keyboard had a button for, and the two ratios and the decay it did not.
interface Panel {
  bright: number
  fb: number
  modRatio: number
  carRatio: number
  modDecay: number
}

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
  private raceRates = newRates()
  private feedback = 0
  private dataBus = new Bus(8)
  private addrBus = new Bus(6)
  private dataLine = -1
  private dataFault = 0
  private addrLine = -1
  private addrFault = 0
  private busCut = 1
  // The wave ROM's address lines. One bus for the whole chip, because there is
  // one operator datapath on the die and every operator takes its turn on it —
  // so a stale bit here carries the phase of whichever operator went before,
  // which is a different operator every time.
  private waveBus = new Bus(SINE_BITS, WAVE_SEED)
  private waveLine = -1
  private waveFault = 0
  /** what the output latch is holding, for the test bit that stops it taking */
  private held = 0
  // The write strobe, and how often its pulse comes out too narrow for the
  // address latch to catch.
  private strobe = 0
  private addrLatch = new Strobe(STROBE_SEED)
  // What the CPU last sent the chip, so it only sends the patch again when
  // something it knows about has moved. A processor that rewrote eight registers
  // every sample would paper over every fault the moment it landed.
  private sentVoice = -1
  private sent: Panel = {
    bright: -1,
    fb: -1,
    modRatio: -1,
    carRatio: -1,
    modDecay: -1,
  }
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
    // Both bytes have crossed the bus by now. Where the value lands is the
    // strobe's decision: a pulse the latch missed leaves the last register it
    // caught still standing, so this write commits there instead.
    const reg = this.addrLatch.latch(a, this.strobe) % N_REGS
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
  // panel folded in on the way past. Which is why moving a slider is when a cut
  // line bites — the corruption arrives with the write, not with the note.
  //
  // Everything the panel does to a patch it does here, in the byte, because
  // that is the only way anything reaches this chip. There is no layer between
  // the knob and the register: a ratio is four bits of a flags byte and a decay
  // is a nibble, so the knobs have the resolution the part had and no more.
  private sendVoice(voice: number, panel: Panel) {
    // The write every driver for this part sends before anything else, and the
    // only time one goes near the test register at all. It is a zero on the
    // same eight wires as the patch, so it is a zero exactly as far as the
    // wires allow.
    this.write(REG.test, 0)
    const bytes = PATCH_BYTES[voice] ?? PATCH_BYTES[0]!
    for (let i = 0; i < 8; i++) {
      let byte = bytes[i]!
      if (i === REG.modLevel) {
        // Brightness is the modulator's own volume, and the register counts
        // attenuation, so a brighter patch is a smaller number.
        byte =
          (byte & 0xc0) | Math.round((byte & 0x3f) * (1 - panel.bright * 0.9))
      }
      if (i === REG.feedback) byte = (byte & ~0x07) | panel.fb
      // A ratio knob at nothing is a ratio the voice keeps, so the eight
      // patches stay the eight patches until you ask for something else.
      if (i === REG.modFlags && panel.modRatio > 0)
        byte = (byte & ~0x0f) | (panel.modRatio - 1)
      if (i === REG.carFlags && panel.carRatio > 0)
        byte = (byte & ~0x0f) | (panel.carRatio - 1)
      if (i === REG.modAttack && panel.modDecay > 0)
        byte = (byte & ~0x0f) | (16 - panel.modDecay)
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
  private keyOn(note: number, lengthSamples: number, vol = 0) {
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
    // wire stuck in it leaves that channel at the wrong level for good. It is
    // also the only place a strike's weight can go — an accented step on the kit
    // is a note this chip is told to play at a different attenuation, because
    // there is nothing else in the register file that means loud.
    this.write(REG.instVol + i, vol)
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
    this.effect = next
    this.effectTick = 0
    this.effectClock = 0
    this.cpu.s.fill(0)
    // One key-up, whichever direction the button moved. Going out it ends what
    // the script left keyed on; going in it ends whatever the keyboard was
    // still holding on the channel the script is about to take, because the
    // key-up that channel had queued is not the driver's to send any more.
    this.ch[EFFECT_CH]!.offIn = 0
    stopEffect(this.cpu)
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

    // What the envelope counter does with its carry forced: the fastest step it
    // has, on every operator at once, whatever the rate registers hold. It
    // still reads the rail, because the counter is still counting the same
    // divider — a raced envelope on a starving board is a longer click.
    const fast = Math.exp(
      -1 / (fallSecs(15) * Math.max(clockFactor, 0.05) * this.sr),
    )
    this.raceRates.attack = 1
    this.raceRates.decay = fast
    this.raceRates.release = fast
    this.raceRates.sustain = ENV_FLOOR
    this.raceRates.sustained = false
  }

  // One operator's turn on the wave ROM. The phase's top bits are the address;
  // half a sine is not a rectifier but the sign bit's half of the table read as
  // silence, which is how the part did it — so a sign line held low is a reedy
  // patch that has forgotten how to be reedy.
  private wave(phase: number, half: number) {
    let addr = Math.floor(phase * SINE_STEPS) & (SINE_STEPS - 1)
    if (this.waveLine >= 0)
      addr = this.waveBus.read(addr, this.waveLine, this.waveFault, this.busCut)
    return half && addr & SIGN ? 0 : sineAt(addr)
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
    const panel: Panel = {
      bright: p[IDX.fmBright]!,
      fb: Math.round(p[IDX.fmFeedback]!),
      modRatio: Math.round(p[IDX.fmModRatio]!),
      carRatio: Math.round(p[IDX.fmCarRatio]!),
      modDecay: Math.round(p[IDX.fmModDecay]!),
    }
    this.dataLine = Math.round(p[IDX.fmDataLine]!) - 1
    this.dataFault = Math.round(p[IDX.fmDataFault]!)
    this.addrLine = Math.round(p[IDX.fmAddrLine]!) - 1
    this.addrFault = Math.round(p[IDX.fmAddrFault]!)
    this.busCut = p[IDX.fmBusCut]!
    this.strobe = p[IDX.fmStrobe]!
    this.waveLine = Math.round(p[IDX.fmWaveLine]!) - 1
    this.waveFault = Math.round(p[IDX.fmWaveFault]!)
    const rail = this.rail
    const lengthSamples = Math.round(p[IDX.fmLength]! * this.sr)

    const drumMask = voiceMask(Math.round(p[IDX.fmStruck]!))

    const effect = Math.round(p[IDX.fmEffect]!) - 1
    if (effect !== this.effect) this.setEffect(effect)
    const script = EFFECTS[this.effect]

    // A driver with an effect running does not re-select the melody instrument
    // behind it. The script owns the patch registers until the button comes up,
    // and letting it go is what sends the voice again — so a knob moved while a
    // bird is calling is a knob nothing acts on until the calling stops. Send it
    // anyway and it lands on top of the effect's own patch, which is the whole
    // sound of the effect: the feedback the weather is made of never arrives.
    const sent = this.sent
    if (
      voice !== this.sentVoice ||
      panel.bright !== sent.bright ||
      panel.fb !== sent.fb ||
      panel.modRatio !== sent.modRatio ||
      panel.carRatio !== sent.carRatio ||
      panel.modDecay !== sent.modDecay
    ) {
      this.sentVoice = voice
      this.sent = panel
      if (this.effect < 0) this.sendVoice(voice, panel)
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

      // And the kit's own lines, for whoever clipped them on here as well. The
      // kit is wired behind this chip in the source order, so what arrives is
      // last block's hits — 2.7 ms, which is under the resolution of a trigger
      // line and nowhere near the resolution of a drum machine.
      if (drumMask !== 0) {
        const bits = Math.round(ctx.trig.drumBits[i]!) & drumMask
        if (bits !== 0) {
          const vol = Math.round((1 - ctx.trig.drumGain[i]! / ACCENT_GAIN) * 3)
          for (let v = 0; v < N_DRUM_VOICES; v++)
            if (bits & (1 << v))
              this.keyOn(DRUM_NOTES[v]!, lengthSamples, Math.max(vol, 0))
        }
      }

      // The test register, read down here with the operators rather than up
      // with the patch, because what it switches is the counters and the latch
      // themselves and those run at the sample.
      const test = this.regs[REG.test]!
      const wideOpen = (test & TEST.envMax) !== 0
      const raced = (test & TEST.envRace) !== 0

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

        this.stepEnv(c.mod, raced ? this.raceRates : mod)
        this.stepEnv(c.car, raced ? this.raceRates : car)
        // Wide open is not a loud envelope, it is no envelope: the stages go on
        // running underneath, so notes still start and still end — they simply
        // stop having a shape between the two.
        const modEnv = wideOpen ? 1 : c.mod.env
        const carEnv = wideOpen ? 1 : c.car.env

        const inc = hz / this.sr
        c.mod.phase = (c.mod.phase + inc * mod.mult) % 1
        const self = (c.mod.fb1 + c.mod.fb2) * this.feedback
        const m = this.wave(c.mod.phase + self, mod.half) * modEnv * mod.level
        c.mod.fb2 = c.mod.fb1
        c.mod.fb1 = m

        c.car.phase = (c.car.phase + inc * car.mult) % 1
        // The modulator's swing in carrier cycles: what makes it an FM chip and
        // not two oscillators.
        sum +=
          this.wave(c.car.phase + m * 2, car.half) * carEnv * this.volume(n)
      }

      // One small output stage for four voices, as ever on a board like this,
      // and the latch in front of it — the last place on the chip a test bit
      // can reach. A latch that only takes every other slot holds through the
      // one it missed, and a sign line held is everything below the line folded
      // back over it.
      if ((test & TEST.dacSkew) === 0 || (i & 1) === 0) {
        const word = softclip(sum * drive) / drive
        this.held = test & TEST.dacSign ? Math.abs(word) : word
      }
      const out = this.held * rail.ampFactor * level * 0.3
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
    this.waveBus.reset()
    this.held = 0
    this.addrLatch.reset()
    this.sentVoice = -1
    this.sent.bright = -1
  }
}
