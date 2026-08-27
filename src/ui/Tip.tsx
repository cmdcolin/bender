import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from '@floating-ui/react'
import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import styles from './Tip.module.css'

// The panel explains itself in sentences, and the browser's own tooltip is the
// wrong shape for a sentence: it truncates the long ones, wraps where it likes,
// takes a second to appear, never comes back for a keyboard, and cannot be
// styled or read while the pointer is on the move. This is the same idea with
// the box under our own control — floating-ui does the placing, so a tip on a
// slider at the bottom of the panel flips above the pointer instead of off the
// window.
//
// Wrap the element the tip belongs to:
//
//   <Tip text="What this does."><button …>roll</button></Tip>
//
// The child keeps its own handlers, its own ref and its own layout box — the
// wrapper adds no element of its own, so a tip on a flex child stays a flex
// child.
const DELAY_MS = 350

// What the wrapper puts back on the child. Handlers take `never` because this
// only chains them: their real event type is the child's business, and a
// parameter of `never` accepts whichever one the child wrote.
type Anchor = ReactElement<{
  ref?: unknown
  'aria-describedby'?: string
  onPointerEnter?: (e: never) => void
  onPointerLeave?: (e: never) => void
  onPointerDown?: (e: never) => void
  onFocus?: (e: never) => void
  onBlur?: (e: never) => void
}>

// A row carries a tip and so do the controls sitting in it. Only the innermost
// one should be up: an outer tip hides as the pointer arms an inner one, and
// arms again when it leaves — which, on the way out of the row entirely, the
// row's own leave then cancels.
interface Nested {
  hide: () => void
  arm: () => void
}

const NestedTip = createContext<Nested | null>(null)

export function Tip(props: { text: ReactNode; children: Anchor }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef(0)
  const outer = useContext(NestedTip)
  const id = useId()

  const self = useMemo<Nested>(
    () => ({
      arm: () => {
        clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setOpen(true), DELAY_MS)
      },
      hide: () => {
        clearTimeout(timer.current)
        setOpen(false)
      },
    }),
    [],
  )

  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') self.hide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, self])

  const child = props.children
  // Held across renders: a fresh ref callback would have React drop and retake
  // the element every time, which for the drum grid is a hundred and twenty of
  // them on every tick of the playhead.
  const setRef = useMemo(
    () => mergeRefs(child.props.ref, setAnchor),
    [child.props.ref],
  )

  return (
    <NestedTip.Provider value={self}>
      {cloneElement(child, {
        ref: setRef,
        'aria-describedby': open ? id : child.props['aria-describedby'],
        // Touch is left alone: every tip here sits on something you press or
        // drag, and a finger has no way to hover one without doing that.
        onPointerEnter: chain(child.props.onPointerEnter, () => {
          outer?.hide()
          self.arm()
        }),
        onPointerLeave: chain(child.props.onPointerLeave, () => {
          self.hide()
          outer?.arm()
        }),
        // Pressing is the answer to "what does this do", so the tip gets out of
        // the way rather than sitting over what the press just changed.
        onPointerDown: chain(child.props.onPointerDown, () => {
          self.hide()
          outer?.hide()
        }),
        // Keyboard focus gets what the pointer gets, which the browser's
        // tooltip never gave it. `:focus-visible` keeps a click that also
        // focuses from leaving one up after the pointer has gone.
        onFocus: chain(child.props.onFocus, () => {
          if (anchor?.matches(':focus-visible') === true) setOpen(true)
        }),
        onBlur: chain(child.props.onBlur, () => self.hide()),
      })}
      {open && anchor !== null && (
        <Bubble anchor={anchor} id={id} text={props.text} />
      )}
    </NestedTip.Provider>
  )
}

// Split out so an idle tip costs a state hook and nothing else: the drum grid
// alone holds a hundred and twenty of them, and floating-ui's measuring and
// autoUpdate listeners only start once one is actually up.
//
// It shows as a popover, which puts it in the top layer — above the panel, the
// open stage and anything that ever grows a stacking context, without a portal
// to escape their overflow or a z-index to outbid them. A manual popover at
// that: closing is this component unmounting, not a click landing somewhere.
// The `fixed` strategy is what the top layer positions against.
function Bubble(props: { anchor: HTMLElement; id: string; text: ReactNode }) {
  const { refs, floatingStyles } = useFloating({
    open: true,
    elements: { reference: props.anchor },
    placement: 'top',
    strategy: 'fixed',
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  // Shown from the ref rather than an effect: a popover that is not open is
  // display:none, and floating-ui measures a box of nothing. Held across
  // renders for the same reason the anchor's ref is — an inline one is a fresh
  // ref every render, and every render here is floating-ui landing a measured
  // position, so the bubble would hand itself back and forth and tear down and
  // rebuild autoUpdate's observers each time round.
  const setFloating = useCallback(
    (el: HTMLElement | null) => {
      el?.showPopover()
      refs.setFloating(el)
    },
    [refs],
  )
  return (
    <div
      ref={setFloating}
      popover="manual"
      id={props.id}
      role="tooltip"
      className={styles.tip}
      style={floatingStyles}
    >
      {props.text}
    </div>
  )
}

// The child's own handler runs first and ours after it, so a tip never stands
// between a control and the press it was waiting for.
function chain(theirs: ((e: never) => void) | undefined, mine: () => void) {
  return (e: never) => {
    theirs?.(e)
    mine()
  }
}

// The child may have wanted its own ref, and taking one away to place a tip
// would be a strange thing for a tip to do.
function mergeRefs(theirs: unknown, mine: (el: HTMLElement | null) => void) {
  return (el: HTMLElement | null) => {
    mine(el)
    if (typeof theirs === 'function') theirs(el)
    else if (theirs !== null && typeof theirs === 'object')
      (theirs as { current: HTMLElement | null }).current = el
  }
}

// The tip answers "what is this", but only for someone who already suspects the
// panel will answer. Hovering is invisible until you have done it: a first-timer
// looking at panic sees a red button with a bar creeping up it and no sign that
// the board has a sentence about either. The dot is that sign — the one part of
// a tip you can see before you have found it.
//
// It sits next to the things whose name is not the explanation, not next to
// everything: a dot on every row of a panel this dense is a texture rather than
// a mark, and a mark nobody picks out is the same as no mark at all.
//
// Pressing it pins the tip up, which hovering cannot do. That is for reading
// without holding the pointer still, and it is the only way a finger gets help
// at all — every other tip here hangs off a hover no touch device has.
export function HelpDot(props: { text: ReactNode; label: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const outer = useContext(NestedTip)
  const id = useId()
  const up = open || hover

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // Anywhere else puts it away. The bubble takes no pointer events, so a
    // press that lands on the tip itself is a press on whatever is under it.
    const onDown = (e: PointerEvent) => {
      if (!anchor?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open, anchor])

  return (
    <button
      ref={setAnchor}
      type="button"
      className={up ? styles.dotOn : styles.dot}
      aria-label={`what ${props.label} does`}
      aria-expanded={open}
      aria-describedby={up ? id : undefined}
      onClick={() => setOpen(o => !o)}
      onPointerEnter={() => {
        outer?.hide()
        setHover(true)
      }}
      onPointerLeave={() => {
        setHover(false)
        if (!open) outer?.arm()
      }}
      onFocus={() => setHover(true)}
      onBlur={() => {
        setHover(false)
        setOpen(false)
      }}
    >
      ?
      {up && anchor !== null && (
        <Bubble anchor={anchor} id={id} text={props.text} />
      )}
    </button>
  )
}
