import { useEffect } from 'react'

import { engine } from '../engine/engine.ts'
import { INSTRUMENTS } from './bench.ts'
import { useBenchFaces } from './benchFaces.ts'
import { BendKeys, BendKeysSwitch } from './BendKeys.tsx'
import { onBoard } from './chain-map.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import { DrumKit } from './DrumKit.tsx'
import { Faceplate } from './Faceplate.tsx'
import { add } from './fitted.ts'
import { FmKeys } from './FmKeys.tsx'
import { FourTrack } from './FourTrack.tsx'
import { GateBench } from './GateCables.tsx'
import styles from './Instruments.module.css'
import { Keys } from './Keys.tsx'
import { MonoKeys } from './MonoKeys.tsx'
import { PcmKeys } from './PcmKeys.tsx'
import { AllPedals, PedalShelf, PedalsMenu } from './Pedals.tsx'
import { dragging } from './tapeDrop.ts'
import { TapeLoopFace } from './TapeLoopFace.tsx'
import { Tip } from './Tip.tsx'

import type { MorphSeconds } from './morph.ts'
import type { ComponentType } from 'react'

type Machine = ComponentType<{
  seconds?: number
  onClose?: () => void
  onOpen?: (stage: string) => void
}>
type Row = [stage: string, Machine: Machine][]

function FourTrackFace({
  seconds,
  onClose,
}: {
  seconds?: number
  onClose?: () => void
}) {
  return (
    <Faceplate stage="Layercake" seconds={seconds} onClose={onClose}>
      <FourTrack />
    </Faceplate>
  )
}

const TOY: Row = [
  ['Plinky', Keys],
  ['Clatter', DrumKit],
]

const LEVELLED: Row = [
  ['Glint', FmKeys],
  ['Parlor', PcmKeys],
  ['Growler', MonoKeys],
  ['Spool', TapeLoopFace],
  ['Layercake', FourTrackFace],
]

// The keyboards, the kit, the tape loop and the four-track. A machine shows while its stage is
// on the map: the toy and the kit from the start, the others once their faders
// come up. The tape loop also shows while the mic is open, since its face holds
// the mic key, and while a file is over the app, to take the drop. Add all instruments lays out every one whatever its fader says, each with
// a close cap. Every face wears one, and a row of what has been closed brings it
// back. The mode and the closed set survive a reload.
//
// A machine that has come up goes on the map for good (`add`): the Level slider
// on its face runs down to zero, and a face that left under the pointer would
// take the slider with it. Taking its stage off the map is what puts it away.
export function Instruments({
  seconds,
  onOpen,
}: {
  seconds: MorphSeconds
  onOpen: (stage: string) => void
}) {
  const { all, closed, shows, close, reopen, setAll } = useBenchFaces()
  const risen = useBoardValue(c =>
    INSTRUMENTS.filter(stage => onBoard(c).has(stage)).join('|'),
  )
  useEffect(() => {
    if (risen) add(risen.split('|'))
  }, [risen])
  const full = all && closed.size === 0
  const micOn = useStoreValue(engine.micOn)
  const over = useStoreValue(dragging)
  const tapeHeld = micOn || over
  const face = (stage: string) =>
    shows(stage) || (stage === 'Spool' && tapeHeld)

  const shelf = (machines: Row) => {
    const shown = machines.filter(([stage]) => face(stage))
    if (shown.length === 0) return null
    return (
      <div className={styles.shelf}>
        {shown.map(([stage, Machine]) => (
          <Machine
            key={stage}
            seconds={seconds}
            onClose={() => close(stage)}
            onOpen={onOpen}
          />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className={styles.bar}>
        <Tip
          text={
            full
              ? 'Put away the instruments whose level never came up.'
              : 'Lay out every instrument, each with its Level slider. One with its level down stays silent until you raise it.'
          }
        >
          <button
            className={full ? styles.allQuiet : styles.all}
            onClick={() => setAll(!full)}
          >
            {full ? '− hide unused instruments' : '+ add all instruments'}
          </button>
        </Tip>
        <AllPedals />
        <PedalsMenu />
        <BendKeysSwitch />
        {INSTRUMENTS.filter(stage => closed.has(stage)).map(stage => (
          <button
            key={stage}
            className={styles.reopen}
            onClick={() => reopen(stage)}
          >
            + {stage.toLowerCase()}
          </button>
        ))}
      </div>
      <BendKeys morphSeconds={seconds} />
      <GateBench>{shelf([...TOY, ...LEVELLED])}</GateBench>
      <PedalShelf seconds={seconds} onOpen={onOpen} />
    </>
  )
}
