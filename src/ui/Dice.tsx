import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from '@floating-ui/react'
import { useCallback, useEffect, useState } from 'react'
import { engine } from '../engine/engine'
import type { MorphSeconds } from './morph'
import { huntCandidates, randomLook, SCENARIOS } from './presets'
import { HelpDot, Tip } from './Tip'
import styles from './Dice.module.css'

// Every way the panel has of handing you a board you did not ask for, behind
// one button.
//
// They used to be a row of eight, and seven of the eight opened with the word
// "random" — one verb spelled out eight times, over two lines, above a signal
// path that wanted the height. Worse than the height: the row read as eight
// things to understand before you were allowed to press one, when the honest
// summary is that any of them hands you a board and the difference is only what
// it leans on.
//
// So: press it and get a board. The caret is where the leaning is chosen, and
// choosing rolls at once rather than arming something to press afterwards — the
// menu is a way of rolling, not a settings screen. What you chose stays on the
// face, so going again on a flavour you like is the same one press it was when
// each had its own button, which is the part a bare <select> would have taken
// away.
interface Roll {
  name: string
  label: string
  blurb: string
  /** a hunt is not a roll and does not return a board; it goes and finds one */
  run: (seconds: MorphSeconds, onLanded: (ok: boolean) => void) => void
}

const BLIND: Roll = {
  name: 'blind',
  label: 'random',
  blurb:
    'A board you have not heard: a random preset, nudged off itself. It replaces the circuit — your song, pattern and levels stay put.',
  run: seconds =>
    engine.morphTo(randomLook(engine.controls.get(), Math.random), seconds),
}

const HUNT: Roll = {
  name: 'hunt',
  label: 'hunt an edge',
  blurb:
    'Rolls six boards, plays each one, and keeps whichever came nearest running away — judged off the limiter, which is the only thing that can tell an edge from a board that is merely loud. A dialog says where it has got to, and is where you call it off.',
  run: (_seconds, onLanded) => {
    onLanded(false)
    void engine
      .hunt(huntCandidates(engine.controls.get(), Math.random))
      .then(best => onLanded(best !== null))
  },
}

const ROLLS: Roll[] = [
  BLIND,
  ...SCENARIOS.map(s => ({
    name: s.name,
    label: s.label,
    blurb: s.blurb,
    run: (seconds: MorphSeconds) =>
      engine.morphTo(s.roll(engine.controls.get(), Math.random), seconds),
  })),
  HUNT,
]

export function Dice(props: {
  seconds: MorphSeconds
  onLanded: (ok: boolean) => void
}) {
  const [held, setHeld] = useState<Roll>(BLIND)
  const [open, setOpen] = useState(false)
  // Held in state rather than a ref: the menu takes the element it hangs off as
  // a prop, and a ref read while rendering is whatever it was last commit — on
  // the render that opens the menu that is null, and a menu with no anchor is a
  // menu in the top left corner of the window.
  const [split, setSplit] = useState<HTMLSpanElement | null>(null)
  const { seconds, onLanded } = props

  const roll = useCallback(
    (r: Roll) => {
      setHeld(r)
      r.run(seconds, onLanded)
    },
    [seconds, onLanded],
  )

  const close = useCallback(() => setOpen(false), [])

  return (
    <span className={styles.split} ref={setSplit}>
      <Tip text={held.blurb}>
        <button className={styles.face} onClick={() => roll(held)}>
          {held.label}
        </button>
      </Tip>
      <Tip text="The other ways the board has of rolling you one. Picking one rolls it, and it stays on the button, so going again is one press.">
        <button
          className={open ? styles.caretOn : styles.caret}
          aria-label="pick a kind of roll"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          ▾
        </button>
      </Tip>
      <HelpDot text={held.blurb} label={held.label} />
      {open && (
        <Menu
          anchor={split}
          held={held}
          onPick={r => {
            close()
            roll(r)
          }}
          onClose={close}
        />
      )}
    </span>
  )
}

// A popover, for the reason the tip is one: it opens over the signal path,
// which scrolls and clips, and the top layer clears both without a portal to
// escape their overflow or a z-index to outbid them.
function Menu(props: {
  anchor: HTMLElement | null
  held: Roll
  onPick: (r: Roll) => void
  onClose: () => void
}) {
  const { refs, floatingStyles } = useFloating({
    open: true,
    elements: { reference: props.anchor },
    placement: 'bottom-start',
    strategy: 'fixed',
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })

  // Shown from the ref rather than an effect, like the tip's bubble: a popover
  // that is not open is display:none, and floating-ui would measure a box of
  // nothing. The focus goes with it, so the keyboard is already in the menu it
  // just asked for.
  const setFloating = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        el.showPopover()
        el.querySelector('button')?.focus()
      }
      refs.setFloating(el)
    },
    [refs],
  )

  // Escape, and a press anywhere else. Pointerdown rather than click, so the
  // press that dismisses the menu is not also a press on whatever it was
  // covering.
  const { onClose } = props
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: PointerEvent) => {
      const el = refs.floating.current
      if (el && !el.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [onClose, refs])

  return (
    <div
      ref={setFloating}
      popover="manual"
      role="menu"
      className={styles.menu}
      style={floatingStyles}
    >
      {ROLLS.map(r => (
        <Tip key={r.name} text={r.blurb}>
          <button
            role="menuitem"
            className={r === props.held ? styles.itemOn : styles.item}
            onClick={() => props.onPick(r)}
          >
            {r.label}
          </button>
        </Tip>
      ))}
    </div>
  )
}
