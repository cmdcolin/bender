import { IDX } from '../../engine/params'
import { Bus, Strobe } from '../bus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'
import { N_DRUM_VOICES, voiceMask } from '../trigbus'
import { ACCENT_GAIN } from '../../drums'
import { snap } from '../../scale'
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
  AM,
  attackSecs,
  BASS_BLOCK,
  BASS_FNUM,
  CAR_HALF,
  fallSecs,
  KEY_ON,
  KIT,
  kslGain,
  KSL_SHIFT,
  MOD_HALF,
  MULT,
  PATCH_BYTES,
  REG,
  RHY,
  ROM_PATCH_BYTES,
  scaledRate,
  TEST,
  VIB,
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

// Where the percussion bank starts. Set the mode bit and everything from here
// up stops belonging to the keyboard: the bass drum on the first of them, and
// the snare and the hi-hat sharing the two operator slots of the last, which is
// how a part with more channels than pins fits five drums into three voices.
const RHYTHM_CH = 2

/** What the hi-hat's slot runs at against the snare's, fixed on the die. */
const HAT_MULT = 8

// The shift register the percussion runs on: seventeen stages, one tap, and
// free-running from power-on. Nothing on the panel reaches it and nothing
// reseeds it, so the hiss is the same hiss every time the board comes up —
// which is what makes it a part of a chip rather than a random number.
class Lfsr {
  private state = 1

  step() {
    const bit = (this.state ^ (this.state >> 14)) & 1
    this.state = ((this.state >>> 1) | (bit << 16)) & 0x1ffff
    return bit ? 1 : -1
  }

  reset() {
    this.state = 1
  }
}

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

// The one LFO on the die, and the only oscillator on this chip that nothing
// addresses. There is no register for it anywhere: no rate, no depth, no way to
// start it or stop it, and the whole of what a patch gets to say is whether an
// operator is soldered to it. It has been running since the board came up.
//
// Both shapes are counters rather than curves, the way the part built them. The
// tremolo is a triangle off the top of the divider and only ever takes level
// away, because attenuation is the only thing the output stage knows how to
// add. The vibrato is a staircase of eight, which is why a chip like this
// wobbles in steps instead of gliding. Both count off the same divider as the
// pitch and the envelopes, so a starving board slows the wobble down with
// everything else — one oscillator, as ever.
const AM_HZ = 3.7
const VIB_HZ = 6.4
/** How much level the tremolo takes at the bottom of its triangle, in dB. */
const AM_DB = 1.1
/** The steps the vibrato counter walks, and how far the far ones are, in cents. */
const VIB_CENTS = 7
const VIB_STEPS = [0, 1, 2, 1, 0, -1, -2, -1]
const VIB_FACTOR = VIB_STEPS.map(s => Math.pow(2, (s * VIB_CENTS) / 2 / 1200))

/** The tremolo counter, six bits of it, as a gain rather than as decibels. */
const AM_GAIN = Float64Array.from({ length: 64 }, (_, i) =>
  Math.pow(10, -(AM_DB * i) / 63 / 20),
)

/** Which way the stale bit falls on a cut waveform line. */
const WAVE_SEED = 0x1d

const ENV_FLOOR = 0.0005

// What the kit plays when its trigger lines are clipped to this chip's key
// input. A drum machine has no notes to send — a trigger line carries a strike
// and nothing else — so the note has to be decided at this end, and one note per
// voice in the kit's own row order is the decision the wire makes for you. They
// are a pentatonic apart on purpose: a pattern written for drums comes out as a
// riff rather than a cluster.
const DRUM_NOTES = [0, 12, 24, 15, 5, 19, 26, 31]

// And where those same lines land when the bank is switched over and the chip
// has drums of its own to put them on. Three keys for eight voices, so the tom
// goes on the bass drum and everything metal goes on the hat: the wire has no
// more places to put a strike than the die has drums.
const DRUM_KEYS = [
  RHY.bass,
  RHY.snare,
  RHY.hat,
  RHY.snare,
  RHY.bass,
  RHY.hat,
  RHY.hat,
  RHY.hat,
]

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
  lfo: number
  modRatio: number
  carRatio: number
  modDecay: number
}

// What the vibrato button does to a patch on its way past. There is no LFO
// register to write, so the only thing the button can be is two bits in each of
// two patch bytes — which is why it takes a voice change to apply it, and why a
// knife on the bus can leave the button down with nothing wobbling.
const LFO_BITS = [0, VIB, AM, AM | VIB]

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
  /** whether this operator is wired to the die's LFO, either way round */
  am: boolean
  vib: boolean
  /** the two-bit key scaling, kept as its setting because the gain it comes to
      depends on the note, and the note is read off the registers per sample */
  ksl: number
  /** how much of itself the modulator gets back; nothing on a carrier */
  fb: number
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
  am: false,
  vib: false,
  ksl: 0,
  fb: 0,
})

/** The two operators of one channel, as the sample loop wants them. */
const newPair = () => ({ mod: newRates(), car: newRates() })

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
  // One rate set per operator per channel, rather than one for the chip. Four
  // channels can be running four different patches now: the instrument nibble
  // is a per-channel register, so a wire under it leaves one voice reading the
  // die's ROM while its neighbours go on reading the register file. Key scaling
  // splits them too, since the rate an operator counts at depends on the octave
  // the channel was keyed at.
  private chRates = Array.from({ length: N_CH }, newPair)
  private raceRates = newRates()
  // The kit's four, which never read the register file: the bass drum's two
  // operators, and one rate set each for the two slots wired to the shift
  // register.
  private bass = newPair()
  private snareRates = newRates()
  private hatRates = newRates()
  private noise = new Lfsr()
  /** the bit the register is holding, the slower one the snare latched off it,
      and where each of the two clocks has got to */
  private hiss = 0
  private snareHiss = 0
  private noiseClock = 0
  private snareClock = 0
  /** whether the mode bit was set last time the driver looked */
  private kitOn = false
  /** where the die's LFO has got to, and what it is worth this sample */
  private amPhase = 0
  private vibPhase = 0
  private amGain = 1
  private vibFactor = 1
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
  // Notes struck on the chip's own keys, waiting for the block to start. A key
  // pressed between two blocks is a message on a queue rather than a wire, so
  // it lands with the patch the block is about to run rather than the one the
  // last block left standing.
  private queued: { note: number; vol: number }[] = []
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
    lfo: -1,
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
    // The percussion bank keys the same way and off the same kind of edge, only
    // with three keys in one byte instead of one key per register — so a wire
    // that cannot fall is a drum that never lifts, exactly as it is a note that
    // never ends one register up.
    if (reg === REG.rhythm) {
      this.kitKeys(before, this.regs[reg]!)
      return
    }
    const ch = reg - REG.keyBlock
    if (ch < 0 || ch >= N_CH) return
    const was = (before & KEY_ON) !== 0
    const now = (this.regs[reg]! & KEY_ON) !== 0
    if (now && !was) this.attack(ch)
    else if (was && !now) this.release(ch)
  }

  // Three drums keyed out of one byte. The bass drum is an ordinary pair of
  // operators so both of its slots move together; the snare and the hi-hat have
  // a slot each on the channel above and move on their own.
  private kitKeys(before: number, now: number) {
    if ((now & RHY.on) === 0) return
    const bass = this.ch[RHYTHM_CH]!
    const pair = this.ch[RHYTHM_CH + 1]!
    const edge = (bit: number, op: Op, other?: Op) => {
      const was = (before & bit) !== 0
      const is = (now & bit) !== 0
      if (is && !was) {
        op.stage = ATTACK
        op.phase = 0
        op.fb1 = 0
        op.fb2 = 0
        if (other) {
          other.stage = ATTACK
          other.phase = 0
          other.fb1 = 0
          other.fb2 = 0
        }
      } else if (was && !is) {
        if (op.stage !== IDLE) op.stage = RELEASE
        if (other && other.stage !== IDLE) other.stage = RELEASE
      }
    }
    edge(RHY.bass, bass.car, bass.mod)
    edge(RHY.snare, pair.car)
    edge(RHY.hat, pair.mod)
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
    // The two writes every driver for this part sends before anything else,
    // and the only times one goes near either register: the test bits cleared,
    // and the percussion bank put where the panel says it should be. Both are
    // bytes on the same eight wires as the patch, so both are what they mean
    // exactly as far as the wires allow — which is how a chip nobody asked for
    // drums from can end up making them, one bit at a time.
    this.write(REG.test, 0)
    this.write(REG.rhythm, this.kitOn ? RHY.on : 0)
    const bytes = PATCH_BYTES[voice] ?? PATCH_BYTES[0]!
    for (let i = 0; i < 8; i++) {
      let byte = bytes[i]!
      if (i === REG.modLevel) {
        // Brightness is the modulator's own volume, and the register counts
        // attenuation, so a brighter patch is a smaller number.
        byte =
          (byte & 0xc0) | Math.round((byte & 0x3f) * (1 - panel.bright * 0.9))
      }
      // The button is the same two bits in both flags bytes, because one LFO
      // serving the whole die is one switch on the front of the case. It only
      // ever sets them: a voice that came with a wobble keeps it with the
      // button up, exactly as a voice keeps its ratios with the knobs at zero.
      if (panel.lfo > 0 && (i === REG.modFlags || i === REG.carFlags))
        byte |= LFO_BITS[panel.lfo]!
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

  // The rhythm button, going down or coming up. Everything it does it does
  // through the register file, because there is no other way in: the mode bit
  // and the kit's tuning are writes like any other, so they cross the same
  // wires and land wherever those wires let them. A knife on the bus can leave
  // the button pressed with nothing switched over, or switched over with the
  // button up.
  private sendRhythm(on: boolean) {
    if (on) {
      // Where ROM says the bass drum sits, out through the ordinary frequency
      // registers — the one part of the kit still tuned rather than fixed.
      this.write(REG.fnumLo + RHYTHM_CH, BASS_FNUM & 0xff)
      this.write(
        REG.keyBlock + RHYTHM_CH,
        ((BASS_FNUM >> 8) & 1) | (BASS_BLOCK << 1),
      )
      // And the noise pair, whose registers no longer pick a note — what they
      // still decide is how fast the hi-hat's gate runs.
      this.write(REG.fnumLo + RHYTHM_CH + 1, 0)
      this.write(REG.keyBlock + RHYTHM_CH + 1, (5 << 1) | 1)
      this.write(REG.instVol + RHYTHM_CH, 0)
      this.write(REG.instVol + RHYTHM_CH + 1, 0)
    }
    this.write(REG.rhythm, on ? RHY.on : 0)
  }

  // Which drum a strike is, once it has reached a chip that has no notes left
  // to play it as. The kit's own lines keep their voices — a kick is a bass
  // drum — and everything arriving on the key line is a bass drum too, because
  // that is the one a driver puts under a melody.
  private keyDrum(bit: number) {
    const r = this.regs[REG.rhythm]!
    // Down and up in the same breath: the key bit has to fall before it can
    // rise again, or the die sees no edge and the drum does not restrike.
    this.write(REG.rhythm, r & ~bit)
    this.write(REG.rhythm, r | bit)
  }

  // A driver running an effect keeps the top channel for it and gives the
  // keyboard the rest, which is what four channels and one effect button always
  // meant: the sound the button makes is a voice you no longer have.
  private pick(note: number): Channel {
    const free = this.kitOn ? RHYTHM_CH : this.effect >= 0 ? EFFECT_CH : N_CH
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

  // The chip's own keys, for whoever cut the jumper off the toy's gate. A hand
  // is a hand at either end of that wire: the key stays down until it comes up,
  // so nothing here decides a length. Weight lands where a strike's weight can
  // land on this part at all — the volume nibble, four steps of it.
  noteOn(note: number, gain = 1) {
    const vol = Math.min(Math.max(Math.round((1 - gain) * 3), 0), 3)
    // A chip with its level at the floor is a chip the chain steps over, so
    // nothing drains this. Four channels means four notes are all it could
    // strike anyway, and the ones underneath would be stolen the moment it
    // came back up — so the queue holds the last of them rather than growing
    // for as long as the level is down.
    if (this.queued.length >= N_CH) this.queued.shift()
    this.queued.push({ note, vol })
  }

  noteOff(note: number) {
    const n = this.melodyChannels()
    for (let i = 0; i < n; i++) if (this.ch[i]!.note === note) this.keyOff(i)
  }

  /** Every note the chip is holding down, for the panel's second keybed — its
      own keys, the toy's gate where that is still soldered on, and whatever the
      kit's trigger lines struck. The effect ROM's channels are not notes
      anybody played, so a bird call lights nothing. */
  soundingNotes(out: Int16Array): number {
    let n = 0
    const chans = this.melodyChannels()
    for (let i = 0; i < chans; i++) {
      const c = this.ch[i]!
      if (c.car.stage !== IDLE) out[n++] = c.note
    }
    return n
  }

  /** How many channels the keyboard still has. The effect script takes the top
      one; the percussion bank takes the top two, and takes them first, because
      a driver that has been asked for drums does not have a fourth voice to
      lend an effect either. */
  private melodyChannels() {
    if (this.kitOn) return RHYTHM_CH
    return this.effect >= 0 ? EFFECT_CH : N_CH
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
  // One operator's rate set, off the four bytes that describe it. The scale is
  // the rail: every rate on this chip is counted off the same divider as the
  // pitch and the tempo, so a starving board stretches all of them together.
  private rates(
    out: Rates,
    clockFactor: number,
    key: number,
    flags: number,
    ad: number,
    sr: number,
    level: number,
    half: number,
    ksl: number,
    fb: number,
  ) {
    const scale = Math.max(clockFactor, 0.05)
    // Every rate goes past the octave on the way out of the nibble. With the
    // scaling bit clear that is the nibble itself; with it set the counter
    // takes the note's own octave into the step it walks, which is what stops a
    // patch that rings for a second at the bottom of the keyboard from ringing
    // for a second at the top of it as well.
    const a = scaledRate(ad >> 4, key, flags)
    const d = scaledRate(ad & 0x0f, key, flags)
    const r = scaledRate(sr & 0x0f, key, flags)
    out.mult = MULT[flags & 0x0f]!
    out.sustained = (flags & 0x20) !== 0
    out.am = (flags & AM) !== 0
    out.vib = (flags & VIB) !== 0
    out.attack = 1 - Math.exp(-1 / (attackSecs(a) * scale * this.sr))
    out.decay = Math.exp(-1 / (fallSecs(d) * scale * this.sr))
    out.release = Math.exp(-1 / (fallSecs(r) * scale * this.sr))
    out.sustain = atten(sr >> 4, 3)
    out.level = level
    out.half = half
    out.ksl = ksl
    out.fb = fb
  }

  // Both operators of one channel, off eight bytes and the key register. The
  // bytes are the register file's own or the die's, and nothing below here can
  // tell which — a patch is eight numbers whichever side of the bus it came
  // from, which is the whole reason the nibble is worth cutting.
  private readOperators(
    out: { mod: Rates; car: Rates },
    bytes: ArrayLike<number>,
    key: number,
    clockFactor: number,
  ) {
    const shape = bytes[REG.feedback]!
    const modLevel = bytes[REG.modLevel]!
    this.rates(
      out.mod,
      clockFactor,
      key,
      bytes[REG.modFlags]!,
      bytes[REG.modAttack]!,
      bytes[REG.modSustain]!,
      atten(modLevel & 0x3f, 0.75),
      shape & MOD_HALF,
      modLevel >> KSL_SHIFT,
      (shape & 0x07) === 0 ? 0 : Math.pow(2, (shape & 0x07) - 8),
    )
    this.rates(
      out.car,
      clockFactor,
      key,
      bytes[REG.carFlags]!,
      bytes[REG.carAttack]!,
      bytes[REG.carSustain]!,
      1,
      shape & CAR_HALF,
      shape >> KSL_SHIFT,
      0,
    )
  }

  // The kit's rates, which come out of ROM rather than out of the register
  // file — so a knife on the patch bytes never reaches them, and the drums stay
  // crisp on a board where nothing else does. The rail still reaches them.
  private readKit(clockFactor: number) {
    // The kit is keyed off its own byte rather than off a key register, so
    // there is no octave for the scaling hardware to read and every drum counts
    // at the rate ROM gave it. A drum machine has no top of the keyboard.
    this.readOperators(this.bass, KIT.bass, 0, clockFactor)
    this.rates(
      this.snareRates,
      clockFactor,
      0,
      1,
      KIT.snare.ad,
      KIT.snare.sr,
      1,
      0,
      0,
      0,
    )
    this.rates(
      this.hatRates,
      clockFactor,
      0,
      1,
      KIT.hat.ad,
      KIT.hat.sr,
      1,
      0,
      0,
      0,
    )
  }

  // Every melody channel's patch, once a block. Which eight bytes a channel
  // reads is the top nibble of its volume register: zero is the register file,
  // where the processor has just put whichever voice the panel asked for, and
  // anything else is one of the fifteen the die holds in ROM. The driver only
  // ever writes zero there, so on an unbroken board this is four channels
  // reading the same eight bytes and the loop below cannot tell.
  private readPatch(clockFactor: number) {
    for (let n = 0; n < N_CH; n++) {
      const inst = this.regs[REG.instVol + n]! >> 4
      this.readOperators(
        this.chRates[n]!,
        inst === 0 ? this.regs : ROM_PATCH_BYTES[inst - 1]!,
        this.regs[REG.keyBlock + n]!,
        clockFactor,
      )
    }

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

  // The two channels the mode bit took. One is an ordinary pair of operators
  // tuned where ROM says; the other has had both its slots cut off from the
  // sine table and handed the shift register, which is why nothing here has a
  // pitch — what the frequency registers still decide on that one is how fast
  // the hi-hat's gate runs, and that is the whole difference between a tick and
  // a ring.
  private percussion(
    n: number,
    c: Channel,
    raced: boolean,
    wideOpen: boolean,
    pitch: number,
  ) {
    const key = this.regs[REG.keyBlock + n]!
    const fnum = this.regs[REG.fnumLo + n]! | ((key & 1) << 8)
    const inc =
      ((fnum / FNUM_FULL) * FNUM_BASE * Math.pow(2, (key >> 1) & 7) * pitch) /
      this.sr
    const vol = this.volume(n)

    if (n === RHYTHM_CH) {
      if (c.car.stage === IDLE) return 0
      // The test bit races the envelope counter and nothing else. What an
      // operator is — its multiplier, its level, how much of itself it gets
      // back — is the patch's business either way, and no counter is involved
      // in any of it.
      const mod = this.bass.mod
      const car = this.bass.car
      this.stepEnv(c.mod, raced ? this.raceRates : mod)
      this.stepEnv(c.car, raced ? this.raceRates : car)
      c.mod.phase = (c.mod.phase + inc * mod.mult) % 1
      const self = (c.mod.fb1 + c.mod.fb2) * mod.fb
      const m =
        this.wave(c.mod.phase + self, 0) *
        (wideOpen ? 1 : c.mod.env) *
        mod.level
      c.mod.fb2 = c.mod.fb1
      c.mod.fb1 = m
      c.car.phase = (c.car.phase + inc * car.mult) % 1
      return (
        this.wave(c.car.phase + m * 2, 0) * (wideOpen ? 1 : c.car.env) * vol
      )
    }

    // The shift register is clocked off this channel's own phase generator
    // rather than off the sample, which is what gives the hiss a colour instead
    // of being white: the bit holds between clocks, so the register these two
    // slots no longer use for a note still decides how coarse the noise is.
    // Wind it down and the kit turns into a rumble; wind it up and it turns
    // into sand. Nothing else on the chip makes that sweep.
    //
    // The two slots take it at different rates off the one divider, which is
    // the whole of why they do not sound alike: the hi-hat gets every bit, and
    // the snare latches one in eight and holds it, so the same register is sand
    // at one tap and a rattle at the other.
    this.noiseClock += inc * HAT_MULT
    while (this.noiseClock >= 1) {
      this.noiseClock -= 1
      this.hiss = this.noise.step()
    }
    this.snareClock += inc
    while (this.snareClock >= 1) {
      this.snareClock -= 1
      this.snareHiss = this.hiss
    }

    let out = 0
    if (c.car.stage !== IDLE) {
      // The snare. The die switches the table out rather than disconnecting it,
      // so a little of the operator's own phase is still in there — which is
      // why a real one is pitched rather than pure sand.
      this.stepEnv(c.car, raced ? this.raceRates : this.snareRates)
      c.car.phase = (c.car.phase + inc) % 1
      out +=
        (this.snareHiss * 0.75 + this.wave(c.car.phase, 0) * 0.25) *
        (wideOpen ? 1 : c.car.env)
    }
    if (c.mod.stage !== IDLE) {
      // And the hi-hat, which is the same register gated off a phase eight
      // times up: what makes it metal rather than more sand.
      this.stepEnv(c.mod, raced ? this.raceRates : this.hatRates)
      c.mod.phase = (c.mod.phase + inc * HAT_MULT) % 1
      out +=
        (this.wave(c.mod.phase, 0) > 0 ? this.hiss : -this.hiss) *
        (wideOpen ? 1 : c.mod.env) *
        0.7
    }
    return out * vol
  }

  // The LFO, one step on. Both counters run whether or not any operator is
  // listening — there is no enable anywhere on the die, only a pair of bits per
  // patch deciding who is soldered to the result — so a note that arrives finds
  // the wobble already somewhere rather than starting it.
  private stepLfo(clockFactor: number) {
    this.amPhase = (this.amPhase + (AM_HZ * clockFactor) / this.sr) % 1
    this.vibPhase = (this.vibPhase + (VIB_HZ * clockFactor) / this.sr) % 1
    this.amGain = AM_GAIN[(Math.abs(this.amPhase - 0.5) * 126) | 0]!
    this.vibFactor = VIB_FACTOR[(this.vibPhase * 8) | 0]!
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
      lfo: Math.round(p[IDX.fmLfo]!),
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
    // The kit's notes are the wire's choice rather than anybody's, so the key
    // line's matrix gets them too — a riff off a drum pattern in whatever key
    // the rest of the board is in.
    const keyScale = Math.round(p[IDX.keyScale]!)
    const keyRoot = Math.round(p[IDX.keyRoot]!)
    // The jumper off the toy's gate. Cut it and the chip stops hearing the
    // keyboard next door — its own keys, the kit's lines and the effect ROM are
    // all still soldered where they were.
    const gateOn = p[IDX.fmKeyGate]! < 0.5

    const effect = Math.round(p[IDX.fmEffect]!) - 1
    if (effect !== this.effect) this.setEffect(effect)
    const script = EFFECTS[this.effect]

    // The rhythm button. An effect and the kit want the same channels and the
    // effect asked first, so pressing one puts the other down — which is the
    // arithmetic of four voices and no more, not a rule anybody wrote.
    const wantKit = p[IDX.fmRhythm]! > 0.5 && this.effect < 0
    if (wantKit !== this.kitOn) {
      this.kitOn = wantKit
      this.sendRhythm(wantKit)
    }
    // What the die is actually doing, which is a different question: the button
    // is on the panel and the mode bit is in the register file, and everything
    // between them is wire.
    const kit = (this.regs[REG.rhythm]! & RHY.on) !== 0

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
      panel.lfo !== sent.lfo ||
      panel.modRatio !== sent.modRatio ||
      panel.carRatio !== sent.carRatio ||
      panel.modDecay !== sent.modDecay
    ) {
      this.sentVoice = voice
      this.sent = panel
      if (this.effect < 0) this.sendVoice(voice, panel)
    }

    this.readPatch(rail.clockFactor)
    if (kit) this.readKit(rail.clockFactor)
    // The keys, before the block: held, because a hand is holding them.
    for (const q of this.queued) this.keyOn(q.note, 0, q.vol)
    this.queued.length = 0
    const drive = 0.4
    let load = 0

    for (let i = 0; i < io.n; i++) {
      this.stepLfo(rail.clockFactor)

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
      //
      // A gate carries a level as well as an edge, and the driver reads it: a
      // key with a hand still on it is a note nothing has to guess the length
      // of, so the processor holds it and writes the key back up when the hand
      // comes off. Everything else on that wire — the ROM's tune, a drum hit
      // through the patch — is an edge and nothing more, and an edge is where
      // *Note length* comes in.
      const struck = gateOn ? ctx.trig.key[i]! : 0
      if (struck !== 0) {
        this.keyOn(struck - 128, ctx.trig.keyHeld[i]! > 0 ? 0 : lengthSamples)
        // With the bank switched over there is a bass drum sitting on the
        // channel the note would have had, and a driver asked for rhythm puts
        // it under every note — which is the whole of what the button was for.
        if (kit) this.keyDrum(RHY.bass)
      }

      // And the kit's own lines, for whoever clipped them on here as well. The
      // kit is wired behind this chip in the source order, so what arrives is
      // last block's hits — 2.7 ms, which is under the resolution of a trigger
      // line and nowhere near the resolution of a drum machine.
      if (drumMask !== 0) {
        const bits = Math.round(ctx.trig.drumBits[i]!) & drumMask
        if (bits !== 0) {
          const vol = Math.round((1 - ctx.trig.drumGain[i]! / ACCENT_GAIN) * 3)
          for (let v = 0; v < N_DRUM_VOICES; v++) {
            if ((bits & (1 << v)) === 0) continue
            // A trigger line carries a strike and nothing else, so what it
            // becomes is decided at this end. With the bank switched over there
            // is somewhere for a strike to go as a strike, and the kit next
            // door lands on the kit on the die — otherwise it has to come out
            // as a note, which is the wire's own choice of one.
            if (kit) this.keyDrum(DRUM_KEYS[v]!)
            else
              this.keyOn(
                snap(DRUM_NOTES[v]!, keyScale, keyRoot),
                lengthSamples,
                Math.max(vol, 0),
              )
          }
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
        if (kit && n >= RHYTHM_CH) {
          sum += this.percussion(n, c, raced, wideOpen, pitch)
          continue
        }
        if (c.car.stage === IDLE) continue

        // Frequency straight back out of the registers rather than off the note
        // that was asked for, so a byte that landed wrong is a pitch that comes
        // out wrong.
        const key = this.regs[REG.keyBlock + n]!
        const fnum = this.regs[REG.fnumLo + n]! | ((key & 1) << 8)
        const block = (key >> 1) & 7
        const hz = (fnum / FNUM_FULL) * FNUM_BASE * Math.pow(2, block) * pitch

        const { mod, car } = this.chRates[n]!
        this.stepEnv(c.mod, raced ? this.raceRates : mod)
        this.stepEnv(c.car, raced ? this.raceRates : car)
        // Wide open is not a loud envelope, it is no envelope: the stages go on
        // running underneath, so notes still start and still end — they simply
        // stop having a shape between the two.
        //
        // Key scaling and the tremolo ride on top of whatever is left, because
        // neither is an envelope: one is what the octave costs an operator and
        // the other is a counter nothing on this chip can address, and both go
        // on taking level from a note whose envelope has stopped having a shape.
        const modAm = mod.am ? this.amGain : 1
        const carAm = car.am ? this.amGain : 1
        const modEnv =
          (wideOpen ? 1 : c.mod.env) * kslGain(mod.ksl, block, fnum) * modAm
        const carEnv =
          (wideOpen ? 1 : c.car.env) * kslGain(car.ksl, block, fnum) * carAm

        const inc = hz / this.sr
        // The vibrato is one staircase for the die, so two operators wired to
        // it step together and stay in ratio. An operator wired to it against
        // one that is not is the pair coming apart and going back, which is the
        // only detune anywhere on a chip that has no detune register.
        c.mod.phase =
          (c.mod.phase + inc * mod.mult * (mod.vib ? this.vibFactor : 1)) % 1
        const self = (c.mod.fb1 + c.mod.fb2) * mod.fb
        const m = this.wave(c.mod.phase + self, mod.half) * modEnv * mod.level
        c.mod.fb2 = c.mod.fb1
        c.mod.fb1 = m

        c.car.phase =
          (c.car.phase + inc * car.mult * (car.vib ? this.vibFactor : 1)) % 1
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

  /** What the percussion bank's register holds, for a test to read. The button
      is on the panel and the bit is in the register file, and the whole of the
      bend is that those two can disagree. */
  rhythmReg() {
    return this.regs[REG.rhythm]!
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
    this.noise.reset()
    this.amPhase = 0
    this.vibPhase = 0
    this.amGain = 1
    this.vibFactor = 1
    this.hiss = 0
    this.snareHiss = 0
    this.noiseClock = 0
    this.snareClock = 0
    this.kitOn = false
    this.dataBus.reset()
    this.addrBus.reset()
    this.waveBus.reset()
    this.queued.length = 0
    this.held = 0
    this.addrLatch.reset()
    this.sentVoice = -1
    this.sent.bright = -1
  }
}
