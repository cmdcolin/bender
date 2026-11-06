import { engine } from '../engine/engine.ts'
import { GateJumper, TrigJack } from './GateCables.tsx'
import { Keybed } from './Keybed.tsx'
import { CvJack } from './ModJacks.tsx'
import styles from './MonoKeys.module.css'
import { RailLamp } from './RailLamp.tsx'
import { SeqRec } from './SeqRec.tsx'

import type { CardStage } from './cards.ts'

interface Props {
  seconds?: number
  onClose?: () => void
  onOpen?: (stage: string) => void
}

const BEDS = {
  Growler: {
    dest: 'mono',
    label: 'growler',
    notes: engine.monoNotes,
    supply: 'monoSupply',
    down: ', an octave or two down',
  },
  Howler: {
    dest: 'lead',
    label: 'howler',
    notes: engine.leadNotes,
    supply: 'leadSupply',
    down: '',
  },
} as const

// The mono synth's bed: walnut cheeks, a black panel with three knob caps for
// the oscillators, and the jumper off the toy's gate. Howler wears the same.
export function MonoKeys({
  seconds,
  onClose,
  onOpen,
  stage = 'Growler',
}: Props & { stage?: CardStage }) {
  const bed = BEDS[stage]
  return (
    <Keybed
      dest={bed.dest}
      label={bed.label}
      caseClass={styles.case}
      badge={
        <span className={styles.badge}>
          <span className={styles.model}>{bed.label}</span>
          <span className={styles.knobs} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </span>
      }
      jack={
        <>
          <GateJumper
            taker={bed.dest}
            notes={bed.notes}
            cutTip={`No cable in ${stage}’s GATE jack, so notes reach the synth from these keys, its TRIG cable and a controller. Press to plug Plinky’s notes in`}
            solderedTip={`Plinky’s notes reach ${stage} through this cable, so the tune plays it too${bed.down}. Press to pull the cable`}
          />
          <TrigJack taker={bed.dest} />
          <CvJack machine={stage} />
        </>
      }
      extras={
        <>
          <RailLamp onOpen={onOpen} supply={bed.supply} />
          {stage === 'Growler' && <SeqRec dest="mono" name="Growler" />}
        </>
      }
      stage={stage}
      onOpen={onOpen}
      seconds={seconds}
      onClose={onClose}
      tail={<span className={styles.rocker} aria-hidden="true" />}
    />
  )
}

export function LeadKeys(props: Props) {
  return <MonoKeys {...props} stage="Howler" />
}
