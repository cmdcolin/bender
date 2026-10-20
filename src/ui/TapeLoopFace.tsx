import { useState } from 'react'

import { detailsUrl } from '../engine/archive.ts'
import { engine } from '../engine/engine.ts'
import { useStoreValue } from './ControlsContext.ts'
import { DeckKey } from './DeckKey.tsx'
import { Faceplate } from './Faceplate.tsx'
import { toggleMic } from './plugMic.ts'
import { SampleReel } from './SampleReel.tsx'
import { dragging } from './tapeDrop.ts'
import styles from './TapeLoopFace.module.css'
import { TapeShelf } from './TapeShelf.tsx'
import { TapeTransport } from './TapeTransport.tsx'
import { Tip } from './Tip.tsx'

export function TapeLoopFace({
  seconds,
  onClose,
}: {
  seconds?: number
  onClose?: () => void
}) {
  const micOn = useStoreValue(engine.micOn)
  const micError = useStoreValue(engine.micError)
  const sampleError = useStoreValue(engine.sampleError)
  const sampleName = useStoreValue(engine.sampleName)
  const archiveStep = useStoreValue(engine.archiveStep)
  const archiveSource = useStoreValue(engine.archiveSource)
  const over = useStoreValue(dragging)
  const [showShelf, setShowShelf] = useState(false)
  const [shelfBtn, setShelfBtn] = useState<HTMLButtonElement | null>(null)

  return (
    <Faceplate stage="Spool" seconds={seconds} onClose={onClose}>
      <div className={styles.controls}>
        <TapeTransport
          loaded={!!sampleName}
          lead={
            <>
              <Tip text="Puts a tape on Spool off archive.org: a random one from a shelf, or one you search for.">
                <DeckKey
                  ref={setShelfBtn}
                  glyph={archiveStep ? 'cancel' : 'eject'}
                  legend={archiveStep ? 'abort' : 'load'}
                  name={archiveStep ? 'cancel' : 'load a tape'}
                  latched={showShelf && !archiveStep}
                  aria-expanded={showShelf && !archiveStep}
                  onClick={() =>
                    archiveStep ? engine.cancelRoll() : setShowShelf(o => !o)
                  }
                />
              </Tip>
              <Tip
                text={
                  micOn
                    ? 'Closes the microphone and takes it off the board.'
                    : 'Opens the microphone as an input to the board.'
                }
              >
                <DeckKey
                  glyph="mic"
                  legend="mic"
                  red
                  latched={micOn}
                  onClick={toggleMic}
                />
              </Tip>
            </>
          }
        />
        {showShelf && !archiveStep && (
          <TapeShelf anchor={shelfBtn} onDone={() => setShowShelf(false)} />
        )}
        {over ? (
          <p className={styles.slotHot}>drop an audio file anywhere</p>
        ) : (
          !sampleName && (
            <p className={styles.emptyTape}>
              nothing on the tape: drop an audio file anywhere, or press rec for
              a blank reel
            </p>
          )
        )}
        <SampleReel>
          {sampleName && (
            <span className={styles.tapeName} title={sampleName}>
              {sampleName}
            </span>
          )}
          {!archiveStep && archiveSource && (
            <a
              className={styles.credit}
              href={detailsUrl(archiveSource.id)}
              target="_blank"
              rel="noreferrer"
            >
              archive.org/{archiveSource.id}
            </a>
          )}
        </SampleReel>
        {archiveStep && <p className={styles.rolling}>{archiveStep}</p>}
        {(micError || sampleError) && (
          <p className={styles.rolling} role="alert">
            {micError || sampleError}
          </p>
        )}
      </div>
    </Faceplate>
  )
}
