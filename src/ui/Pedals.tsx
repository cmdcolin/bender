import { engine } from '../engine/engine.ts'
import { PEDALS, pedalOrderAt } from '../pedals.ts'
import { AddMenu } from './AddMenu.tsx'
import { bench, setBench } from './bench.ts'
import { sliderFor } from './controls/index.ts'
import {
  useBoardValue,
  useControlValue,
  useStoreValue,
} from './ControlsContext.ts'
import { DeviceVerbs } from './DeviceVerbs.tsx'
import styles from './Pedals.module.css'
import { ControlSlider } from './Slider.tsx'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'
import type { CSSProperties } from 'react'

// What a pedal wears on the bench: its enclosure colour, an optional selector
// switch, the sliders you reach for first with the mix last, and the control its
// footswitch throws. The rest are one press away on the stage's own panel.
interface Face {
  colour: string
  switch?: ControlKey
  sliders: readonly ControlKey[]
  bypass: ControlKey
}

const FACE: Record<string, Face> = {
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

const cssVars = (vars: Record<`--${string}`, string>): CSSProperties => vars

const ADDED_MIX = 0.5

const show = (shown: readonly string[], pedal: string) =>
  setBench({ ...bench.get(), pedals: [...shown, pedal] })

const hide = (shown: readonly string[], pedal: string) =>
  setBench({ ...bench.get(), pedals: shown.filter(p => p !== pedal) })

/** The button on a pedal's own panel that puts it on the bench, or takes it off. */
export function BenchToggle({ stage }: { stage: string }) {
  const { pedals: shown } = useStoreValue(bench)
  const on = shown.includes(stage)
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
        onClick={() => (on ? hide(shown, stage) : show(shown, stage))}
      >
        bench
      </button>
    </Tip>
  )
}

// The pedals in the order the signal meets them, which is the order both the
// menu and the shelf list them in.
function useRunOrder() {
  const at = useBoardValue(c => Math.round(c.pedalOrder))
  return pedalOrderAt(at).map(i => PEDALS[i]!.group)
}

const KIND: Record<string, string> = {
  Gnash: 'stompbox',
  Wraith: 'tape delay',
  Ricochet: 'delay pedal',
  Boing: 'spring reverb',
  Chorale: 'ensemble',
  Ember: 'tube amp',
}

// The mix is the last slider on a pedal's face. A pedal added with its mix at 0
// would sit on the bench bypassed.
function bringUp(stage: string) {
  show(bench.get().pedals, stage)
  const mix = FACE[stage]!.sliders.at(-1)!
  if (engine.controls.get()[mix] === 0) {
    engine.armStep()
    engine.set(mix, ADDED_MIX)
  }
}

export function AddPedal() {
  const { pedals: shown } = useStoreValue(bench)
  const choices = useRunOrder()
    .filter(stage => !shown.includes(stage))
    .map(stage => ({ stage, kind: KIND[stage]! }))
  return (
    <AddMenu
      className={styles.add}
      text="Add pedal"
      choices={choices}
      onPick={bringUp}
    />
  )
}

// A selector switch: one press goes to the next position, as a pedal's mode
// switch does.
function Selector({ control }: { control: ControlKey }) {
  const def = sliderFor(control)
  const value = useControlValue(control)
  const choices = def.choices!
  const at = Math.round(value) - def.min
  const says = choices[at] === 'off' ? `${def.label} off` : choices[at]
  return (
    <Tip text={def.help}>
      <button
        className={styles.selector}
        aria-label={`${def.label}: ${choices[at]}`}
        onClick={() => {
          engine.armStep()
          engine.set(control, def.min + ((at + 1) % choices.length))
        }}
      >
        {says}
        <span aria-hidden="true"> ›</span>
      </button>
    </Tip>
  )
}

// The footswitch. The lamp is lit while the pedal is in the path.
function Footswitch({
  stage,
  control,
}: {
  stage: string
  control: ControlKey
}) {
  const bypassed = useControlValue(control) > 0.5
  return (
    <Tip
      text={
        bypassed
          ? `${stage} is bypassed. Press to switch it back on at the sound you left.`
          : `Press to take ${stage} out of the path. Its knobs stay where they are.`
      }
    >
      <span className={styles.bay}>
        <span
          className={bypassed ? styles.lampOff : styles.lampOn}
          aria-hidden="true"
        />
        <button
          className={styles.foot}
          aria-label={`bypass ${stage}`}
          aria-pressed={bypassed}
          onClick={() => {
            engine.armStep()
            engine.set(control, bypassed ? 0 : 1)
          }}
        />
      </span>
    </Tip>
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
  const live = useBoardValue(c =>
    face.sliders.filter(key => sliderFor(key).needs?.(c) ?? true).join(','),
  ).split(',')
  return (
    <div
      className={styles.pedal}
      style={cssVars({ '--pedal': face.colour })}
      role="group"
      aria-label={stage.toLowerCase()}
    >
      <div className={styles.head}>
        <span className={styles.name}>{stage}</span>
        <DeviceVerbs stage={stage} seconds={seconds} onClose={onClose} noMute />
      </div>
      <div className={styles.body}>
        <div className={styles.stand}>
          <Footswitch stage={stage} control={face.bypass} />
          <Tip text={`Open ${stage} with all of its controls.`}>
            <button
              className={styles.more}
              aria-label="all controls"
              onClick={() => onOpen(stage)}
            >
              ⋯
            </button>
          </Tip>
        </div>
        <div className={styles.sliders}>
          {face.switch && <Selector control={face.switch} />}
          {face.sliders
            .filter(key => live.includes(key))
            .map(key => (
              <ControlSlider key={key} def={sliderFor(key)} />
            ))}
        </div>
      </div>
    </div>
  )
}

export function usePedalStages() {
  const { pedals: shown } = useStoreValue(bench)
  return useRunOrder().filter(pedal => shown.includes(pedal))
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
