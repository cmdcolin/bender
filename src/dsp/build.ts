import { Chain } from './chain.ts'
import { MelodyMemory } from './melodyMemory.ts'
import { Amp } from './stages/amp.ts'
import { Brownout } from './stages/brownout.ts'
import { ChaosOsc } from './stages/chaosOsc.ts'
import { Clipper } from './stages/clipper.ts'
import { Comb } from './stages/comb.ts'
import { Crusher } from './stages/crusher.ts'
import { Echo } from './stages/echo.ts'
import { Ensemble } from './stages/ensemble.ts'
import { FmChip } from './stages/fmChip.ts'
import { FourTrack } from './stages/fourTrack.ts'
import { GlitchBuf } from './stages/glitchBuf.ts'
import { MonoSynth } from './stages/monoSynth.ts'
import { Noise } from './stages/noise.ts'
import { Octave } from './stages/octave.ts'
import { PcmKeys } from './stages/pcmKeys.ts'
import { RingMod } from './stages/ringmod.ts'
import { Sampler } from './stages/sampler.ts'
import { Screech } from './stages/screech.ts'
import { Shifter } from './stages/shifter.ts'
import { SpringVerb } from './stages/springVerb.ts'
import { Stompbox } from './stages/stompbox.ts'
import { Tape } from './stages/tape.ts'
import { TapeDelay } from './stages/tapeDelay.ts'
import { ToyChip } from './stages/toyChip.ts'
import { ToyDrum } from './stages/toyDrum.ts'
import { Supplies } from './supplies.ts'
import { ToyRail } from './toyRail.ts'
import { Transport } from './transport.ts'
import { mulberry32 } from './util/rng.ts'

export interface BuiltChain {
  chain: Chain
  toyChip: ToyChip
  toyDrum: ToyDrum
  fmChip: FmChip
  pcmKeys: PcmKeys
  monoSynth: MonoSynth
  melody: MelodyMemory
  sampler: Sampler
  fourTrack: FourTrack
  transport: Transport
  /** The shared toy supply, out here because it is the one state worth watching
      from outside the audio thread: the panel draws it, and a test asks it
      whether the watchdog tripped. */
  rail: ToyRail
  /** The shared cells, the second cells and the bench supply. */
  supplies: Supplies
  /** A key let go of, which reaches all four chips. The strike travels the gate line
      on its own, so nobody has to hand it anywhere; a finger coming up is the
      half of a note no wire between them carries, and both ends need it — the
      toy to drop the voice it is holding, the FM chip to write the key back up
      on a note it was told to hold, the home keyboard to let go of whatever its
      chord button put under that key. */
  noteOff(semitone: number): void
}

// One seed for the whole instrument, drawn from it for each part that needs its
// own stream. A build seeded the same way renders the same audio, which is what
// the tests hold; the worklet seeds itself off the clock, so two takes of one
// board are two takes rather than the same file twice.
//
// Every part that holds an Rng draws here. A stream written into a stage
// instead is a stage that sounds the same on every boot of the instrument —
// which for the noise source is the whole of what it was for.
export function buildBender(sr: number, seed = 1): BuiltChain {
  const draw = mulberry32(seed)
  const next = () => (draw() * 0x1_0000_0000) >>> 0
  const chain = new Chain(sr, next())
  const rail = new ToyRail(sr, next())
  // Seeded off the build's seed rather than drawn, so every stream after it
  // stays the one it was.
  const supplies = new Supplies(sr, rail, seed)
  chain.supplies = supplies
  const transport = new Transport()
  const toyChip = new ToyChip(sr, supplies, transport, next())
  const toyDrum = new ToyDrum(sr, supplies, transport, next())
  const sampler = new Sampler(sr)
  const fmChip = new FmChip(sr, supplies)
  // The third die, which needs the sampler as well as the supply: its last
  // voice is not a ROM at all, it is whatever is threaded next door.
  const pcmKeys = new PcmKeys(sr, supplies, sampler)
  // The fourth, a monosynth voice card. It draws no seed, so every stream
  // after it stays the one it was.
  const monoSynth = new MonoSynth(sr, supplies)
  const melody = new MelodyMemory(sr, supplies, transport)
  chain.melody = melody
  // In SOURCE_TAPS order, which is the order their meter taps come home in — a
  // test holds the two lists together, because the panel reads a channel off
  // its slot number and a source in the wrong one would meter as its neighbour.
  chain.sources = [
    toyChip,
    toyDrum,
    fmChip,
    pcmKeys,
    monoSynth,
    new ChaosOsc(sr),
    new Noise(sr, next()),
    sampler,
  ]
  // ids match the bendSlot choices: 1 ring, 2 crush, 3 dist, 4 comb, 5 glitch,
  // 6 filt, 7 shift, 8 oct — six slots for eight bends, so you pick
  chain.bendById = [
    undefined,
    new RingMod(sr),
    new Crusher(sr, next()),
    new Clipper(sr, supplies),
    new Comb(sr),
    new GlitchBuf(sr, next()),
    new Screech(sr),
    new Shifter(sr),
    new Octave(sr),
  ]
  chain.pedals = [
    new Stompbox(sr),
    new TapeDelay(sr, next()),
    new Echo(sr),
    new SpringVerb(sr),
    new Ensemble(sr),
    new Amp(sr),
  ]
  const tape = new Tape(sr, next())
  chain.post = [new Brownout(sr, next()), tape]
  chain.tape = tape
  // Last of the sources and last to draw a seed, so every stream before it is
  // the one it was before the four-track was on the board.
  const fourTrack = new FourTrack(sr, next())
  chain.sources.push(fourTrack)
  return {
    chain,
    toyChip,
    toyDrum,
    fmChip,
    pcmKeys,
    monoSynth,
    melody,
    sampler,
    fourTrack,
    transport,
    rail,
    supplies,
    noteOff(semitone: number) {
      toyChip.noteOff(semitone)
      fmChip.gateOff(semitone)
      pcmKeys.gateOff(semitone)
      monoSynth.gateOff(semitone)
    },
  }
}

// Offline rendering (tests): both ROM sequencers run from the first sample.
export function buildChain(sr: number, seed = 1): Chain {
  const built = buildBender(sr, seed)
  built.transport.tune = true
  built.transport.drums = true
  return built.chain
}
