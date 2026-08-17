import { Chain } from './chain'
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
import { SpringVerb } from './stages/springVerb'
import { TapeDelay } from './stages/tapeDelay'
import { ToyChip } from './stages/toyChip'
import { ToyDrum } from './stages/toyDrum'

export interface BuiltChain {
  chain: Chain
  toyChip: ToyChip
  sampler: Sampler
}

export function buildBender(sr: number): BuiltChain {
  const chain = new Chain(sr)
  const rail = new ToyRail(sr)
  const toyChip = new ToyChip(sr, rail)
  const sampler = new Sampler()
  chain.sources = [toyChip, new ToyDrum(sr, rail), new ChaosOsc(sr), new Noise(sr), sampler]
  // ids match the bendSlot choices: 1 ring, 2 crush, 3 dist, 4 comb, 5 glitch, 6 filt
  chain.bendById = [
    undefined,
    new RingMod(sr),
    new Crusher(sr),
    new Shaper(sr),
    new Comb(sr),
    new GlitchBuf(sr),
    new Screech(sr),
  ]
  chain.pedals = [new TapeDelay(sr), new SpringVerb(sr)]
  chain.post = [new Brownout(sr)]
  return { chain, toyChip, sampler }
}

export function buildChain(sr: number): Chain {
  return buildBender(sr).chain
}
