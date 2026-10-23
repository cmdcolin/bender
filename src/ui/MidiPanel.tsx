import { Suspense, lazy, useEffect, type ReactNode } from 'react'

import { useStoreValue } from './ControlsContext.ts'
import { midi, type MidiStatus } from './midi.ts'
import styles from './MidiPanel.module.css'
import { Tip } from './Tip.tsx'

const Wired = lazy(() =>
  import('./MidiWired.tsx').then(
    m => ({ default: m.Wired }),
    () => ({
      default: () => <p>The MIDI panel did not load. Reload the page.</p>,
    }),
  ),
)

// The wire, behind a button in the nameplate row. Everything it offers needs a
// controller plugged in, so it takes no room in the panel until asked for.
//
// The button carries the status, because a stranded knob is a knob gone inert,
// and a board whose knobs have gone quiet has to say why with the card shut.
export function MidiPanel(props: {
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const status = useStoreValue(midi.status)
  const stranded = Object.keys(useStoreValue(midi.pickups)).length
  const note = midiTabNote(status, stranded)

  return (
    <>
      <Tip
        text={
          status === 'ready'
            ? stranded > 0
              ? `${stranded} bound knob${stranded === 1 ? ' is' : 's are'} out of step with the board and doing nothing until you sweep each through its value. Press for the bindings, the pads and the wire`
              : 'the bindings you have made, the pads, and what the wire is carrying'
            : 'play the board from a MIDI controller: bind any control to a knob, the kit to a pad bank, the keys to a keybed'
        }
      >
        <button
          className={
            stranded > 0
              ? styles.tabWaiting
              : status === 'ready'
                ? styles.tabOn
                : status === 'idle' || status === 'unsupported'
                  ? styles.tabIdle
                  : styles.tab
          }
          aria-expanded={props.open}
          onClick={props.onToggle}
        >
          midi
          {note === null ? null : (
            <span className={styles.tabNote}>{note}</span>
          )}
        </button>
      </Tip>
      {props.open && (
        <MidiDialog
          status={status}
          onEnable={() => midi.enable()}
          onClose={props.onClose}
        >
          <Suspense fallback={null}>
            <Wired />
          </Suspense>
        </MidiDialog>
      )}
    </>
  )
}

// The way in while the wire is off and the button is hidden. A browser with no
// Web MIDI gets neither.
export function MidiMenuItem(props: {
  className: string | undefined
  onPick: () => void
}) {
  const status = useStoreValue(midi.status)
  if (status !== 'idle') return null
  return (
    <button role="menuitem" className={props.className} onClick={props.onPick}>
      midi
    </button>
  )
}

// CROSS_REPO_SYNC(midi-tab-note)
function midiTabNote(status: MidiStatus, stranded: number): string | null {
  if (status === 'ready') return stranded > 0 ? `${stranded} waiting` : null
  if (status === 'unsupported') return 'n/a'
  if (status === 'denied') return 'refused'
  if (status === 'requesting') return 'asking…'
  return null
}
// CROSS_REPO_SYNC_END(midi-tab-note)

// Non-modal: every control binds from its own ⚟, in the panel behind this card,
// so the panel has to stay reachable with the card up. A shown dialog gets no
// `cancel` event, so Escape is bound by hand. If a control is armed, the first
// Escape cancels the binding (handled by Wired); only the second Escape closes
// the dialog.
function MidiDialog(props: {
  status: MidiStatus
  onEnable: () => void
  onClose: () => void
  children: ReactNode
}) {
  const { onClose } = props

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !midi.waiting()) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <dialog
      ref={el => {
        if (el && !el.open) el.show()
      }}
      aria-label="midi"
      className={styles.card}
    >
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>midi</span>
        <button
          className={styles.close}
          onClick={onClose}
          aria-label="close midi"
        >
          ×
        </button>
      </div>
      {props.status === 'ready' ? (
        props.children
      ) : props.status === 'unsupported' ? (
        <div className={styles.hint}>
          this browser has no Web MIDI — try Chrome or Edge.
        </div>
      ) : (
        <div className={styles.row}>
          {/* Focus lands on the button that does the work, not on the close
              that comes first in the markup. */}
          <button className={styles.btn} autoFocus onClick={props.onEnable}>
            connect a controller
          </button>
          <span className={styles.hint}>
            {props.status === 'denied'
              ? 'the browser refused — allow MIDI for this site and try again'
              : 'the browser will ask once, then remember'}
          </span>
        </div>
      )}
    </dialog>
  )
}
