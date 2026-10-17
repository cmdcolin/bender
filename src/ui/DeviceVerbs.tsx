import { useCallback, useState } from 'react'

import { engine } from '../engine/engine.ts'
import { PEDALS } from '../pedals.ts'
import { GROUPS, sliderFor } from './controls/index.ts'
import { useControlValue } from './ControlsContext.ts'
import styles from './DeviceVerbs.module.css'
import { Menu } from './Menu.tsx'
import { menuItem } from './menuItems.ts'
import { STAGE_ROLLS, stageRollsFor } from './presets/index.ts'
import { rollIn, undoRoll, useCanUndoRoll } from './rollBack.ts'
import { ControlSlider } from './Slider.tsx'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'
import type { Group } from './controls/types.ts'
import type { StageRoll } from './presets/index.ts'

const MUTE_OF: Record<string, ControlKey> = {
  'Toy keyboard': 'chipMute',
  'Toy drums': 'drumMute',
  'FM chip': 'fmMute',
  'Home keyboard': 'pcmMute',
  'Mono synth': 'monoMute',
  Stompbox: 'stompMute',
  'Tape delay': 'dlyMute',
  'Delay pedal': 'echoMute',
  'Spring verb': 'revMute',
  Ensemble: 'ensMute',
  'Tube amp': 'ampMute',
}

const LEVEL_OF: Record<string, ControlKey> = {
  'Toy keyboard': 'chipLevel',
  'Toy drums': 'drumLevel',
  'FM chip': 'fmLevel',
  'Home keyboard': 'pcmLevel',
  'Mono synth': 'monoLevel',
}

const POWER = (
  <svg className={styles.speaker} viewBox="0 0 12 12" aria-hidden="true">
    <path
      d="M6 1v4.5M3.2 3a4.5 4.5 0 1 0 5.6 0"
      fill="none"
      stroke="currentColor"
    />
  </svg>
)

const SPEAKER = (muted: boolean) => (
  <svg className={styles.speaker} viewBox="0 0 12 12" aria-hidden="true">
    <path d="M1 4h2.5L7 1v10L3.5 8H1Z" />
    {muted ? (
      <path d="M8.5 4.2 9.2 3.5 10.5 4.8 11.8 3.5 12.5 4.2 11.2 5.5 12.5 6.8 11.8 7.5 10.5 6.2 9.2 7.5 8.5 6.8 9.8 5.5Z" />
    ) : (
      <path
        d="M8.5 4a2.5 2.5 0 0 1 0 4M9.5 2.5a4.5 4.5 0 0 1 0 7"
        fill="none"
        stroke="currentColor"
      />
    )}
  </svg>
)

const isPedal = (stage: string) => PEDALS.some(p => p.group === stage)

function Mute({ stage, control }: { stage: string; control: ControlKey }) {
  const muted = useControlValue(control) > 0.5
  const pedal = isPedal(stage)
  return (
    <Tip
      text={
        pedal
          ? muted
            ? `${stage} is bypassed. Switching it back on brings the sound you left.`
            : `Takes ${stage} out of the path and leaves its knobs where they are.`
          : muted
            ? `${stage} is muted. Unmute brings it back at the Level you left.`
            : `Silences ${stage} and leaves its Level where it is.`
      }
    >
      <button
        className={muted ? styles.capOn : styles.cap}
        aria-label={`${pedal ? 'bypass' : 'mute'} ${stage}`}
        aria-pressed={muted}
        onClick={() => {
          engine.armStep()
          engine.set(control, muted ? 0 : 1)
        }}
      >
        {pedal ? POWER : SPEAKER(muted)}
      </button>
    </Tip>
  )
}

// The roll cap and the kinds of roll behind its caret. Picking a kind rolls at
// once and stays on the face, so going again on it is one press, the way the
// board's dice work.
function Rolls({ group, seconds }: { group: Group; seconds: number }) {
  const kinds = stageRollsFor(group)
  const [held, setHeld] = useState(STAGE_ROLLS[0]!.name)
  const [open, setOpen] = useState(false)
  const [split, setSplit] = useState<HTMLSpanElement | null>(null)
  const [caret, setCaret] = useState<HTMLButtonElement | null>(null)
  const canUndo = useCanUndoRoll(group.name)
  const close = useCallback(() => setOpen(false), [])
  const face = kinds.find(k => k.name === held) ?? kinds[0]!

  const roll = (kind: StageRoll) => {
    setHeld(kind.name)
    rollIn(
      group.name,
      kind.roll(group, engine.controls.get(), Math.random),
      seconds,
    )
  }

  return (
    <span className={styles.split} ref={setSplit}>
      <Tip text={`${face.blurb} Leaves the rest of the board alone.`}>
        <button className={styles.face} onClick={() => roll(face)}>
          {face.label}
        </button>
      </Tip>
      <Tip
        text={`The other ways to roll ${group.name}. Picking one rolls it, and it stays on the button.`}
      >
        <button
          ref={setCaret}
          className={open ? styles.caretOn : styles.caret}
          aria-label={`pick a kind of roll for ${group.name}`}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          ▾
        </button>
      </Tip>
      {open && (
        <Menu anchor={split} toggle={caret} role="menu" onClose={close}>
          {kinds.map(kind => (
            <Tip key={kind.name} text={kind.blurb}>
              <button
                role="menuitem"
                className={menuItem(kind.name === face.name)}
                onClick={() => {
                  close()
                  roll(kind)
                }}
              >
                {kind.name}
              </button>
            </Tip>
          ))}
          <Tip
            text={
              canUndo
                ? `Puts ${group.name} back where it stood before its last roll.`
                : `No roll of ${group.name} to take back.`
            }
          >
            <button
              role="menuitem"
              className={menuItem(false)}
              disabled={!canUndo}
              onClick={() => {
                close()
                undoRoll(group.name, seconds)
              }}
            >
              undo
            </button>
          </Tip>
        </Menu>
      )}
    </span>
  )
}

// The caps every instrument and pedal on the bench carries: an instrument's
// level, mute or bypass, roll the stage somewhere new, and put the machine away
// where it can be put away.
export function DeviceVerbs({
  stage,
  seconds = 0,
  onClose,
}: {
  stage: string
  seconds?: number
  onClose?: () => void
}) {
  const group = GROUPS.find(g => g.name === stage)
  if (!group) throw new Error(`no stage named ${stage}`)
  const mute = MUTE_OF[stage]
  const level = LEVEL_OF[stage]
  return (
    <>
      {level && (
        <span className={styles.level}>
          <ControlSlider def={sliderFor(level)} />
        </span>
      )}
      {mute && <Mute stage={stage} control={mute} />}
      <Rolls group={group} seconds={seconds} />
      {onClose && (
        <Tip text={`Puts ${stage} away. Its sound stays on the board.`}>
          <button
            className={styles.cap}
            aria-label={`close ${stage}`}
            onClick={onClose}
          >
            ×
          </button>
        </Tip>
      )}
    </>
  )
}
