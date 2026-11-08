import { DEST } from '../dsp/modbus.ts'
import { FM_VOICE_NAMES } from '../dsp/stages/fmVoices.ts'
import { choiceValue } from '../ui/controls/index.ts'
import { kit, tune } from '../ui/presets/write.ts'

import type { Controls } from '../controls.ts'

const SRC = {
  lfo: choiceValue('mod0Src', 'LFO'),
  env: choiceValue('mod0Src', 'envelope'),
  laneA: choiceValue('mod0Src', 'lane A'),
  phrase: choiceValue('mod0Src', 'phrase'),
}
const SAW = choiceValue('oscShape', 'saw')
const FB_TO_OSC = choiceValue('fbDest', 'osc FM')

const phrase = (bars: number, shape: 'swell' | 'stairs') => ({
  modPhraseBars: choiceValue('modPhraseBars', String(bars)),
  modPhraseShape: choiceValue('modPhraseShape', shape),
})

const lane = (name: 'A' | 'B', steps: number[]) =>
  Object.fromEntries(steps.map((v, i) => [`modLane${name}${i}`, v]))

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
      ...phrase(8, 'swell'),
      outGain: 11,
      revMix: 0.25,
      revDecayS: 3,
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
      ...phrase(4, 'stairs'),
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
      ...phrase(4, 'stairs'),
      noiseLevel: 0.15,
      echoLevel: 0.4,
      revMix: 0.3,
      revDecayS: 3,
    },
  },
]
