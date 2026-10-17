import { bench, setBench } from './bench.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import { DrumKit } from './DrumKit.tsx'
import { FmKeys } from './FmKeys.tsx'
import styles from './Instruments.module.css'
import { Keys } from './Keys.tsx'
import { MonoKeys } from './MonoKeys.tsx'
import { PcmKeys } from './PcmKeys.tsx'

import type { ComponentType } from 'react'

type Machine = ComponentType<{ seconds?: number; onClose?: () => void }>
type Row = [stage: string, Machine: Machine][]

const TOY: Row = [
  ['Toy keyboard', Keys],
  ['Toy drums', DrumKit],
]

const LEVELLED: Row = [
  ['FM chip', FmKeys],
  ['Home keyboard', PcmKeys],
  ['Mono synth', MonoKeys],
]

// The keyboards and the kit. Normally the toy and the kit always show and the
// other three come and go with their faders. The all-instruments mode lays out
// every one whatever its fader says, each with a close cap, and a row of what
// has been closed to bring it back. The mode and the closed set survive a
// reload.
const keep = (all: boolean, closed: ReadonlySet<string>) =>
  setBench({ all, closed: [...closed] })

export function Instruments({ seconds }: { seconds: number }) {
  const { all, closed: closedList } = useStoreValue(bench)
  const closed = new Set(closedList)
  const fmUp = useBoardValue(c => c.fmLevel > 0)
  const pcmUp = useBoardValue(c => c.pcmLevel > 0)
  const monoUp = useBoardValue(c => c.monoLevel > 0)
  const up = new Map([
    ['FM chip', fmUp],
    ['Home keyboard', pcmUp],
    ['Mono synth', monoUp],
  ])
  const shows = (stage: string) =>
    all ? !closed.has(stage) : (up.get(stage) ?? true)

  const close = (stage: string) => keep(all, new Set(closed).add(stage))
  const reopen = (stage: string) =>
    keep(all, new Set([...closed].filter(s => s !== stage)))
  const toggle = () => keep(!all, closed)

  const shelf = (machines: Row) => {
    const shown = machines.filter(([stage]) => shows(stage))
    if (shown.length === 0) return null
    return (
      <div className={styles.shelf}>
        {shown.map(([stage, Machine]) => (
          <Machine
            key={stage}
            seconds={seconds}
            onClose={all ? () => close(stage) : undefined}
          />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className={styles.bar}>
        <button
          className={all ? styles.modeOn : styles.mode}
          aria-pressed={all}
          onClick={toggle}
        >
          all instruments
        </button>
        {all &&
          [...TOY, ...LEVELLED]
            .filter(([stage]) => closed.has(stage))
            .map(([stage]) => (
              <button
                key={stage}
                className={styles.reopen}
                onClick={() => reopen(stage)}
              >
                + {stage.toLowerCase()}
              </button>
            ))}
      </div>
      {shelf(TOY)}
      {shelf(LEVELLED)}
    </>
  )
}
