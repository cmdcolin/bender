import { engine } from '../engine/engine.ts'
import { useBoardValue } from './ControlsContext.ts'
import { DeckGroup, DeckKey, DeckWell, DeckWord } from './DeckKey.tsx'
import { Tip } from './Tip.tsx'

import type { ReactNode } from 'react'

const SPEED_LABELS = ['½×', '1×', '2×'] as const
type Speed = (typeof SPEED_LABELS)[number]
const SPEEDS: Record<Speed, number> = { '½×': 0.5, '1×': 1, '2×': 2 }

const NOTHING =
  'Nothing on the tape yet. Load one, drop a file or open the mic.'

function play() {
  const c = engine.controls.get()
  if (c.sampleLevel > 0) return
  engine.set('sampleLevel', 0.7)
  if (c.sampleMode === 1) engine.seekSample(Math.min(c.loopIn, c.loopOut))
}

// What you do to a tape loop with your hand on it: start it, stop it, turn it
// round, run it at half or double. The Speed knob in the panel does all of it
// and more; these are the keys that come up every time, laid out as on a deck:
// play stays down until stop pops it.
export function TapeTransport({
  loaded,
  lead,
}: {
  loaded: boolean
  lead?: ReactNode
}) {
  const running = useBoardValue(c => c.sampleLevel > 0)
  const speed = useBoardValue(c => c.sampleSpeed)
  const reversed = speed < 0
  const current =
    SPEED_LABELS.find(l => Math.abs(Math.abs(speed) - SPEEDS[l]) < 0.005) ??
    null

  const speedTip = loaded
    ? 'Tape speed: half, normal or double, in whichever direction it is running. The Speed knob in the panel goes anywhere between.'
    : NOTHING

  return (
    <DeckWell label="tape deck">
      {lead && <DeckGroup>{lead}</DeckGroup>}
      <DeckGroup>
        <Tip
          text={
            loaded
              ? 'Runs the tape backwards from where the head stands. Press again to go forwards.'
              : NOTHING
          }
        >
          <DeckKey
            glyph="reverse"
            legend="rev"
            name="reverse"
            latched={reversed}
            disabled={!loaded}
            onClick={() => engine.set('sampleSpeed', speed === 0 ? -1 : -speed)}
          />
        </Tip>
        <Tip
          text={
            loaded
              ? 'Starts the tape. A one-shot starts again from the front.'
              : NOTHING
          }
        >
          <DeckKey
            glyph="play"
            legend="play"
            latched={running}
            disabled={!loaded}
            onClick={play}
          />
        </Tip>
        <Tip text={loaded ? 'Stops the tape.' : NOTHING}>
          <DeckKey
            glyph="stop"
            legend="stop"
            disabled={!loaded || !running}
            onClick={() => engine.set('sampleLevel', 0)}
          />
        </Tip>
      </DeckGroup>
      <DeckGroup>
        {SPEED_LABELS.map(l => (
          <Tip key={l} text={speedTip}>
            <DeckWord
              name={l}
              latched={l === current}
              disabled={!loaded}
              onClick={() =>
                engine.set('sampleSpeed', (reversed ? -1 : 1) * SPEEDS[l])
              }
            >
              {l}
            </DeckWord>
          </Tip>
        ))}
      </DeckGroup>
    </DeckWell>
  )
}
