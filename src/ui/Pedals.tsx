import { useCallback, useState } from 'react'

import { PEDALS, pedalOrderAt } from '../pedals.ts'
import { bench, setBench } from './bench.ts'
import { sliderFor } from './controls/index.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import { DeviceVerbs } from './DeviceVerbs.tsx'
import { Menu } from './Menu.tsx'
import { menuCheck } from './menuItems.ts'
import styles from './Pedals.module.css'
import { ControlSlider } from './Slider.tsx'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'

// The knobs a pedal wears on the bench: what you reach for first, with the mix
// last. The rest are one press away on the stage's own panel.
const FACE: Record<string, readonly ControlKey[]> = {
  Stompbox: ['stompCircuit', 'stompDrive', 'stompTone', 'stompMix'],
  'Tape delay': ['delayMs', 'dlyFb', 'dlyMix'],
  'Delay pedal': ['echoMs', 'echoFb', 'echoLevel'],
  'Spring verb': ['revDecayS', 'revToneHz', 'revMix'],
  Ensemble: ['ensRate', 'ensDepth', 'ensMix'],
  'Tube amp': ['ampVoice', 'ampGain', 'ampMix'],
}

const show = (shown: readonly string[], pedal: string) =>
  setBench({ ...bench.get(), pedals: [...shown, pedal] })

const hide = (shown: readonly string[], pedal: string) =>
  setBench({ ...bench.get(), pedals: shown.filter(p => p !== pedal) })

// The pedals in the order the signal meets them, which is the order both the
// menu and the shelf list them in.
function useRunOrder() {
  const at = useBoardValue(c => Math.round(c.pedalOrder))
  return pedalOrderAt(at).map(i => PEDALS[i]!.group)
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
  return (
    <div className={styles.pedal} role="group" aria-label={stage.toLowerCase()}>
      <div className={styles.head}>
        <span className={styles.name}>{stage}</span>
        <DeviceVerbs stage={stage} seconds={seconds} onClose={onClose} />
      </div>
      <div className={styles.knobs}>
        {FACE[stage]!.map(key => (
          <ControlSlider key={key} def={sliderFor(key)} />
        ))}
      </div>
      <button className={styles.more} onClick={() => onOpen(stage)}>
        all controls
      </button>
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
