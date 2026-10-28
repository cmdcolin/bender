import { useEffect } from 'react'

import { MIC } from '../dsp/micJacks.ts'
import { engine } from '../engine/engine.ts'
import { AddMenu } from './AddMenu.tsx'
import { bench, INSTRUMENTS, stageOnRun } from './bench.ts'
import { useBenchFaces } from './benchFaces.ts'
import { BendShelf } from './BendFaces.tsx'
import { BendKeys, BendKeysSwitch } from './BendKeys.tsx'
import { useBendStages } from './bendStages.ts'
import { onBoard } from './chain-map.ts'
import {
  useBoardValue,
  useControlValue,
  useStoreValue,
} from './ControlsContext.ts'
import { DrumKit } from './DrumKit.tsx'
import { Faceplate } from './Faceplate.tsx'
import { add } from './fitted.ts'
import { FmKeys } from './FmKeys.tsx'
import { FourTrack } from './FourTrack.tsx'
import { GateBench, ModPlate } from './GateCables.tsx'
import styles from './Instruments.module.css'
import { Keys } from './Keys.tsx'
import { MicMenu } from './MicJacks.tsx'
import { MonoKeys } from './MonoKeys.tsx'
import { PcmKeys } from './PcmKeys.tsx'
import { AddPedal, PedalShelf } from './Pedals.tsx'
import { usePedalStages } from './pedalStages.ts'
import { levelOf } from './stageLevels.ts'
import { dragging } from './tapeDrop.ts'
import { TapeLoopFace } from './TapeLoopFace.tsx'

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

const KEYBOARDS: Row = [
  ['Plinky', Keys],
  ['Glint', FmKeys],
  ['Parlor', PcmKeys],
  ['Growler', MonoKeys],
]

const KIT: Row = [['Clatter', DrumKit]]

const TAPES: Row = [
  ['Spool', TapeLoopFace],
  ['Layercake', FourTrackFace],
]

const ADDED_LEVEL = 0.6

const KIND: Record<string, string> = {
  Plinky: 'toy keyboard',
  Clatter: 'toy drums',
  Glint: 'FM synth',
  Parlor: 'home keyboard',
  Growler: 'mono synth',
  Spool: 'tape loop',
  Layercake: 'four-track',
}

// The keyboards, the kit, the tape loop and the four-track. A machine shows while its stage is
// on the map: the toy and the kit from the start, the others once their faders
// come up or Add instrument brings them in. The tape loop also shows while the
// open mic goes to the mix or its motor, since its face holds the mic key, and
// while a file is over the app, to take the drop. Every face wears a close cap, and Add instrument
// brings a closed one back. The bench gives a staged kit a shelf above the rest.
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
  const { shows, close, bring } = useBenchFaces()
  const risen = useBoardValue(c =>
    INSTRUMENTS.filter(stage => onBoard(c).has(stage)).join('|'),
  )
  useEffect(() => {
    if (risen) add(risen.split('|'))
  }, [risen])
  useEffect(
    () =>
      engine.drumsPlaying.subscribe(() => {
        if (engine.drumsPlaying.get()) stageOnRun()
      }),
    [],
  )
  const micOn = useStoreValue(engine.micOn)
  const micJack = Math.round(useControlValue('micPatch'))
  const over = useStoreValue(dragging)
  const tapeHeld =
    (micOn && (micJack === MIC.mix || micJack === MIC.tapeMotor)) || over
  const face = (stage: string) =>
    shows(stage) || (stage === 'Spool' && tapeHeld)

  const faces = (machines: Row) =>
    machines
      .filter(([stage]) => face(stage))
      .map(([stage, Machine]) => (
        <Machine
          key={stage}
          seconds={seconds}
          onClose={() => close(stage)}
          onOpen={onOpen}
        />
      ))

  const keyboards = faces(KEYBOARDS)
  const staged = useStoreValue(bench).grid
  const kit = staged ? [] : faces(KIT)
  const stagedKit = staged ? faces(KIT) : []
  const tapes = faces(TAPES)
  const pedals = usePedalStages()
  const bends = useBendStages()

  const bringUp = (stage: string) => {
    bring(stage)
    const level = levelOf(stage)
    if (level && engine.controls.get()[level] === 0) {
      engine.armStep()
      engine.set(level, ADDED_LEVEL)
    }
  }

  const choices = INSTRUMENTS.filter(stage => !face(stage)).map(stage => ({
    stage,
    kind: KIND[stage]!,
  }))

  return (
    <>
      <div className={styles.bar}>
        <AddMenu
          className={styles.add}
          text="Add instrument"
          choices={choices}
          onPick={bringUp}
        />
        <AddPedal />
        <MicMenu className={styles.add} />
        <BendKeysSwitch />
      </div>
      <BendKeys morphSeconds={seconds} />
      <GateBench>
        {stagedKit.length > 0 && (
          <div className={styles.stage}>{stagedKit}</div>
        )}
        {(keyboards.length > 0 ||
          kit.length > 0 ||
          pedals.length > 0 ||
          bends.length > 0) && (
          <div className={styles.shelf}>
            {keyboards.length > 0 && (
              <div className={styles.lane}>
                <ModPlate />
                {keyboards}
              </div>
            )}
            {(kit.length > 0 || pedals.length > 0 || bends.length > 0) && (
              <div className={styles.rack}>
                {kit}
                <BendShelf seconds={seconds} onOpen={onOpen} />
                <PedalShelf seconds={seconds} onOpen={onOpen} />
              </div>
            )}
          </div>
        )}
        {tapes.length > 0 && <div className={styles.shelf}>{tapes}</div>}
      </GateBench>
    </>
  )
}
