import { useState, type ReactNode } from 'react'

import { engine } from '../engine/engine.ts'
import { useBoardValue, useMeterValue } from './ControlsContext.ts'
import { DeckGroup, DeckKey, DeckWell, DeckWord } from './DeckKey.tsx'
import { DrawerSlider, FaceLevel } from './DeviceVerbs.tsx'
import { Menu } from './Menu.tsx'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'

const SPEED_LABELS = ['½×', '1×', '2×'] as const
type Speed = (typeof SPEED_LABELS)[number]
const SPEEDS: Record<Speed, number> = { '½×': 0.5, '1×': 1, '2×': 2 }

const NOTHING =
  'Nothing on the tape yet. Load one, drop a file or open the mic.'

let resumeLevel = 0.7
let resumeRec = 1

function arm() {
  const rec = engine.controls.get().loopRec
  if (rec > 0) resumeRec = rec
  engine.set('loopRec', rec > 0 ? 0 : resumeRec)
}

function play() {
  const c = engine.controls.get()
  if (c.sampleLevel > 0) return
  engine.set('sampleLevel', resumeLevel)
  if (c.sampleMode === 1) engine.seekSample(Math.min(c.loopIn, c.loopOut))
}

// The arrow beside a key: opens that key's knobs in a popover, for settings
// that want a hand on them while the tape runs.
function KnobArrow({
  name,
  tip,
  controls,
  disabled,
}: {
  name: string
  tip: string
  controls: ControlKey[]
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [arrow, setArrow] = useState<HTMLButtonElement | null>(null)
  return (
    <>
      <Tip text={disabled ? NOTHING : tip}>
        <DeckWord
          ref={setArrow}
          name={name}
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen(o => !o)}
        >
          ▾
        </DeckWord>
      </Tip>
      {open && !disabled && (
        <Menu
          anchor={arrow}
          toggle={arrow}
          role="group"
          label={name}
          onClose={() => setOpen(false)}
        >
          {controls.map(control => (
            <DrawerSlider key={control} control={control} />
          ))}
        </Menu>
      )}
    </>
  )
}

// What you do to a tape loop with your hand on it: start it, stop it, turn it
// round, step it through half, normal and double. The Speed knob in the panel
// does all of it and more; these are the keys that come up every time, laid out
// as on a deck: play stays down until stop pops it. Rec arms the record head,
// which works on a blank reel too. The arrow beside a key opens its knobs in a
// popover.
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
  const arming = useBoardValue(c => c.loopRec > 0)
  const threaded = useMeterValue(m => m.sampleSecs > 0)
  const on = loaded || threaded
  const current =
    SPEED_LABELS.find(l => Math.abs(Math.abs(speed) - SPEEDS[l]) < 0.005) ??
    null

  const shown = current ?? `${Math.abs(speed).toFixed(2)}×`
  const next: Speed =
    current === null
      ? '1×'
      : SPEED_LABELS[(SPEED_LABELS.indexOf(current) + 1) % SPEED_LABELS.length]!

  return (
    <DeckWell label="tape deck">
      {lead && <DeckGroup>{lead}</DeckGroup>}
      <DeckGroup>
        <Tip
          text={
            on
              ? 'Runs the tape backwards from where the head stands. Press again to go forwards.'
              : NOTHING
          }
        >
          <DeckKey
            glyph="reverse"
            legend="rev"
            name="reverse"
            latched={reversed}
            disabled={!on}
            onClick={() => engine.set('sampleSpeed', speed === 0 ? -1 : -speed)}
          />
        </Tip>
        <Tip
          text={
            on
              ? 'Starts the tape. A one-shot starts again from the front.'
              : NOTHING
          }
        >
          <DeckKey
            glyph="play"
            legend="play"
            latched={running}
            disabled={!on}
            onClick={play}
          />
        </Tip>
        <Tip text={on ? 'Stops the tape.' : NOTHING}>
          <DeckKey
            glyph="stop"
            legend="stop"
            disabled={!on || !running}
            onClick={() => {
              resumeLevel = engine.controls.get().sampleLevel
              engine.set('sampleLevel', 0)
            }}
          />
        </Tip>
        <Tip
          text={
            arming
              ? 'Stops laying the board’s output onto the tape.'
              : 'Lays the board’s output onto the tape where the play head is reading, over whatever is there. With nothing loaded it threads a blank reel first. Press play to hear it come round.'
          }
        >
          <DeckKey
            glyph="rec"
            legend="rec"
            name="record onto the tape"
            red
            latched={arming}
            onClick={arm}
          />
        </Tip>
        <KnobArrow
          name="record knobs"
          tip="Opens Record, Erase and the length of a blank reel."
          controls={['loopRec', 'loopErase', 'loopSecs']}
        />
      </DeckGroup>
      <DeckGroup>
        <Tip
          text={
            on
              ? `Tape speed, stepping through half, normal and double in whichever direction it is running — press for ${next}. The arrow beside it, or the Speed knob in the panel, goes anywhere between.`
              : NOTHING
          }
        >
          <DeckWord
            name={`tape speed ${shown}`}
            disabled={!on}
            onClick={() =>
              engine.set('sampleSpeed', (reversed ? -1 : 1) * SPEEDS[next])
            }
          >
            {shown}
          </DeckWord>
        </Tip>
        <KnobArrow
          name="speed knob"
          tip="Opens the speed knob, to set any speed between the steps while you listen."
          controls={['sampleSpeed']}
          disabled={!on}
        />
      </DeckGroup>
      {on && (
        <DeckGroup>
          <FaceLevel control="sampleLevel" />
        </DeckGroup>
      )}
    </DeckWell>
  )
}
