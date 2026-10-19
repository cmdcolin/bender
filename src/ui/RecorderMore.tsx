import { useState } from 'react'

import { engine } from '../engine/engine.ts'
import { DeckKey, DeckRow } from './DeckKey.tsx'
import { Menu } from './Menu.tsx'
import styles from './RecorderMore.module.css'
import { Tip } from './Tip.tsx'

// What the recorder can do besides take a take. It opens over the panel rather
// than in the recorder box, so a press here never moves the keys beside it.
// The two that act close it; the stems switch is a setting and leaves it open.
export function RecorderMore({
  recording,
  recStems,
}: {
  recording: boolean
  recStems: boolean
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)

  const act = (run: () => void) => () => {
    run()
    setOpen(false)
  }

  return (
    <>
      <Tip text="Save what you just heard, send it to Spool, or record each machine on its own.">
        <DeckKey
          ref={setAnchor}
          glyph="more"
          legend="more"
          name="options"
          latched={open}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        />
      </Tip>
      {open && (
        <Menu
          anchor={anchor}
          toggle={anchor}
          role="group"
          label="recorder options"
          onClose={() => setOpen(false)}
        >
          <div className={styles.rows}>
            <Tip text="Saves the last 30 seconds you heard as a wav, even if you were not recording.">
              <DeckRow glyph="save" onClick={act(() => engine.keepLast('wav'))}>
                save the last 30 s
              </DeckRow>
            </Tip>
            <Tip text="Puts the last 30 seconds you heard on Spool, to play back through the board.">
              <DeckRow
                glyph="tape"
                onClick={act(() => engine.keepLast('reel'))}
              >
                last 30 s → Spool
              </DeckRow>
            </Tip>
            <Tip text="Also saves each machine on its own, dry, one wav each — what you drag into a DAW. Locked while a take runs.">
              <DeckRow
                glyph="stems"
                latched={recStems}
                disabled={recording}
                onClick={() => engine.recStems.set(!recStems)}
              >
                one wav per machine
              </DeckRow>
            </Tip>
          </div>
        </Menu>
      )}
    </>
  )
}
