import { DEST } from '../dsp/modbus.ts'
import { ENS_MODE } from '../dsp/stages/ensemble.ts'
import { FM_VOICE_NAMES } from '../dsp/stages/fmVoices.ts'
import { PCM_VOICE_NAMES } from '../dsp/stages/pcmRom.ts'
import { DELAY_SYNC_MODES } from '../dsp/stages/tapeDelay.ts'
import { ANY_CHOICE } from '../dsp/trigbus.ts'
import { kit, line, tune } from '../ui/presets/write.ts'

import type { Controls } from '../controls.ts'

const SRC = { lfo: 1, laneA: 12, phrase: 14 }
const PHRASE_BARS = [1, 2, 4, 8, 16, 32]
const PHRASE_SHAPE = { rise: 0, build: 1, stairs: 4 }
const ARC_RISE = 1
const ARC_16_BARS = 2
const EVERY_4_BARS = 2
const LOOP_BP = 2
const LOOP_LP = 1
const GROUND = 1
const BRIDGED = 3
const CLAV = 2
const REED = 1

const phrase = (bars: number, shape: number) => ({
  modPhraseBars: PHRASE_BARS.indexOf(bars),
  modPhraseShape: shape,
})

const laneA = (steps: number[]) =>
  Object.fromEntries(steps.map((v, i) => [`modLaneA${i}`, v]))

const synced = (name: string) => DELAY_SYNC_MODES.indexOf(name)

const MINOR_TOY_TUNE = tune(
  'A4 . C5 E5 D5 . C5 . B4 . G4 . A4 ~ ~ . A4 . C5 E5 G5 . F5 E5 D5 . E5 C5 B4 ~ ~ .',
  'A3 ~ ~ ~ ~ ~ ~ ~ G3 ~ ~ ~ ~ ~ ~ ~ F3 ~ ~ ~ ~ ~ ~ ~ E3 ~ ~ ~ ~ ~ ~ ~',
  'C4 ~ ~ ~ ~ ~ ~ ~ B3 ~ ~ ~ ~ ~ ~ ~ A3 ~ ~ ~ ~ ~ ~ ~ G#3 ~ ~ ~ ~ ~ ~ ~',
)

export interface DemoScene {
  name: string
  says: string
  board: Partial<Controls>
}

export const DEMO_SCENES: DemoScene[] = [
  {
    name: 'the toy runs down',
    says: 'The toy keyboard plays a tune whose clock drops a step and whose address line shorts a little further every bar, until the tape brakes and it starts clean',
    board: {
      ...MINOR_TOY_TUNE,
      ...kit({
        kick: 'x.....x...x.....',
        snare: '....x.......x..x',
        hat: 'x.x.x.x.x.x.x.x.',
        'open hat': '.......x........',
        event: '..............b.',
      }),
      drumEventEvery: EVERY_4_BARS,
      drumBpm: 100,
      chipLevel: 0.8,
      chipTone: CLAV,
      drumLevel: 0.7,
      chipAddrFault: BRIDGED,
      mod0Src: SRC.phrase,
      mod0Dest: DEST.chipClock,
      mod0Depth: -0.6,
      mod1Src: SRC.phrase,
      mod1Dest: DEST.chipAddrLine,
      mod1Depth: 0.3,
      ...phrase(4, PHRASE_SHAPE.stairs),
      dlyMix: 0.3,
      dlySync: synced('dotted eighths'),
      dlyFb: 0.45,
      revMix: 0.25,
      revDecayS: 2.5,
    },
  },
  {
    name: 'acid into the wild twin',
    says: 'Growler’s acid line opens its filter over eight bars while the whole board drifts toward its wild twin over sixteen, then snaps back',
    board: {
      ...kit({
        kick: 'x...x...x...x...',
        clap: '....x.......x...',
        hat: '[xx].x.x.x.x.x.[xxx]x',
        'open hat': '..x...x...x...x.',
        event: '..............f.',
      }),
      drumEventEvery: EVERY_4_BARS,
      drumBpm: 126,
      chipLevel: 0,
      drumLevel: 0.6,
      ...line(
        'A3 A3 A4 A3 C4 A3 . G4 | A3 D#4 A3 A4 . C4 G3 A3',
        'x..x..x...x..x..',
        '..x....x....x...',
      ),
      monoWave1: 1,
      monoRange1: -1,
      monoMix1: 1,
      monoMix2: 0,
      monoMix3: 0,
      monoCutoff: 300,
      monoEmph: 0.92,
      monoContour: 3,
      monoTrack: 0.5,
      monoDrive: 2.5,
      monoFD: 0.18,
      monoFS: 0,
      monoFR: 0.08,
      monoAD: 0.3,
      monoAS: 0.7,
      monoAR: 0.03,
      monoGate: 0.5,
      monoGlide: 0.06,
      monoAccent: 0.9,
      monoLevel: 1.4,
      ...laneA([0, 2, 6, 1, 0, 4, 10, 2, 0, 3, 8, 12, 0, 5, 9, 3]),
      mod0Src: SRC.laneA,
      mod0Dest: DEST.monoCutoff,
      mod0Depth: 0.9,
      mod1Src: SRC.phrase,
      mod1Dest: DEST.dlyLoopHz,
      mod1Depth: 0.7,
      mod2Src: SRC.phrase,
      mod2Dest: DEST.monoCutoff,
      mod2Depth: 1.2,
      ...phrase(8, PHRASE_SHAPE.build),
      dlyMix: 0.3,
      dlySync: synced('dotted eighths'),
      dlyFb: 0.7,
      dlyLoopMode: LOOP_BP,
      dlyLoopHz: 700,
      dlyLoopRes: 0.95,
      arcDepth: 1,
      arcShape: ARC_RISE,
      arcBars: ARC_16_BARS,
      arcSeed: 7,
    },
  },
  {
    name: 'the kick plays the bass',
    says: 'The kick is retriggered at audio rate, so the drum machine plays the bassline itself, and the line climbs a major third every bar',
    board: {
      ...kit({
        kick: 'x.x.x.x.x.x.x.x.',
        clap: '....x.......x...',
        'open hat': '..x...x...x...x.',
      }),
      drumBpm: 118,
      chipLevel: 0,
      drumLevel: 0.6,
      drumRetrigHz: 110,
      drumDecay: 0.5,
      ...laneA([0, 0, 12, 0, 3, 0, 7, 0, 5, 0, 12, 0, 10, 0, 7, 0]),
      mod0Src: SRC.laneA,
      mod0Dest: DEST.retrig,
      mod0Depth: 0.25,
      mod1Src: SRC.phrase,
      mod1Dest: DEST.retrig,
      mod1Depth: 0.25,
      ...phrase(4, PHRASE_SHAPE.stairs),
      dlyMix: 0.25,
      dlySync: synced('dotted eighths'),
      dlyFb: 0.5,
      dlyLoopMode: LOOP_LP,
      dlyLoopHz: 1500,
      revMix: 0.25,
      revDecayS: 2,
      revKick: 0.5,
    },
  },
  {
    name: 'e.piano on the wrong channel',
    says: 'Glint plays e.piano chords while its note allocator lands on a different channel every bar, until the chords run into the chip’s own drums',
    board: {
      ...tune(
        'A4 . . E5 . . C5 . G4 . . D5 . . B4 . F4 . . C5 . . A4 . E4 . . B4 . . G4 .',
        'F3 ~ ~ ~ ~ ~ ~ ~ E3 ~ ~ ~ ~ ~ ~ ~ D3 ~ ~ ~ ~ ~ ~ ~ C3 ~ ~ ~ ~ ~ ~ ~',
        'C4 ~ ~ ~ ~ ~ ~ ~ B3 ~ ~ ~ ~ ~ ~ ~ A3 ~ ~ ~ ~ ~ ~ ~ G3 ~ ~ ~ ~ ~ ~ ~',
      ),
      ...kit({
        kick: 'x......x..x.....',
        snare: '....x.......x...',
        hat: 'x.x.x.x.x.x.x.xx',
      }),
      drumBpm: 84,
      drumSwing: 0.45,
      chipLevel: 0,
      drumLevel: 0.5,
      fmLevel: 1,
      fmVoice: FM_VOICE_NAMES.indexOf('e.piano'),
      fmRhythm: 1,
      fmStruck: ANY_CHOICE,
      mod0Src: SRC.phrase,
      mod0Dest: DEST.fmAlloc,
      mod0Depth: 1,
      ...phrase(4, PHRASE_SHAPE.stairs),
      ensMode: ENS_MODE.dimension,
      ensMix: 0.6,
      revMix: 0.35,
      revDecayS: 3.5,
      tapeMix: 0.6,
      tapeWow: 0.4,
    },
  },
  {
    name: 'choir on a cracked rom',
    says: 'Parlor’s choir sings slow chords while a grounded address line climbs the sample ROM a wire a bar, folding the voices in on themselves until they come back clean',
    board: {
      ...tune(
        'E4 ~ ~ ~ ~ ~ ~ ~ D4 ~ ~ ~ ~ ~ ~ ~ C4 ~ ~ ~ ~ ~ ~ ~ B3 ~ ~ ~ ~ ~ ~ ~',
        'A3 ~ ~ ~ ~ ~ ~ ~ G3 ~ ~ ~ ~ ~ ~ ~ F3 ~ ~ ~ ~ ~ ~ ~ E3 ~ ~ ~ ~ ~ ~ ~',
        'C4 ~ ~ ~ ~ ~ ~ ~ B3 ~ ~ ~ ~ ~ ~ ~ A3 ~ ~ ~ ~ ~ ~ ~ G#3 ~ ~ ~ ~ ~ ~ ~',
      ),
      ...kit({
        kick: 'x.........x.....',
        snare: '........x.......',
        hat: '..x...x...x...x.',
      }),
      drumBpm: 72,
      chipLevel: 0,
      drumLevel: 0.45,
      pcmLevel: 1,
      pcmVoice: PCM_VOICE_NAMES.indexOf('choir'),
      pcmEnv: 2,
      pcmRelease: 1.2,
      pcmAddrFault: GROUND,
      mod0Src: SRC.phrase,
      mod0Dest: DEST.pcmAddrLine,
      mod0Depth: 0.8,
      ...phrase(4, PHRASE_SHAPE.stairs),
      bendSlot0: 10,
      rackMix: 0.3,
      rackDecay: 0.92,
      rackSize: 2.2,
      rackWander: 0.7,
      dlyMix: 0.25,
      dlySync: synced('quarters'),
      dlyFb: 0.5,
    },
  },
  {
    name: 'the band on one battery',
    says: 'The toy, a Growler bassline and the kit share one set of cells that drains over eight bars, so the whole band sags and stutters together until the batteries are fresh again',
    board: {
      ...MINOR_TOY_TUNE,
      ...kit({
        kick: 'x...x...x...x...',
        snare: '....x.......x...',
        hat: 'x.xxx.xxx.xxx.xx',
      }),
      drumBpm: 112,
      chipLevel: 0.7,
      chipTone: REED,
      drumLevel: 0.8,
      ...line(
        'A2 . A3 A2 . A2 G2 . | F2 . F3 F2 E2 . E3 E2',
        'x...x...x...x...',
      ),
      monoWave1: 1,
      monoRange1: -1,
      monoMix1: 1,
      monoCutoff: 600,
      monoEmph: 0.5,
      monoLevel: 0.9,
      chipBattery: 0.3,
      mod0Src: SRC.phrase,
      mod0Dest: DEST.starve,
      mod0Depth: 1.5,
      ...phrase(8, PHRASE_SHAPE.rise),
    },
  },
]
