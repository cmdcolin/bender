import { useCallback, useState, type CSSProperties } from 'react'

import { engine } from '../engine/engine.ts'
import { PEDALS, pedalOrderAt } from '../pedals.ts'
import { bench, setBench } from './bench.ts'
import { sliderFor } from './controls/index.ts'
import {
  useBoardValue,
  useControlValue,
  useStoreValue,
} from './ControlsContext.ts'
import { DeviceVerbs } from './DeviceVerbs.tsx'
import { Menu } from './Menu.tsx'
import { menuCheck } from './menuItems.ts'
import styles from './Pedals.module.css'
import { ControlSlider } from './Slider.tsx'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'

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
  Stompbox: {
    colour: '#2f7040',
    switch: 'stompCircuit',
    sliders: ['stompDrive', 'stompTone', 'stompMix'],
    bypass: 'stompMute',
  },
  'Tape delay': {
    colour: '#75592c',
    sliders: ['delayMs', 'dlyFb', 'dlyMix'],
    bypass: 'dlyMute',
  },
  'Delay pedal': {
    colour: '#2f5c8f',
    sliders: ['echoMs', 'echoFb', 'echoLevel'],
    bypass: 'echoMute',
  },
  'Spring verb': {
    colour: '#24706f',
    sliders: ['revDecayS', 'revToneHz', 'revMix'],
    bypass: 'revMute',
  },
  Ensemble: {
    colour: '#62408a',
    sliders: ['ensRate', 'ensDepth', 'ensMix'],
    bypass: 'ensMute',
  },
  'Tube amp': {
    colour: '#8a2c2c',
    switch: 'ampVoice',
    sliders: ['ampGain', 'ampMaster', 'ampMix'],
    bypass: 'ampMute',
  },
}

const cssVars = (vars: Record<`--${string}`, string>): CSSProperties => vars

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

/** One press puts every pedal on the bench, and once all six are there the
    next press puts them away. Their mixes stay where they are. */
export function AllPedals() {
  const { pedals: shown } = useStoreValue(bench)
  const order = useRunOrder()
  const full = order.every(pedal => shown.includes(pedal))
  return (
    <Tip
      text={
        full
          ? 'Take every pedal face off the bench. The pedals stay on the board.'
          : 'Put all six pedal faces on the bench and their boxes on the map. A pedal stays silent until its mix comes up.'
      }
    >
      <button
        className={full ? styles.allQuiet : styles.all}
        onClick={() => setBench({ ...bench.get(), pedals: full ? [] : order })}
      >
        {full ? '− put all pedals away' : '+ add all pedals'}
      </button>
    </Tip>
  )
}

// One button that opens a checklist, so six pedals cost one chip of bar rather
// than six, which is what a phone has room for.
export function PedalsMenu() {
  const { pedals: shown } = useStoreValue(bench)
  const order = useRunOrder()
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <Tip text="Choose which pedals sit on the bench with the instruments. All six are always on the board whatever you pick here.">
        <button
          ref={setButton}
          className={shown.length > 0 ? styles.menuOn : styles.menu}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          pedals{shown.length > 0 ? ` · ${shown.length}` : ''} ▾
        </button>
      </Tip>
      {open && (
        <Menu
          anchor={button}
          toggle={button}
          role="group"
          label="pedals on the bench"
          onClose={close}
        >
          {order.map(pedal => {
            const on = shown.includes(pedal)
            return (
              <label key={pedal} className={menuCheck}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    on ? hide(shown, pedal) : show(shown, pedal)
                  }
                />
                {pedal.toLowerCase()}
              </label>
            )
          })}
        </Menu>
      )}
    </>
  )
}

// A selector switch: one press goes to the next position, as a pedal's mode
// switch does.
function Selector({ control }: { control: ControlKey }) {
  const def = sliderFor(control)
  const value = useControlValue(control)
  const choices = def.choices!
  const at = Math.round(value) - def.min
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
        {choices[at]}
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
          {face.sliders.map(key => (
            <ControlSlider key={key} def={sliderFor(key)} />
          ))}
        </div>
      </div>
    </div>
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
  const faces = useRunOrder().filter(pedal => shown.includes(pedal))
  if (faces.length === 0) return null
  return (
    <div className={styles.shelf}>
      {faces.map(stage => (
        <PedalFace
          key={stage}
          stage={stage}
          seconds={seconds}
          onOpen={onOpen}
          onClose={() => hide(shown, stage)}
        />
      ))}
    </div>
  )
}
