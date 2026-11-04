import { DEST } from '../dsp/modbus.ts'
import { AMP_CAB, AMP_VOICE } from '../dsp/stages/amp.ts'
import { CRUSH_LOGIC, CRUSH_WITH } from '../dsp/stages/crusher.ts'
import { ENS_MODE } from '../dsp/stages/ensemble.ts'
import { FM_VOICE_NAMES } from '../dsp/stages/fmVoices.ts'
import { OCT_BOUNCE, OCT_CLOCKS } from '../dsp/stages/octave.ts'
import { PCM_VOICE_NAMES } from '../dsp/stages/pcmRom.ts'
import { DELAY_SYNC_MODES } from '../dsp/stages/tapeDelay.ts'
import { SUPPLY } from '../dsp/supplies.ts'
import { ANY_CHOICE } from '../dsp/trigbus.ts'
import { BENDS } from '../ui/controls/bends.ts'
import { kit, line, tune } from '../ui/presets/write.ts'

import type { Controls } from '../controls.ts'

const SRC = {
  lfo: 1,
  env: 3,
  drum: 9,
  laneA: 12,
  laneB: 13,
  phrase: 14,
}
const PHRASE_BARS = [1, 2, 4, 8, 16, 32]
const PHRASE_SHAPE = { rise: 0, stairs: 4 }
const ARC_RISE = 1
const ARC_16_BARS = 2
const EVERY_4_BARS = 2
const LOOP_LP = 1
const GROUND = 1
const BRIDGED = 3
const CLAV = 2
const REED = 1
const GERMANIUM = 3
const SAW = 1
const FB_TO_OSC = 1

const phrase = (bars: number, shape: number) => ({
  modPhraseBars: PHRASE_BARS.indexOf(bars),
  modPhraseShape: shape,
})

const lane = (name: 'A' | 'B', steps: number[]) =>
  Object.fromEntries(steps.map((v, i) => [`modLane${name}${i}`, v]))

const bendSlot = (group: (typeof BENDS)[number]['group']) =>
  BENDS.findIndex(b => b.group === group) + 1

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
    says: 'The toy keyboard’s clock drops a step and its address line shorts a little further every bar, while its DAC XORs every word with the kit’s, until the tape brakes and it starts clean',
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
      chipLevel: 1.1,
      chipTone: CLAV,
      drumLevel: 0.9,
      chipAddrFault: BRIDGED,
      crushLogic: CRUSH_LOGIC.indexOf('XOR'),
      crushWith: CRUSH_WITH.indexOf('the kit'),
      crushMix: 0.5,
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
    name: 'acid into a phone speaker',
    says: 'Growler’s acid line goes into an amp turned up six hundred times, which holds its own note through a phone speaker, and a comb plays a second tune off a step lane, while the whole board drifts toward its wild twin',
    board: {
      ...kit({
        kick: 'x...x...x...x...',
        clap: '....x.......x...',
        hat: '[xx].x.x.x.x.x.[xxx]x',
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
      monoLevel: 0.9,
      distPinGain: 600,
      distSpeaker: 0.5,
      distMix: 0.35,
      combHz: 110,
      combFb: 0.9,
      combDampHz: 4000,
      combMix: 0.6,
      ...lane('A', [0, 7, 3, 10, 0, 12, 5, 3, 0, 7, 3, 10, 0, 12, 8, 7]),
      mod0Src: SRC.laneA,
      mod0Dest: DEST.combHz,
      mod0Depth: 0.5,
      mod1Src: SRC.lfo,
      mod1Dest: DEST.distPinGain,
      mod1Depth: -0.6,
      modLfoHz: 0.25,
      arcDepth: 1,
      arcShape: ARC_RISE,
      arcBars: ARC_16_BARS,
      arcSeed: 7,
    },
  },
  {
    name: 'the kick plays the bass',
    says: 'The kick is retriggered at audio rate, so the drum machine plays the bassline itself, the line climbs a major third every bar, and an octave box under it flips up and down with every step',
    board: {
      ...kit({
        kick: 'x.x.x.x.x.x.x.x.',
        clap: '....x.......x...',
        'open hat': '..x...x...x...x.',
      }),
      drumBpm: 118,
      chipLevel: 0,
      drumLevel: 0.5,
      drumRetrigHz: 110,
      drumDecay: 0.5,
      ...lane('A', [0, 0, 12, 0, 3, 0, 7, 0, 5, 0, 12, 0, 10, 0, 7, 0]),
      mod0Src: SRC.laneA,
      mod0Dest: DEST.retrig,
      mod0Depth: 0.25,
      mod1Src: SRC.phrase,
      mod1Dest: DEST.retrig,
      mod1Depth: 0.25,
      mod2Src: SRC.phrase,
      mod2Dest: DEST.drumLevel,
      mod2Depth: 0.5,
      ...phrase(4, PHRASE_SHAPE.stairs),
      bendSlot0: bendSlot('Octave'),
      octMix: 0.7,
      octUp: 0.8,
      octSub: 1,
      octBounce: OCT_BOUNCE.indexOf('hard'),
      octClock: OCT_CLOCKS.indexOf('step'),
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
    says: 'Glint plays e.piano chords while its note allocator lands on a different channel every bar, into a germanium fuzz and a Marshall that the loud chords push harder',
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
      mod1Src: SRC.env,
      mod1Dest: DEST.stompDrive,
      mod1Depth: 0.6,
      stompCircuit: GERMANIUM,
      stompDrive: 18,
      stompTone: 0.5,
      stompLevel: -4,
      stompMix: 0.8,
      ampVoice: AMP_VOICE.marshall,
      ampGain: 0.4,
      ampMaster: 0.7,
      ampSag: 0.8,
      ampCab: AMP_CAB.closed,
      ampMix: 1,
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
    says: 'Parlor’s choir sings slow chords while a grounded address line climbs the sample ROM a wire a bar, through a comb that a step lane keeps retuning, folding the voices in on themselves until they come back clean',
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
      pcmLevel: 1.4,
      pcmVoice: PCM_VOICE_NAMES.indexOf('choir'),
      pcmEnv: 2,
      pcmRelease: 1.2,
      pcmAddrFault: GROUND,
      mod0Src: SRC.phrase,
      mod0Dest: DEST.pcmAddrLine,
      mod0Depth: 0.8,
      ...phrase(4, PHRASE_SHAPE.stairs),
      combHz: 220,
      combFb: 0.85,
      combDampHz: 3000,
      combMix: 0.5,
      ...lane('B', [0, 0, 0, 0, 5, 5, 5, 5, 3, 3, 3, 3, 10, 10, 7, 7]),
      mod1Src: SRC.laneB,
      mod1Dest: DEST.combHz,
      mod1Depth: 0.5,
      bendSlot0: bendSlot('Rack verb'),
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
    says: 'The toy, a Growler bassline and the kit share one set of cells, and an amp on the same cells pulls them down on every peak, so the whole band browns out, stutters and reboots on its own clock',
    board: {
      ...MINOR_TOY_TUNE,
      ...kit({
        kick: 'x...x...x...x...',
        snare: '....x.......x...',
        hat: 'x.xxx.xxx.xxx.xx',
      }),
      drumBpm: 112,
      chipLevel: 1.2,
      chipTone: REED,
      drumLevel: 1.2,
      ...line(
        'A2 . A3 A2 . A2 G2 . | F2 . F3 F2 E2 . E3 E2',
        'x...x...x...x...',
      ),
      monoWave1: 1,
      monoRange1: -1,
      monoMix1: 1,
      monoCutoff: 600,
      monoEmph: 0.5,
      monoLevel: 1.6,
      chipBattery: 0.3,
      distSupply: SUPPLY.shared,
      distDraw: 0.6,
      distSpeaker: 0.4,
      distMix: 0.45,
      mod0Src: SRC.phrase,
      mod0Dest: DEST.starve,
      mod0Depth: 1.5,
      ...phrase(8, PHRASE_SHAPE.rise),
      outGain: 6,
    },
  },
  {
    name: 'the mixer plays itself',
    says: 'Nothing is plugged in: the desk’s output is wired into a chaos oscillator’s FM input, a step lane plays a tune on its pitch, and every kit hit throws it somewhere new',
    board: {
      ...kit({
        kick: 'x..x..x...x..x..',
        hat: '..x...x...x...x.',
      }),
      drumBpm: 96,
      chipLevel: 0,
      drumLevel: 0.4,
      oscLevel: 0.6,
      oscShape: SAW,
      oscAHz: 220,
      oscBHz: 3,
      oscXmod: 400,
      fbAmt: 0.6,
      fbDest: FB_TO_OSC,
      fbDelayMs: 3,
      fbTone: 0.5,
      ...lane('A', [0, 0, 7, 7, 3, 3, 12, 10, 0, 0, 7, 7, 5, 5, 3, 2]),
      mod0Src: SRC.laneA,
      mod0Dest: DEST.oscHz,
      mod0Depth: 0.25,
      mod1Src: SRC.drum,
      mod1Dest: DEST.fbAmt,
      mod1Depth: 0.6,
      mod2Src: SRC.phrase,
      mod2Dest: DEST.fbMs,
      mod2Depth: 0.5,
      ...phrase(4, PHRASE_SHAPE.stairs),
      noiseLevel: 0.1,
      echoLevel: 0.4,
      revMix: 0.3,
      revDecayS: 3,
    },
  },
]
