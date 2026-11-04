import { MEMORY_SYNC_MODES } from '../dsp/melodyMemory.ts'
import { DEST } from '../dsp/modbus.ts'
import { FM_VOICE_NAMES } from '../dsp/stages/fmVoices.ts'
import { PCM_VOICE_NAMES } from '../dsp/stages/pcmRom.ts'
import { BENDS } from '../ui/controls/bends.ts'
import { kit, line, tune } from '../ui/presets/write.ts'

import type { Controls } from '../controls.ts'

const SRC = {
  lfo: 1,
  env: 3,
  laneA: 12,
  laneB: 13,
  phrase: 14,
}
const PHRASE_BARS = [1, 2, 4, 8, 16, 32]
const PHRASE_SHAPE = { rise: 0, swell: 3, stairs: 4 }
const GROUND = 1
const SAW = 1
const HARD = 1
const FB_TO_OSC = 1
const GARBAGE = 1

const phrase = (bars: number, shape: number) => ({
  modPhraseBars: PHRASE_BARS.indexOf(bars),
  modPhraseShape: shape,
})

const lane = (name: 'A' | 'B', steps: number[]) =>
  Object.fromEntries(steps.map((v, i) => [`modLane${name}${i}`, v]))

const bendSlot = (group: (typeof BENDS)[number]['group']) =>
  BENDS.findIndex(b => b.group === group) + 1

const held = (...notes: string[]) =>
  notes.map(n => `${n}${' ~'.repeat(15)}`).join(' ')

const CLUSTERS = tune(held('D4', 'D#4'), held('A3', 'G#3'), held('C#4', 'E4'))

const NO_PULSE = { ...kit({}), drumLevel: 0 }

export interface DemoScene {
  name: string
  says: string
  board: Partial<Controls>
}

export const DEMO_SCENES: DemoScene[] = [
  {
    name: 'the toy writes into the fm chip',
    says: 'Glint holds slow string clusters while the toy, almost too quiet to hear, is soldered onto its data bus, so every edge of the toy’s output lands in whichever register the FM chip last wrote, its pitch, its keys or its patch',
    board: {
      ...CLUSTERS,
      ...NO_PULSE,
      drumBpm: 60,
      chipLevel: 0.12,
      chipLfsr: 0.15,
      fmLevel: 1,
      fmVoice: FM_VOICE_NAMES.indexOf('strings'),
      mod0Src: SRC.phrase,
      mod0Dest: DEST.fmToyBus,
      mod0Depth: 0.4,
      ...phrase(8, PHRASE_SHAPE.swell),
      outGain: 11,
      revMix: 0.25,
      revDecayS: 3,
    },
  },
  {
    name: 'the fm chip decays',
    says: 'Glint boots into garbage, so channels drone at random pitches on random instruments, its registers leak a little more every bar, and a slow wave feeds its operators into one loop that breaks some notes into noise and leaves others clean',
    board: {
      ...CLUSTERS,
      ...NO_PULSE,
      drumBpm: 66,
      chipLevel: 0,
      fmLevel: 1,
      fmVoice: FM_VOICE_NAMES.indexOf('strings'),
      fmColdBoot: GARBAGE,
      mod0Src: SRC.phrase,
      mod0Dest: DEST.fmRot,
      mod0Depth: 0.12,
      ...phrase(4, PHRASE_SHAPE.stairs),
      mod1Src: SRC.lfo,
      mod1Dest: DEST.fmRing,
      mod1Depth: 0.3,
      modLfoHz: 0.07,
      outGain: 8,
      revMix: 0.3,
      revDecayS: 4,
    },
  },
  {
    name: 'the sampler eats the chord',
    says: 'Parlor writes its own mix back into sample memory, so each lap plays what the last one wrote, and held chords sum themselves into noise faster every bar until the wire lets go and the memory reads clean',
    board: {
      ...tune(held('C5', 'B4'), held('E4', 'D4'), held('A3', 'G3')),
      ...NO_PULSE,
      drumBpm: 80,
      chipLevel: 0,
      pcmLevel: 3,
      pcmVoice: PCM_VOICE_NAMES.indexOf('glass pad'),
      mod0Src: SRC.phrase,
      mod0Dest: DEST.pcmWrite,
      mod0Depth: 0.2,
      ...phrase(4, PHRASE_SHAPE.stairs),
      mod1Src: SRC.lfo,
      mod1Dest: DEST.pcmSignDir,
      mod1Depth: 0.4,
      modLfoHz: 0.15,
      revMix: 0.3,
      revDecayS: 4,
    },
  },
  {
    name: 'choir on a cracked rom',
    says: 'Parlor’s choir holds slow chords while a grounded address line climbs the sample ROM a wire a bar, and the keyboard’s processor bleeds its key scan into the voices, folding them in on themselves until they come back clean',
    board: {
      ...tune(
        'E4 ~ ~ ~ ~ ~ ~ ~ D4 ~ ~ ~ ~ ~ ~ ~ C4 ~ ~ ~ ~ ~ ~ ~ B3 ~ ~ ~ ~ ~ ~ ~',
        'A3 ~ ~ ~ ~ ~ ~ ~ G3 ~ ~ ~ ~ ~ ~ ~ F3 ~ ~ ~ ~ ~ ~ ~ E3 ~ ~ ~ ~ ~ ~ ~',
        'C4 ~ ~ ~ ~ ~ ~ ~ B3 ~ ~ ~ ~ ~ ~ ~ A3 ~ ~ ~ ~ ~ ~ ~ G#3 ~ ~ ~ ~ ~ ~ ~',
      ),
      ...NO_PULSE,
      drumBpm: 72,
      chipLevel: 0,
      pcmLevel: 1.4,
      pcmVoice: PCM_VOICE_NAMES.indexOf('choir'),
      pcmEnv: 2,
      pcmRelease: 1.2,
      pcmAddrFault: GROUND,
      mod0Src: SRC.phrase,
      mod0Dest: DEST.pcmAddrLine,
      mod0Depth: 0.8,
      ...phrase(4, PHRASE_SHAPE.stairs),
      mod1Src: SRC.lfo,
      mod1Dest: DEST.pcmCpuBus,
      mod1Depth: 0.25,
      modLfoHz: 0.05,
      bendSlot0: bendSlot('Rack verb'),
      rackMix: 0.3,
      rackDecay: 0.92,
      rackSize: 2.2,
      rackWander: 0,
    },
  },
  {
    name: 'growler chokes on its own howl',
    says: 'Growler plays four slow notes, each sinking as its pitch capacitor leaks, while its output is patched back into its own mixer, pitch and gate a little more every bar, until the howl drags its own pitch around and keeps shutting its own gate, cutting itself into a rhythm nobody wrote, then starts clean',
    board: {
      ...NO_PULSE,
      ...line('E3 ~ ~ ~ C3 ~ ~ ~ F3 ~ ~ ~ B2 ~ ~ ~'),
      monoSeqSync: MEMORY_SYNC_MODES.indexOf('quarters'),
      drumBpm: 90,
      chipLevel: 0,
      monoWave1: SAW,
      monoWave2: SAW,
      monoMix1: 0.6,
      monoMix2: 0.5,
      monoMix3: 0,
      monoSync: HARD,
      monoTune2: 7,
      monoFm: 0.6,
      monoHeat: 0.5,
      monoDroop: 0.8,
      monoCutoff: 1200,
      monoEmph: 0.9,
      monoGate: 1,
      monoAS: 1,
      monoLevel: 1.2,
      monoLoop: 0.7,
      monoChoke: 0.6,
      mod0Src: SRC.phrase,
      mod0Dest: DEST.monoLoopPitch,
      mod0Depth: 0.9,
      mod1Src: SRC.phrase,
      mod1Dest: DEST.monoChoke,
      mod1Depth: 0.3,
      ...phrase(4, PHRASE_SHAPE.rise),
      outGain: 8,
      revMix: 0.2,
      revDecayS: 2,
    },
  },
  {
    name: 'the kit picks its own steps',
    says: 'A loose contact lets Clatter’s own output choose which step of the pattern plays next, and its memory leaks, so a plain beat stumbles into rhythms nobody wrote, more of them every bar, and finds its way back',
    board: {
      ...kit({
        kick: 'x.....x...x.....',
        snare: '....x.......x...',
        hat: 'x.x.x.x.x.x.x.x.',
        tom: '.......x......x.',
        bell: '..x.........x...',
      }),
      drumBpm: 92,
      chipLevel: 0,
      drumLevel: 1.2,
      drumMetal: 0.6,
      drumRot: 0.4,
      mod0Src: SRC.phrase,
      mod0Dest: DEST.drumOutAddr,
      mod0Depth: 0.9,
      ...phrase(4, PHRASE_SHAPE.stairs),
      echoLevel: 0.3,
      revMix: 0.2,
      revDecayS: 2,
    },
  },
  {
    name: 'the mixer plays itself',
    says: 'Nothing is plugged in: the desk’s output is wired into a chaos oscillator’s FM input, a slow step lane drags its pitch around, and the louder the loop gets the harder it feeds itself',
    board: {
      ...NO_PULSE,
      drumBpm: 60,
      chipLevel: 0,
      oscLevel: 0.6,
      oscShape: SAW,
      oscAHz: 110,
      oscBHz: 0.7,
      oscXmod: 400,
      fbAmt: 0.6,
      fbDest: FB_TO_OSC,
      fbDelayMs: 3,
      fbTone: 0.5,
      ...lane('A', [0, 0, 0, 0, 1, 1, 1, 1, 6, 6, 6, 6, 7, 7, 7, 7]),
      mod0Src: SRC.laneA,
      mod0Dest: DEST.oscHz,
      mod0Depth: 0.25,
      mod1Src: SRC.env,
      mod1Dest: DEST.fbAmt,
      mod1Depth: 0.6,
      mod2Src: SRC.phrase,
      mod2Dest: DEST.fbMs,
      mod2Depth: 0.5,
      ...phrase(4, PHRASE_SHAPE.stairs),
      noiseLevel: 0.15,
      echoLevel: 0.4,
      revMix: 0.3,
      revDecayS: 3,
    },
  },
]
