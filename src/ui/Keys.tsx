import { YOURS } from '../dsp/stages/roms.ts'
import { SFX_NAMES } from '../dsp/stages/toySfx.ts'
import { engine } from '../engine/engine.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import { EffectPads } from './EffectPads.tsx'
import { GateOut, TrigJack } from './GateCables.tsx'
import { Keybed } from './Keybed.tsx'
import styles from './Keys.module.css'
import { RailLamp } from './RailLamp.tsx'
import { Tip } from './Tip.tsx'

// The toy: a moulded case with a badge, a speaker and its own melody memory on
// the deck, around the bed every keyboard on this board shares.
export function Keys({
  seconds,
  onClose,
  onOpen,
}: {
  seconds?: number
  onClose?: () => void
  onOpen?: (stage: string) => void
}) {
  // The memory's own switch, on the deck rather than only on the roll: arming
  // it is something you do with your hands already on the keys, and the roll is
  // one panel away behind whatever stage is open.
  const recording = useStoreValue(engine.tuneRecord)
  const tunePlaying = useStoreValue(engine.songPlaying)
  const yourTune = useBoardValue(c => Math.round(c.chipTune) === YOURS)

  return (
    <Keybed
      dest="toy"
      label="plinky"
      badge={
        <>
          <span className={styles.brand}>plinky</span>
          <span className={styles.stripe} aria-hidden="true" />
        </>
      }
      jack={
        <>
          <GateOut />
          <TrigJack taker="toy" />
        </>
      }
      extras={
        <>
          <RailLamp onOpen={onOpen} supply="chipSupply" />
          <Tip
            text={
              yourTune
                ? 'Runs the toy chip on your own melody, the one in the piano roll. Space runs this and the drums together.'
                : "Runs the toy chip's ROM tune. Space runs this and the drums together."
            }
          >
            <button
              className={tunePlaying ? styles.playOn : styles.play}
              aria-label={tunePlaying ? 'stop tune' : 'start tune'}
              aria-pressed={tunePlaying}
              onClick={() => engine.setSongPlaying(!tunePlaying)}
            >
              {tunePlaying ? '❚❚' : '▶'}
            </button>
          </Tip>
          <Tip
            text={
              !recording
                ? 'record what you play into the toy’s melody memory — thirty-two steps, three notes to a step, on the step the chip is standing on. It puts the memory on and runs the tune. The piano roll is a box in Plinky’s drawing'
                : tunePlaying
                  ? 'every key you press is going into the memory. Press to stop'
                  : 'armed, but the tune is stopped — the keys sound and nothing is written. Press play your tune and they land on the step they arrive in'
            }
          >
            <button
              className={
                !recording
                  ? styles.rec
                  : tunePlaying
                    ? styles.recOn
                    : styles.recIdle
              }
              aria-pressed={recording}
              onClick={() => engine.armTuneRecord(!recording)}
            >
              rec
            </button>
          </Tip>
        </>
      }
      stage="Plinky"
      onOpen={onOpen}
      seconds={seconds}
      onClose={onClose}
      pads={hold => (
        <EffectPads
          dest="toy"
          names={SFX_NAMES}
          tips={SFX_TIPS}
          hold={hold}
          className={styles.pads}
        />
      )}
      tail={<span className={styles.grille} aria-hidden="true" />}
    />
  )
}

const SFX_TIPS = [
  'a zap that falls fast. Hold to fire again and again',
  'a wail that climbs and falls',
  'a warble that rises as it wobbles',
  'a whistle falling to a blast of noise',
  'a burst of noise with a thump under it. Hold for a machine gun',
  'a short rising chirp. Hold for a string of them',
]
