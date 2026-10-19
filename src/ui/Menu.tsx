import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from '@floating-ui/react'
import {
  useCallback,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'

import styles from './Menu.module.css'

const KEY_STEP: Record<string, 1 | -1 | 'first' | 'last'> = {
  ArrowDown: 1,
  ArrowUp: -1,
  Home: 'first',
  End: 'last',
}

// A popover, for the reason the tip is one: it opens over the signal path,
// which scrolls and clips, and the top layer clears both without a portal to
// escape their overflow or a z-index to outbid them.
//
// The shell only — placing, dismissing, and where the keyboard lands, which on
// the way out is back on the toggle. What is in the menu is the caller's,
// because the two that have one are a way of rolling a board and a drawer of
// settings for a keybed, and they agree on nothing but the box.
export function Menu(props: {
  anchor: HTMLElement | null
  /** The control that opens it, whose presses are its own business: without
      this the menu shuts on the way down and the button opens it again on the
      way up, so a second press on it never closes anything. */
  toggle: HTMLElement | null
  /** A list of commands, or a drawer of settings that stay on after it shuts. */
  role: 'menu' | 'group'
  label?: string
  onClose: () => void
  children: ReactNode
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
        el.querySelector<HTMLElement>('button, input')?.focus()
      }
      refs.setFloating(el)
    },
    [refs],
  )

  // Escape, and a press anywhere else. Pointerdown rather than click, so the
  // press that dismisses the menu is not also a press on whatever it was
  // covering.
  const { onClose, toggle } = props
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: PointerEvent) => {
      const el = refs.floating.current
      const at = e.target instanceof Node ? e.target : null
      if (el && !el.contains(at) && toggle?.contains(at) !== true) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [onClose, toggle, refs])

  useEffect(
    () => () => {
      const at = document.activeElement
      if (at === null || at === document.body) toggle?.focus()
    },
    [toggle],
  )

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (props.role !== 'menu') return
    const step = KEY_STEP[e.key]
    if (step === undefined) return
    const items = [
      ...e.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [role="menuitem"]',
      ),
    ]
    if (items.length === 0) return
    e.preventDefault()
    const at = items.findIndex(el => el === document.activeElement)
    const to =
      step === 'first' ? 0 : step === 'last' ? items.length - 1 : at + step
    items[(to + items.length) % items.length]?.focus()
  }

  return (
    <div
      ref={setFloating}
      onKeyDown={onKeyDown}
      popover="manual"
      role={props.role}
      aria-label={props.label}
      className={styles.menu}
      style={floatingStyles}
    >
      {props.children}
    </div>
  )
}
