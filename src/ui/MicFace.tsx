import { engine } from '../engine/engine.ts'
import {
  useBoardValue,
  useControlValue,
  useStoreValue,
} from './ControlsContext.ts'
import styles from './MicFace.module.css'
import { MIC_JACKS, wireIsLate } from './micWiring.ts'
import pedal from './Pedals.module.css'
import { toggleMic } from './plugMic.ts'
import { StompFace, type Face } from './StompFace.tsx'
import { Tip } from './Tip.tsx'

const FACE: Face = {
  colour: '#4e5563',
  switch: 'micDelaySync',
  sliders: ['micLevel', 'micDelay', 'micRepeats'],
}

const where = (jack: number) => {
  const { stage, part } = MIC_JACKS[jack]!
  return stage === 'mix' ? 'the mix bus' : `${stage}’s ${part}`
}

function OpenSwitch() {
  const on = useStoreValue(engine.micOn)
  return (
    <Tip
      text={
        on
          ? 'Closes the microphone. The jack and the delay stay as set.'
          : 'Opens the microphone into the jack it is soldered to.'
      }
    >
      <span className={pedal.bay}>
        <span
          className={on ? pedal.lampOn : pedal.lampOff}
          aria-hidden="true"
        />
        <button
          className={pedal.foot}
          aria-label="open mic"
          aria-pressed={on}
          onClick={() => toggleMic()}
        />
      </span>
    </Tip>
  )
}

function Wire({ jack, late }: { jack: number; late: boolean }) {
  return (
    <span className={styles.into}>
      {late ? 'delay, then ' : 'into '}
      {where(jack)}
    </span>
  )
}

function Into() {
  const first = Math.round(useControlValue('micPatch'))
  const second = Math.round(useControlValue('micPatch2')) - 1
  const late1 = useBoardValue(c => wireIsLate(c, 1))
  const late2 = useBoardValue(c => wireIsLate(c, 2))
  return (
    <>
      <Wire jack={first} late={late1} />
      {second >= 0 && second !== first && <Wire jack={second} late={late2} />}
    </>
  )
}

function FreezeKey() {
  const frozen = useControlValue('micFreeze') >= 0.5
  const delayUp = useControlValue('micDelay') > 0
  return (
    <Tip
      text={
        delayUp
          ? 'Holds what is in the delay and plays it round and round into the jack.'
          : 'Holds what is in the delay. Turn Delay up first.'
      }
    >
      <button
        className={frozen ? styles.freezeOn : pedal.more}
        aria-pressed={frozen}
        onClick={() => {
          engine.armStep()
          engine.set('micFreeze', frozen ? 0 : 1)
        }}
      >
        freeze
      </button>
    </Tip>
  )
}

/** The mic on the bench: the switch that opens it, how hot it runs, the
    delay between it and its jacks and the freeze that holds the delay. */
export function MicFace({
  seconds,
  onOpen,
}: {
  seconds: number
  onOpen: (stage: string) => void
}) {
  return (
    <StompFace
      stage="Mic"
      face={FACE}
      seconds={seconds}
      footswitch={
        <>
          <OpenSwitch />
          <FreezeKey />
        </>
      }
      badge={<Into />}
      onOpen={onOpen}
    />
  )
}
