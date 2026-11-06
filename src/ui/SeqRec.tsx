import { engine } from '../engine/engine.ts'
import { SEQ_DESTS } from '../engine/messages.ts'
import { CARD_RECORD } from './cardRecord.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import styles from './SeqRec.module.css'
import { Tip } from './Tip.tsx'
import { useLinePlaying } from './tuneRoll.ts'

import type { SeqDest } from '../engine/messages.ts'

function RecCap({
  armed,
  playing,
  idle,
  onPress,
}: {
  armed: boolean
  playing: boolean
  idle: string
  onPress: () => void
}) {
  return (
    <Tip
      text={
        !armed
          ? idle
          : playing
            ? 'every key you press here is going into the memory. Press to stop'
            : 'armed, but the memory is stopped — the keys sound and nothing is written. Run it and they land on the step they arrive in'
      }
    >
      <button
        className={
          !armed ? styles.rec : playing ? styles.recOn : styles.recIdle
        }
        aria-pressed={armed}
        onClick={onPress}
      >
        rec
      </button>
    </Tip>
  )
}

// The rec cap on a bed that the second melody can play: it points the memory at
// this machine and writes every key played here onto the step the counter is on.
export function SeqRec({ dest, name }: { dest: SeqDest; name: string }) {
  const recording = useStoreValue(engine.seqRecord)
  const playing = useStoreValue(engine.songPlaying)
  const here = useBoardValue(c => SEQ_DESTS[Math.round(c.monoSeqTo)] === dest)
  const armed = recording && here
  return (
    <RecCap
      armed={armed}
      playing={playing}
      idle={`record what you play into the second melody memory and aim it at ${name}: thirty-two steps, one note a step, on the step the counter is standing on. It puts the memory on and runs the song. The piano roll is a box in Growler’s drawing`}
      onPress={() => engine.armSeqRecord(!armed, dest)}
    />
  )
}

export function LeadRec() {
  const { recording, arm } = CARD_RECORD.Howler
  const armed = useStoreValue(recording)
  const playing = useLinePlaying('Howler')
  return (
    <RecCap
      armed={armed}
      playing={playing}
      idle="record what you play into Howler’s melody memory: thirty-two steps, one note a step, on the step the counter is standing on. It puts the memory on and runs it. The piano roll is a box in Howler’s drawing"
      onPress={() => arm(!armed)}
    />
  )
}
