import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'

import { engine } from '../engine/engine.ts'
import { NOTE_NAMES, semitoneName } from '../notes.ts'
import { SCALE_NAMES, snap } from '../scale.ts'
import { useControlValue, useStoreValue } from './ControlsContext.ts'
import { DeviceVerbs, DrawerSlider } from './DeviceVerbs.tsx'
import { FaceBadge } from './FaceBadge.tsx'
import { isTyping } from './isTyping.ts'
import styles from './Keybed.module.css'
import {
  blackAbove,
  MIN_KEY,
  OCTAVES,
  OCTAVES_DRAWN,
  octavesFor,
  pitch,
  topKey,
  whiteKeys,
} from './keyboard.ts'
import { keymap, noteKeys, octaveKeys, remapOpen } from './keymap.ts'
import { claimPress, claimRelease } from './keyPress.ts'
import { letterKeys } from './letters.ts'
import { useCoarse, useWidth } from './measure.ts'
import { menuCheck, menuItem } from './menuItems.ts'
import { levelOf } from './stageLevels.ts'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'
import type { NoteDest } from '../engine/messages.ts'
import type { Store } from '../listeners.ts'

// The machines with keys on them, and the two stores each one reports through:
// what a hand is holding down on that bed, and what the chip behind it is
// sounding on its own. One component draws every bed, so the wiring is a table.
const DECK = {
  toy: { down: engine.keysDown, notes: engine.chipNotes },
  fm: { down: engine.fmKeysDown, notes: engine.fmNotes },
  pcm: { down: engine.pcmKeysDown, notes: engine.pcmNotes },
  mono: { down: engine.monoKeysDown, notes: engine.monoNotes },
} satisfies Record<NoteDest, unknown>

// There is one computer keyboard in front of the panel and several beds on it,
// so switching the letters off here switches them on somewhere. The toy is the
// only bed always drawn — the others appear when their fader comes up — so the
// letters go back to it, and from the toy they go on to the FM chip.
const NEXT_BED: Record<NoteDest, NoteDest> = {
  toy: 'fm',
  fm: 'toy',
  pcm: 'toy',
  mono: 'toy',
}

// Below this many pixels of bed, the Level slider moves into the ⋯ menu and the
// deck keeps two rows.
const ROOMY_DECK = 560

const GATE_SOURCE = 'Plinky'

/** The jumper off the toy's gate line, which every bed but the toy's carries. Same
    switch, same two states, and the words are the caller's because the machine
    on the other end of the wire is what they are about. The label names the
    source by the name printed on its badge, Plinky.

    The lamp in the button has three states: hollow with the jumper cut, dim with
    it soldered, and lit while the toy is sounding a note and this machine is
    sounding one too. */
export function GateJumper({
  control,
  notes,
  cut: cutClass,
  soldered,
  cutTip,
  solderedTip,
}: {
  control: ControlKey
  /** What this machine is sounding, which includes the toy's notes with the jumper on. */
  notes: Store<ReadonlySet<number>>
  cut?: string
  soldered?: string
  cutTip: string
  solderedTip: string
}) {
  const cut = useControlValue(control) > 0.5
  const toySounding = useStoreValue(engine.chipNotes).size > 0
  const sounding = useStoreValue(notes).size > 0
  const lamp = cut ? 'off' : toySounding && sounding ? 'sounding' : 'wired'
  return (
    <Tip
      text={`${cut ? cutTip : solderedTip}. The lamp lights while ${GATE_SOURCE}’s notes are reaching it.`}
    >
      <button
        className={cut ? cutClass : soldered}
        aria-pressed={!cut}
        aria-label={cut ? 'own keys only' : `with ${GATE_SOURCE}`}
        onClick={() => {
          engine.armStep()
          engine.set(control, cut ? 0 : 1)
        }}
      >
        <span className={styles.gateLamp} data-lamp={lamp} aria-hidden="true" />
        <span className={styles.gateLong}>
          {cut ? 'own keys only' : `with ${GATE_SOURCE}`}
        </span>
        <span className={styles.gateShort}>{cut ? 'own' : 'toy'}</span>
      </button>
    </Tip>
  )
}

// Who is holding a key down, and so what colour it is.
type Lit = 'hand' | 'chip' | 'dark'

const KEY_CLASS = {
  white: { dark: styles.white, hand: styles.whiteOn, chip: styles.whiteChip },
  black: { dark: styles.black, hand: styles.blackOn, chip: styles.blackChip },
}

interface Props {
  /** Which synthesiser this bed's keys are wired to. */
  dest: NoteDest
  /** What the bed is called, for anything reading the page rather than looking
      at it: two keybeds drawn the same way are two lists of identical keys. */
  label: string
  /** The case, for a board that is not moulded plastic. */
  caseClass?: string
  /** What the deck carries besides the switches: a badge, a speaker, a lamp. */
  badge?: ReactNode
  /** Switches that belong to this machine, ahead of the ones every bed has. */
  extras?: ReactNode
  tail?: ReactNode
  /** The stage whose mute, level, roll and close caps end the deck. */
  stage?: string
  seconds?: number
  onClose?: () => void
  /** Opens the stage's panel; the badge becomes the button for it. */
  onOpen?: (stage: string) => void
}

// A keybed: clickable, and the computer's letter keys wherever they are wired.
// Hold latches what you press, so both hands are free for the panel.
export function Keybed({
  dest,
  label,
  caseClass,
  badge,
  extras,
  tail,
  stage,
  seconds,
  onClose,
  onOpen,
}: Props) {
  // What was sent, not which key was pressed: the octave moves under your hand
  // and a note has to be let go at the pitch it went down at.
  const held = useRef(new Set<number>())
  const [touching, setTouching] = useState<ReadonlySet<number>>(new Set())
  const track = (semitone: number, down: boolean) => {
    if (down) held.current.add(semitone)
    else held.current.delete(semitone)
    setTouching(new Set(held.current))
  }
  // Notes alt-click has pinned down, one at a time. The hold switch latches
  // everything you touch after it; this holds a drone under both hands while the
  // rest of the board still plays and lets go the way keys normally do.
  const latched = useRef(new Set<number>())
  const [hold, setHold] = useState(false)
  const [octave, setOctave] = useState(0)
  // How much keyboard there is room for, measured off the bed itself. A phone
  // held upright, or a window pulled in until the panel has taken most of it,
  // gets a shorter board rather than three octaves of key too thin to hit — and
  // the octave switch, which was always how you reached past the drawn keys,
  // becomes the way you reach the two octaves that are no longer drawn.
  const [bed, setBed] = useState<HTMLDivElement | null>(null)
  const width = useWidth(bed)
  const coarse = useCoarse()
  const drawn =
    width === undefined
      ? OCTAVES_DRAWN
      : octavesFor(width, coarse ? MIN_KEY.coarse : MIN_KEY.fine)
  const short = drawn < OCTAVES_DRAWN
  const level = stage === undefined ? undefined : levelOf(stage)
  const levelInDrawer =
    level !== undefined && width !== undefined && width < ROOMY_DECK
  const top = topKey(drawn)
  const shift = octave * 12
  const at = (key: number) => pitch(key, shift)
  // Two lights on one board. What a hand is holding down — this one's pointer,
  // the letter keys, a controller — and what the chip is sounding on its own,
  // which for the toy is the ROM's tune and the backing under it, and for the
  // other two is the toy's gate and the kit's trigger lines. Your own notes are
  // in both, a meter apart, so yours wins and the chip's is what is left.
  const keysDown = useStoreValue(DECK[dest].down)
  const chipNotes = useStoreValue(DECK[dest].notes)
  const owns = useStoreValue(letterKeys) === dest
  const keyScale = useControlValue('keyScale')
  const keyRoot = useControlValue('keyRoot')
  const outside = (semitone: number) =>
    snap(semitone, keyScale, keyRoot) !== semitone
  // Whether there are letter keys worth telling anybody about. A phone has a
  // keyboard only when something asks it for text, so the letters printed on
  // the keys, the drawer that says which bed they play and the reminders in the
  // tips are all hints at a thing that is not there — and the keys they were
  // printed on are the ones a finger needs the room of.
  const letters = owns && !coarse
  const map = useStoreValue(keymap)
  const noteLetters = noteKeys(map)
  const octaveLetters = octaveKeys(map)
  const other = NEXT_BED[dest]
  const isDown = (key: number) => held.current.has(at(key))
  const touched = (semitone: number) =>
    touching.has(semitone) && engine.isStruck(semitone, dest)
  const litBy = (key: number): Lit =>
    keysDown.has(at(key)) || touched(at(key))
      ? 'hand'
      : chipNotes.has(at(key))
        ? 'chip'
        : 'dark'
  // A keybed reaches further than three octaves, and so does the tune when the
  // clock bend drags it off the board. A note played past either end would
  // otherwise light nothing at all and read as a dead wire.
  const playing = [...keysDown, ...chipNotes]
  const below = playing.some(s => s < at(0))
  const above = playing.some(s => s > at(top))

  // Whether letting go of a key lets go of the note.
  const sticky = (semitone: number) => hold || latched.current.has(semitone)

  const press = (key: number, latch = false) => {
    const semitone = at(key)
    // A press on a note already pinned down, by the hold switch or by alt, lets
    // it go. The engine knows what is down: panic clears the board underneath
    // this component, and a dark key should strike.
    const down = engine.isStruck(semitone, dest)
    if (down && (latch || sticky(semitone))) {
      release(key, true)
      return
    }
    if (down && held.current.has(semitone)) return
    engine.noteOn(semitone, 1, dest)
    track(semitone, true)
    if (latch) latched.current.add(semitone)
  }

  const release = (key: number, force = false) => {
    const semitone = at(key)
    if (!force && sticky(semitone)) return
    engine.noteOff(semitone, dest)
    track(semitone, false)
    latched.current.delete(semitone)
  }

  const releaseAll = () => {
    for (const semitone of held.current) engine.noteOff(semitone, dest)
    held.current.clear()
    latched.current.clear()
    setTouching(new Set())
  }

  // What a hand was holding, when the hand goes away: the window loses focus
  // mid-press and the key-up lands wherever the focus went, so without this a
  // note is held for ever by a key nobody is pressing any more. What was pinned
  // down on purpose stays down — that is what pinning it was for.
  const releaseLoose = () => {
    for (const semitone of held.current) {
      if (sticky(semitone)) continue
      engine.noteOff(semitone, dest)
      track(semitone, false)
    }
  }

  // Whatever is down went down at the old octave, and nothing is going to let go
  // of it once the keys have moved out from under it.
  const shiftTo = (next: number) => {
    releaseAll()
    setOctave(next)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (
      !owns ||
      e.repeat ||
      e.metaKey ||
      e.ctrlKey ||
      e.altKey ||
      isTyping(e.target)
    )
      return
    const pressed = e.key.toLowerCase()
    const step =
      pressed === octaveLetters.down ? -1 : pressed === octaveLetters.up ? 1 : 0
    if (step !== 0) {
      const next = octave + step
      if (OCTAVES.includes(next)) shiftTo(next)
      return
    }
    const note = noteLetters.indexOf(pressed)
    if (note >= 0) press(note)
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (!owns) return
    const note = noteLetters.indexOf(e.key.toLowerCase())
    if (note >= 0) release(note)
  }

  const latest = useRef({ onKeyDown, onKeyUp, releaseLoose })
  // oxlint-disable-next-line react/refs -- the window listeners read this render's handlers through this ref
  latest.current = { onKeyDown, onKeyUp, releaseLoose }

  useEffect(() => {
    const down = (e: KeyboardEvent) => latest.current.onKeyDown(e)
    const up = (e: KeyboardEvent) => latest.current.onKeyUp(e)
    const blur = () => latest.current.releaseLoose()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [latest])

  useEffect(() => {
    const notes = held.current
    return () => {
      for (const semitone of notes) engine.noteOff(semitone, dest)
      notes.clear()
    }
  }, [dest, held])

  // The letters go to one bed at a time, and what this one is holding goes with
  // them: a note struck by a letter key whose wire has just moved has nothing
  // left that can let it go.
  useEffect(() => {
    if (!owns) latest.current.releaseLoose()
  }, [owns, latest])

  // A hand dragged across three octaves plays what it crosses. The capture a
  // touch hands to the key it started on would otherwise keep every event there,
  // so a glissando would come out as one note held down.
  const grab = (note: number) => (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    press(note, e.altKey)
  }
  const slideInto = (note: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.buttons && !hold) press(note)
  }
  // A pointer taken away rather than lifted: a window manager claiming alt-drag
  // to move the window, a touch turning into a scroll, the system stepping in.
  // No pointer-up follows any of them, so this is the last word on the note.
  const cancel = (note: number) => () => release(note)

  // The octave switch steps one octave at a time, with the note the bottom key
  // plays between its two caps. A cap at the end of its travel goes dead and
  // stays put, so the switch keeps its shape wherever the board stands.
  const stepper = (delta: number, way: string, mark: string) => (
    <Tip
      text={`move the whole board one octave ${way}${letters ? ` — ${delta < 0 ? octaveLetters.down : octaveLetters.up} does the same` : ''}`}
    >
      <button
        className={styles.octave}
        aria-label={`octave ${way}`}
        disabled={!OCTAVES.includes(octave + delta)}
        onClick={() => shiftTo(octave + delta)}
      >
        {mark}
      </button>
    </Tip>
  )

  const settings =
    coarse && !levelInDrawer ? undefined : (
      <>
        {!coarse && (
          <>
            <Tip
              text={
                owns
                  ? `the computer keyboard is wired to this bed — ${noteLetters.slice(0, 4).join(' ')} play it, ${octaveLetters.down} and ${octaveLetters.up} move the octave. Turning it off hands the letters back to the toy, because there is one keyboard and it has to play one of them`
                  : `wire the computer keyboard to this bed: ${noteLetters.slice(0, 4).join(' ')} play it, ${octaveLetters.down} and ${octaveLetters.up} move the octave. There is one keyboard in front of the panel and several beds on it, so it plays whichever is switched on`
              }
            >
              <label className={menuCheck}>
                <input
                  type="checkbox"
                  checked={owns}
                  onChange={() => letterKeys.set(owns ? other : dest)}
                />
                computer keyboard plays this bed
              </label>
            </Tip>
            <Tip text="Choose which computer key plays each note, moves the octave or throws a bend.">
              <button
                className={menuItem(false)}
                onClick={() => remapOpen.set(true)}
              >
                remap keys…
              </button>
            </Tip>
          </>
        )}
        {levelInDrawer && <DrawerSlider control={level} />}
      </>
    )

  const key = (note: number, black: boolean) => {
    const lit = litBy(note)
    const off = lit === 'dark' && outside(at(note))
    return (
      <button
        className={`${KEY_CLASS[black ? 'black' : 'white'][lit]} ${off ? (black ? styles.outsideBlack : styles.outsideWhite) : ''}`}
        aria-label={`key ${semitoneName(at(note))}`}
        aria-pressed={lit !== 'dark'}
        onPointerDown={e => {
          if (black) e.stopPropagation()
          grab(note)(e)
        }}
        onPointerEnter={slideInto(note)}
        onPointerUp={() => release(note)}
        onPointerLeave={() => isDown(note) && release(note)}
        onPointerCancel={cancel(note)}
        onKeyDown={e => claimPress(e) && press(note, e.altKey)}
        onKeyUp={e => claimRelease(e) && release(note)}
      >
        {letters && noteLetters[note] && (
          <span className={black ? styles.blackLetter : styles.letter}>
            {noteLetters[note]}
          </span>
        )}
      </button>
    )
  }

  return (
    <div
      className={`${styles.body} ${short ? styles.short : ''} ${caseClass ?? ''}`}
      role="group"
      aria-label={label}
    >
      <div className={styles.deck}>
        <FaceBadge className={styles.badge} stage={stage} onOpen={onOpen}>
          {badge}
        </FaceBadge>
        <div className={styles.switches}>
          {extras}
          {keyScale > 0 && (
            <Tip text="Key lock is on: a key off the scale plays the nearest note of it, so the dimmed keys sound as their neighbours. The lock is under arp and key lock.">
              <span className={styles.lock}>
                {NOTE_NAMES[Math.round(keyRoot)]}{' '}
                {SCALE_NAMES[Math.round(keyScale)]}
              </span>
            </Tip>
          )}
          <Tip text="Latch keys on — press a held key again to let it go. Alt-click a single key to pin just that one down.">
            <button
              className={hold ? styles.holdOn : styles.hold}
              aria-pressed={hold}
              onClick={() => {
                if (hold) releaseAll()
                setHold(!hold)
              }}
            >
              hold
            </button>
          </Tip>
          <span className={styles.octaves}>
            {stepper(-1, 'down', '◂')}
            <Tip text="where the board is standing: the note its bottom key plays. The two switches beside it move the board an octave at a time.">
              <span className={styles.standing}>{semitoneName(at(0))}</span>
            </Tip>
            {stepper(1, 'up', '▸')}
          </span>
          {tail}
          {stage !== undefined && (
            <DeviceVerbs
              stage={stage}
              seconds={seconds}
              onClose={onClose}
              noLevel={levelInDrawer}
              more={settings}
            />
          )}
        </div>
      </div>
      <div className={styles.keys} ref={setBed}>
        {below && <span className={styles.offLow}>◂</span>}
        {above && <span className={styles.offHigh}>▸</span>}
        {whiteKeys(drawn).map(note => {
          const black = blackAbove(note, top)
          return (
            <div key={note} className={styles.whiteWrap}>
              {key(note, false)}
              {black !== undefined && key(black, true)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
