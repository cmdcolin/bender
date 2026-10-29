import { engine } from '../engine/engine.ts'
import { isPedal } from '../pedals.ts'
import { AddMenu } from './AddMenu.tsx'
import { bench, setBench } from './bench.ts'
import { switchOn } from './bendChain.ts'
import { useControlValue, useStoreValue } from './ControlsContext.ts'
import { add } from './fitted.ts'
import styles from './Pedals.module.css'
import { usePedalStages } from './pedalStages.ts'
import { Footswitch, StompFace, type Face } from './StompFace.tsx'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'

// A pedal's face, and the control its footswitch throws.
interface PedalLook extends Face {
  bypass: ControlKey
}

const FACE: Record<string, PedalLook> = {
  Gnash: {
    colour: '#2f7040',
    switch: 'stompCircuit',
    sliders: ['stompDrive', 'stompTone', 'stompMix'],
    bypass: 'stompMute',
  },
  Wraith: {
    colour: '#75592c',
    switch: 'dlySync',
    sliders: ['delayMs', 'dlyFb', 'dlyMix'],
    bypass: 'dlyMute',
  },
  Ricochet: {
    colour: '#2f5c8f',
    sliders: ['echoMs', 'echoFb', 'echoLevel'],
    bypass: 'echoMute',
  },
  Boing: {
    colour: '#24706f',
    sliders: ['revDecayS', 'revToneHz', 'revMix'],
    bypass: 'revMute',
  },
  Chorale: {
    colour: '#62408a',
    sliders: ['ensRate', 'ensDepth', 'ensMix'],
    bypass: 'ensMute',
  },
  Ember: {
    colour: '#8a2c2c',
    switch: 'ampVoice',
    sliders: ['ampGain', 'ampMaster', 'ampMix'],
    bypass: 'ampMute',
  },
}

const ADDED_MIX = 0.5

const show = (shown: readonly string[], pedal: string) =>
  setBench({ ...bench.get(), pedals: [...shown, pedal] })

const hide = (shown: readonly string[], pedal: string) =>
  setBench({ ...bench.get(), pedals: shown.filter(p => p !== pedal) })

const listOf = (stage: string) => (isPedal(stage) ? 'pedals' : 'bends')

/** The button on a pedal's or bend's own panel that puts its face on the bench,
    or takes it off. */
export function BenchToggle({ stage }: { stage: string }) {
  const list = listOf(stage)
  const shown = useStoreValue(bench)[list]
  const on = shown.includes(stage)
  const put = (next: readonly string[]) =>
    setBench({ ...bench.get(), [list]: next })
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
          put(on ? shown.filter(p => p !== stage) : [...shown, stage])
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

function bringUpPedal(stage: string) {
  show(bench.get().pedals, stage)
  const mix = FACE[stage]!.sliders.at(-1)!
  if (engine.controls.get()[mix] === 0) {
    engine.armStep()
    engine.set(mix, ADDED_MIX)
  }
}

function bringUpSocketed(stage: string) {
  switchOn(stage)
  add([stage])
  const { bends } = bench.get()
  setBench({ ...bench.get(), bends: [...bends, stage] })
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

function PedalFace({
  stage,
  seconds,
  onOpen,
  onClose,
}: {
  stage: string
  seconds: number
  onOpen: (stage: string) => void
  onClose: () => void
}) {
  const face = FACE[stage]!
  const bypassed = useControlValue(face.bypass) > 0.5
  return (
    <StompFace
      stage={stage}
      face={face}
      seconds={seconds}
      onOpen={onOpen}
      onClose={onClose}
      footswitch={
        <Footswitch
          stage={stage}
          bypassed={bypassed}
          tip={
            bypassed
              ? `${stage} is bypassed. Press to switch it back on at the sound you left.`
              : `Press to take ${stage} out of the path. Its knobs stay where they are.`
          }
          onPress={() => {
            engine.armStep()
            engine.set(face.bypass, bypassed ? 0 : 1)
          }}
        />
      }
    />
  )
}

export function PedalShelf({
  seconds,
  onOpen,
}: {
  seconds: number
  onOpen: (stage: string) => void
}) {
  const { pedals: shown } = useStoreValue(bench)
  const faces = usePedalStages()
  if (faces.length === 0) return null
  return (
    <>
      {faces.map(stage => (
        <PedalFace
          key={stage}
          stage={stage}
          seconds={seconds}
          onOpen={onOpen}
          onClose={() => hide(shown, stage)}
        />
      ))}
    </>
  )
}
