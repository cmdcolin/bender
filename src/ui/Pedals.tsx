import { engine } from '../engine/engine.ts'
import { isPedal, pedalNamed } from '../pedals.ts'
import { AddMenu } from './AddMenu.tsx'
import { bench, putOnBench, takeOffBench } from './bench.ts'
import { switchOn } from './bendChain.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import { add } from './fitted.ts'
import styles from './Pedals.module.css'
import { Footswitch, StompFace, type Face } from './StompFace.tsx'
import { Tip } from './Tip.tsx'

const FACE: Record<string, Face> = {
  Gnash: {
    colour: '#2f7040',
    switch: 'stompCircuit',
    sliders: ['stompDrive', 'stompTone', 'stompMix'],
  },
  Wraith: {
    colour: '#75592c',
    switch: 'dlySync',
    sliders: ['delayMs', 'dlyFb', 'dlyMix'],
  },
  Ricochet: {
    colour: '#2f5c8f',
    sliders: ['echoMs', 'echoFb', 'echoLevel'],
  },
  Boing: {
    colour: '#24706f',
    sliders: ['revDecayS', 'revToneHz', 'revMix'],
  },
  Chorale: {
    colour: '#62408a',
    sliders: ['ensRate', 'ensDepth', 'ensMix'],
  },
  Ember: {
    colour: '#8a2c2c',
    switch: 'ampVoice',
    sliders: ['ampGain', 'ampMaster', 'ampMix'],
  },
}

const ADDED_MIX = 0.5

const listOf = (stage: string) => (isPedal(stage) ? 'pedals' : 'bends')

export function BenchToggle({ stage }: { stage: string }) {
  const list = listOf(stage)
  const on = useStoreValue(bench)[list].includes(stage)
  return (
    <Tip
      text={
        on
          ? `${stage} is on the bench with the instruments. Press to put it away.`
          : `Put ${stage} on the bench with the instruments, so its controls sit in the main area.`
      }
    >
      <button
        className={on ? styles.benchOn : styles.bench}
        aria-pressed={on}
        onClick={() =>
          on ? takeOffBench(list, stage) : putOnBench(list, stage)
        }
      >
        bench
      </button>
    </Tip>
  )
}

const BY_SOUND: { section: string; kinds: Record<string, string> }[] = [
  {
    section: 'Dirt',
    kinds: {
      Gnash: 'stompbox',
      Clipper: 'distortion',
      Crusher: 'bit crusher',
      Codec: 'lossy codec',
      Ember: 'tube amp',
    },
  },
  {
    section: 'Echo and space',
    kinds: {
      Wraith: 'tape delay',
      Ricochet: 'delay pedal',
      Boing: 'spring reverb',
      'Rack verb': 'digital reverb',
      Chorale: 'ensemble',
    },
  },
  {
    section: 'Pitch and tone',
    kinds: {
      Octave: 'octave sub and up',
      'Freq shifter': 'frequency shifter',
      'Ring mod': 'ring modulator',
      Comb: 'comb filter',
      'Screech filter': 'resonant filter',
      'Glitch buffer': 'stutter',
    },
  },
]

function switchPedalOn(stage: string) {
  const { mix, mute } = pedalNamed(stage)!
  const board = engine.controls.get()
  if (board[mix] === 0 || board[mute] > 0.5) {
    engine.armStep()
    engine.writeBoard({
      ...board,
      [mix]: board[mix] === 0 ? ADDED_MIX : board[mix],
      [mute]: 0,
    })
  }
}

function bringUpPedal(stage: string) {
  putOnBench('pedals', stage)
  switchPedalOn(stage)
}

function bringUpSocketed(stage: string) {
  switchOn(stage)
  add([stage])
  putOnBench('bends', stage)
}

export function AddPedal() {
  const { pedals, bends } = useStoreValue(bench)
  const choices = BY_SOUND.flatMap(({ section, kinds }) =>
    Object.entries(kinds)
      .filter(([stage]) => !pedals.includes(stage) && !bends.includes(stage))
      .map(([stage, kind]) => ({ stage, kind, section })),
  )
  return (
    <AddMenu
      className={styles.add}
      text="add pedal"
      choices={choices}
      onPick={stage =>
        isPedal(stage) ? bringUpPedal(stage) : bringUpSocketed(stage)
      }
    />
  )
}

export function PedalFace({
  stage,
  seconds,
  onOpen,
}: {
  stage: string
  seconds: number
  onOpen: (stage: string) => void
}) {
  const face = FACE[stage]!
  const { mute, mix } = pedalNamed(stage)!
  const why = useBoardValue(c =>
    c[mute] > 0.5 ? 'bypassed' : c[mix] === 0 ? 'dry' : 'on',
  )
  return (
    <StompFace
      stage={stage}
      face={face}
      seconds={seconds}
      onOpen={onOpen}
      onClose={() => takeOffBench('pedals', stage)}
      footswitch={
        <Footswitch
          stage={stage}
          bypassed={why !== 'on'}
          tip={
            why === 'bypassed'
              ? `${stage} is bypassed. Press to switch it back on at the sound you left.`
              : why === 'dry'
                ? `${stage} is silent with its mix at 0. Press to bring the mix up.`
                : `Press to take ${stage} out of the path. Its knobs stay where they are.`
          }
          onPress={() => {
            if (why === 'on') {
              engine.armStep()
              engine.set(mute, 1)
            } else switchPedalOn(stage)
          }}
        />
      }
    />
  )
}
