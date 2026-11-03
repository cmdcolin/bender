import { engine } from '../engine/engine.ts'
import { useControlValue, useStoreValue } from './ControlsContext.ts'
import styles from './MicFace.module.css'
import { MIC_JACKS } from './micWiring.ts'
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

function Into() {
  const jack = Math.round(useControlValue('micPatch'))
  const late = useControlValue('micDelay') > 0
  return (
    <span className={styles.into}>
      {late ? 'delay, then ' : 'into '}
      {where(jack)}
    </span>
  )
}

/** The mic on the bench: the switch that opens it, how hot it runs, and the
    delay between it and the jack it is soldered to. */
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
      footswitch={<OpenSwitch />}
      badge={<Into />}
      onOpen={onOpen}
    />
  )
}
