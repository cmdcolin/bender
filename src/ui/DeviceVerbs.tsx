import { useCallback, useState, type ReactNode } from 'react'

import { engine } from '../engine/engine.ts'
import { isPedal } from '../pedals.ts'
import { GROUPS, sliderFor } from './controls/index.ts'
import { useBoardValue, useControlValue } from './ControlsContext.ts'
import styles from './DeviceVerbs.module.css'
import { Menu } from './Menu.tsx'
import { menuItem } from './menuItems.ts'
import { MicCap } from './MicJacks.tsx'
import { STAGE_ROLLS, stageRollsFor } from './presets/index.ts'
import { rollIn, undoRoll, useCanUndoRoll } from './rollBack.ts'
import { ControlSlider } from './Slider.tsx'
import { levelOf, muteOf } from './stageLevels.ts'
import { useHeardThrough, viaOf } from './stillHeard.ts'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'
import type { Group } from './controls/types.ts'
import type { StageRoll } from './presets/index.ts'

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

export const SHUFFLE = (
  <svg className={styles.shuffle} viewBox="0 0 12 12" aria-hidden="true">
    <path d="M1 3h2c3 0 3 6 6 6h2M1 9h2c3 0 3-6 6-6h2M9.5 1.5 11 3 9.5 4.5M9.5 7.5 11 9 9.5 10.5" />
  </svg>
)

// A Level dragged this close to zero on its way down is no Level to come back to.
const AUDIBLE_LEVEL = 0.05

function Mute({
  stage,
  control,
  level,
}: {
  stage: string
  control: ControlKey
  level?: ControlKey
}) {
  const switched = useControlValue(control) > 0.5
  const levelAt = useBoardValue(c => (level ? c[level] : 1))
  const [lastUp, setLastUp] = useState(
    levelAt > AUDIBLE_LEVEL
      ? levelAt
      : (level && sliderFor(level).normal?.[1]) || 1,
  )
  if (levelAt > AUDIBLE_LEVEL && levelAt !== lastUp) setLastUp(levelAt)
  const atZero = levelAt <= 0
  const muted = switched || atZero
  const pedal = isPedal(stage)
  return (
    <Tip
      text={
        pedal
          ? muted
            ? `${stage} is bypassed. Switching it back on brings the sound you left.`
            : `Takes ${stage} out of the path and leaves its knobs where they are.`
          : atZero
            ? `${stage}’s Level is at 0. Unmute brings it back up.`
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
          if (!muted) engine.set(control, 1)
          else {
            if (switched) engine.set(control, 0)
            if (atZero && level) engine.set(level, lastUp)
          }
        }}
      >
        {pedal ? POWER : SPEAKER(muted)}
      </button>
    </Tip>
  )
}

// A machine turned down and still in the mix: through a bend that reaches past
// its fader, or through another machine playing its part.
function StillHeard({ stage, level }: { stage: string; level: ControlKey }) {
  const where = useHeardThrough(stage)
  const atZero = useControlValue(level) <= 0
  if (where.length === 0) return null
  const players = where.filter(to => to !== stage)
  const cause = atZero ? 'Level' : 'mute'
  const part = stage === 'Clatter' ? 'hits' : 'notes'
  const text = [
    atZero ? `${stage}’s Level is at 0.` : `${stage} is muted.`,
    ...(where.includes(stage)
      ? [`Its meter still reads sound, so a bend leaks past the ${cause}.`]
      : []),
    ...players.map(
      to => `${to} still plays its ${part} over the ${viaOf(stage, to)}.`,
    ),
    ...(players.length > 0
      ? [`Turning ${players.join(' and ')} down silences them.`]
      : []),
  ].join(' ')
  const down = atZero ? 'Level 0' : 'muted'
  const label =
    players.length > 0
      ? `${down}, but ${players.join(' and ')} still plays it`
      : `${down}, but sound leaks through`
  return (
    <Tip text={text}>
      <span className={styles.heard} role="status" tabIndex={0}>
        {label}
      </span>
    </Tip>
  )
}

// The roll cap, and one ⋯ menu holding the kinds of roll and the face's own
// settings. Picking a kind rolls at once and stays on
// the face, so going again on it is one press. The first kind wears a shuffle
// mark, and the others their names.
function Rolls({
  group,
  seconds,
  more,
}: {
  group: Group
  seconds: number
  more?: ReactNode
}) {
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
        <button
          className={styles.face}
          aria-label={face.label}
          onClick={() => roll(face)}
        >
          {face === kinds[0] ? SHUFFLE : face.label}
        </button>
      </Tip>
      <Tip
        text={`Other ways to roll ${group.name} and undo the last roll${more ? ', this face’s settings' : ''}.`}
      >
        <button
          ref={setCaret}
          className={open ? styles.caretOn : styles.caret}
          aria-label={`more for ${group.name}`}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          ⋯
        </button>
      </Tip>
      {open && (
        <Menu
          anchor={split}
          toggle={caret}
          role={more ? 'group' : 'menu'}
          label={`${group.name} rolls and settings`}
          onClose={close}
        >
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
          {more && <div className={styles.more}>{more}</div>}
        </Menu>
      )}
    </span>
  )
}

// The bay wire's `+ mod` stays on the stage panel's Level row, out of the
// deck's width.
const deckSlider = (control: ControlKey) => ({
  ...sliderFor(control),
  lane: undefined,
})

export function FaceLevel({ control }: { control: ControlKey }) {
  return (
    <span className={styles.level}>
      <ControlSlider def={deckSlider(control)} />
    </span>
  )
}

export function DrawerSlider({ control }: { control: ControlKey }) {
  return (
    <div className={styles.drawerLevel}>
      <ControlSlider def={deckSlider(control)} />
    </div>
  )
}

// The caps on every instrument and pedal on the bench: mute or bypass, an
// instrument's level, the mic jacks on it, roll the stage somewhere new, and a
// close cap where the machine can be put away.
export function DeviceVerbs({
  stage,
  seconds = 0,
  onClose,
  noMute,
  noLevel,
  more,
}: {
  stage: string
  seconds?: number
  onClose?: () => void
  /** For a face that draws its own switch for it. */
  noMute?: boolean
  /** For a face that keeps its Level in a drawer. */
  noLevel?: boolean
  /** The face's own settings, drawn in the ⋯ menu. */
  more?: ReactNode
}) {
  const group = GROUPS.find(g => g.name === stage)
  if (!group) throw new Error(`no stage named ${stage}`)
  const mute = muteOf(stage)
  const level = levelOf(stage)
  return (
    <>
      {level && <StillHeard stage={stage} level={level} />}
      {mute && !noMute && <Mute stage={stage} control={mute} level={level} />}
      {level && !noLevel && <FaceLevel control={level} />}
      <MicCap stage={stage} />
      <Rolls group={group} seconds={seconds} more={more} />
      {onClose && (
        <Tip text={`Puts ${stage} away. Its sound stays on the board.`}>
          <button
            className={styles.cap}
            aria-label={`put away ${stage}`}
            onClick={onClose}
          >
            ×
          </button>
        </Tip>
      )}
    </>
  )
}
