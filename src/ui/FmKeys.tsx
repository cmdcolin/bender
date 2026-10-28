import { EFFECTS } from '../dsp/stages/fmEffects.ts'
import { engine } from '../engine/engine.ts'
import { EffectPads } from './EffectPads.tsx'
import styles from './FmKeys.module.css'
import { GateJumper, TrigJack } from './GateCables.tsx'
import { Keybed } from './Keybed.tsx'
import { CvJack } from './ModJacks.tsx'
import { RailLamp } from './RailLamp.tsx'
import { SeqRec } from './SeqRec.tsx'

const FM_WAVE =
  'M0.0 7.0 L0.5 4.1 L1.0 2.3 L1.5 2.2 L2.0 3.9 L2.5 6.6 L3.0 9.4 L3.5 11.4 L4.0 12.0 L4.5 11.3 L5.0 9.6 L5.5 7.4 L6.0 5.3 L6.5 3.6 L7.0 2.5 L7.5 2.1 L8.0 2.1 L8.5 2.4 L9.0 3.0 L9.5 3.7 L10.0 4.4 L10.5 5.1 L11.0 5.6 L11.5 6.0 L12.0 6.4 L12.5 6.6 L13.0 6.8 L13.5 6.9 L14.0 7.0 L14.5 7.0 L15.0 7.0 L15.5 7.0 L16.0 7.0 L16.5 7.1 L17.0 7.2 L17.5 7.4 L18.0 7.6 L18.5 8.0 L19.0 8.4 L19.5 8.9 L20.0 9.6 L20.5 10.3 L21.0 11.0 L21.5 11.6 L22.0 11.9 L22.5 11.9 L23.0 11.5 L23.5 10.4 L24.0 8.7 L24.5 6.6 L25.0 4.4 L25.5 2.7 L26.0 2.0 L26.5 2.6 L27.0 4.6 L27.5 7.4 L28.0 10.1 L28.5 11.8 L29.0 11.7 L29.5 9.9 L30.0 7.0'

const EFFECT_NAMES = EFFECTS.map(e => e.name)
const EFFECT_TIPS = EFFECT_NAMES.map(
  name =>
    `runs the ${name} script off the effect ROM while held, on the top channel. The Effect row in Glint's panel keeps one running`,
)

// FmKeys draws the FM chip's keyboard as a green circuit board with a nameplate
// and a row of piano keys. The switch on the deck cuts or solders
// the jumper from the toy's gate.
export function FmKeys({
  seconds,
  onClose,
  onOpen,
}: {
  seconds?: number
  onClose?: () => void
  onOpen?: (stage: string) => void
}) {
  return (
    <Keybed
      dest="fm"
      label="glint"
      caseClass={styles.board}
      badge={
        <span className={styles.badge}>
          <span className={styles.part}>glint</span>
          <svg className={styles.wave} viewBox="0 0 30 14" aria-hidden="true">
            <path d={FM_WAVE} />
          </svg>
          <span className={styles.sub}>2-op</span>
        </span>
      }
      jack={
        <>
          <GateJumper
            taker="fm"
            notes={engine.fmNotes}
            cutTip="No cable in Glint’s GATE jack, so the chip plays these keys, its TRIG cable and nothing else. Press to plug Plinky’s notes in"
            solderedTip="Plinky’s notes reach Glint through this cable, so the chip plays whatever Plinky strikes as well as these keys. Press to pull the cable"
          />
          <TrigJack taker="fm" />
          <CvJack machine="Glint" />
        </>
      }
      extras={
        <>
          <RailLamp onOpen={onOpen} supply="fmSupply" />
          <SeqRec dest="fm" name="Glint" />
        </>
      }
      pads={hold => (
        <EffectPads
          dest="fm"
          names={EFFECT_NAMES}
          tips={EFFECT_TIPS}
          hold={hold}
          className={styles.pads}
        />
      )}
      stage="Glint"
      onOpen={onOpen}
      seconds={seconds}
      onClose={onClose}
      tail={<span className={styles.header} aria-hidden="true" />}
    />
  )
}
