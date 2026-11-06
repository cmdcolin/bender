import { useEffect } from 'react'

import { MIC } from '../dsp/micJacks.ts'
import { engine } from '../engine/engine.ts'
import { AddMenu } from './AddMenu.tsx'
import { bench, INSTRUMENTS } from './bench.ts'
import { useBenchFaces } from './benchFaces.ts'
import { BendKeys, BendKeysSwitch } from './BendKeys.tsx'
import { BottleFace } from './BottleFace.tsx'
import { onBoard } from './chain-map.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import { DrumKit } from './DrumKit.tsx'
import { EffectShelf } from './EffectShelf.tsx'
import { Faceplate } from './Faceplate.tsx'
import { add, added, shownOn } from './fitted.ts'
import { FmKeys } from './FmKeys.tsx'
import { FourTrack } from './FourTrack.tsx'
import { GateBench, ModPlate } from './GateCables.tsx'
import styles from './Instruments.module.css'
import { Keys } from './Keys.tsx'
import { MicFace } from './MicFace.tsx'
import { MicMenu } from './MicJacks.tsx'
import { wireOn } from './micWiring.ts'
import { LeadKeys, MonoKeys } from './MonoKeys.tsx'
import { PcmKeys } from './PcmKeys.tsx'
import { AddPedal } from './Pedals.tsx'
import { SheetFace } from './SheetFace.tsx'
import { SourceMeters, SourceMetersSwitch } from './SourceMeters.tsx'
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
  ['Howler', LeadKeys],
]

const KIT: Row = [['Clatter', DrumKit]]

const TAPES: Row = [
  ['Spool', TapeLoopFace],
  ['Layercake', FourTrackFace],
]

const STRUCK: Row = [
  ['Sheet', SheetFace],
  ['Bottle', BottleFace],
]

const ADDED_LEVEL = 0.6

const KIND: Record<string, string> = {
  Plinky: 'toy keyboard',
  Clatter: 'toy drums',
  Glint: 'FM synth',
  Parlor: 'home keyboard',
  Growler: 'mono synth',
  Howler: 'lead synth',
  Spool: 'tape loop',
  Layercake: 'four-track',
  Sheet: 'struck metal',
  Bottle: 'glass bottle',
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
  const risen = useBoardValue(c => {
    const on = onBoard(c)
    return INSTRUMENTS.filter(stage => on.has(stage)).join('|')
  })
  useEffect(() => {
    if (risen) add(risen.split('|'))
  }, [risen])
  const micOn = useStoreValue(engine.micOn)
  const micOnTape = useBoardValue(
    c => wireOn(c, MIC.mix) > 0 || wireOn(c, MIC.tapeMotor) > 0,
  )
  const over = useStoreValue(dragging)
  const tapeHeld = (micOn && micOnTape) || over
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
  useStoreValue(added)
  const mic = useBoardValue(c => shownOn(c).has('Mic'))
  const { grid: staged, pedals, bends } = useStoreValue(bench)
  const kit = staged ? [] : faces(KIT)
  const stagedKit = staged ? faces(KIT) : []
  const tapes = [...faces(TAPES), ...faces(STRUCK)]

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
          text="add instrument"
          choices={choices}
          onPick={bringUp}
        />
        <AddPedal />
        <MicMenu className={styles.add} />
        <BendKeysSwitch />
        <SourceMetersSwitch />
      </div>
      <SourceMeters />
      <BendKeys morphSeconds={seconds} />
      <GateBench>
        {stagedKit.length > 0 && (
          <div className={styles.stage}>{stagedKit}</div>
        )}
        {(keyboards.length > 0 ||
          mic ||
          kit.length > 0 ||
          pedals.length > 0 ||
          bends.length > 0) && (
          <div className={styles.shelf}>
            {(keyboards.length > 0 || mic) && (
              <div className={styles.lane}>
                {keyboards.length > 0 && <ModPlate />}
                {keyboards}
                {mic && <MicFace seconds={seconds} onOpen={onOpen} />}
              </div>
            )}
            {(kit.length > 0 || pedals.length > 0 || bends.length > 0) && (
              <EffectShelf
                className={styles.rack}
                before={kit}
                seconds={seconds}
                onOpen={onOpen}
              />
            )}
          </div>
        )}
        {tapes.length > 0 && <div className={styles.shelf}>{tapes}</div>}
      </GateBench>
    </>
  )
}
