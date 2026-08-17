import { Chain } from './chain'
import { Transport } from './transport'
import { ToyRail } from './toyRail'
import { Brownout } from './stages/brownout'
import { ChaosOsc } from './stages/chaosOsc'
import { Comb } from './stages/comb'
import { Crusher } from './stages/crusher'
import { GlitchBuf } from './stages/glitchBuf'
import { Noise } from './stages/noise'
import { RingMod } from './stages/ringmod'
import { Sampler } from './stages/sampler'
import { Screech } from './stages/screech'
import { Shaper } from './stages/shaper'
import { Shifter } from './stages/shifter'
import { SpringVerb } from './stages/springVerb'
import { Stompbox } from './stages/stompbox'
import { Tape } from './stages/tape'
import { TapeDelay } from './stages/tapeDelay'
import { ToyChip } from './stages/toyChip'
import { ToyDrum } from './stages/toyDrum'

export interface BuiltChain {
  chain: Chain
  toyChip: ToyChip
  toyDrum: ToyDrum
  sampler: Sampler
  transport: Transport
}

export function buildBender(sr: number): BuiltChain {
  const chain = new Chain(sr)
  const rail = new ToyRail(sr)
  const transport = new Transport()
  const toyChip = new ToyChip(sr, rail, transport)
  const toyDrum = new ToyDrum(sr, rail, transport)
  const sampler = new Sampler()
  chain.sources = [toyChip, toyDrum, new ChaosOsc(sr), new Noise(sr), sampler]
  // ids match the bendSlot choices: 1 ring, 2 crush, 3 dist, 4 comb, 5 glitch,
  // 6 filt, 7 shift — six slots for seven bends, so you pick
  chain.bendById = [
    undefined,
    new RingMod(sr),
    new Crusher(sr),
    new Shaper(sr),
    new Comb(sr),
    new GlitchBuf(sr),
    new Screech(sr),
    new Shifter(sr),
  ]
  chain.pedals = [new Stompbox(sr), new TapeDelay(sr), new SpringVerb(sr)]
  chain.post = [new Brownout(sr), new Tape(sr)]
  return { chain, toyChip, toyDrum, sampler, transport }
}

// Offline rendering (tests): both ROM sequencers run from the first sample.
export function buildChain(sr: number): Chain {
  const built = buildBender(sr)
  built.transport.tune = true
  built.transport.drums = true
  return built.chain
}
