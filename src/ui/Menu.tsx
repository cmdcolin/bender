import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from '@floating-ui/react'
import { useCallback, useEffect, type ReactNode } from 'react'
import styles from './Menu.module.css'

// A popover, for the reason the tip is one: it opens over the signal path,
// which scrolls and clips, and the top layer clears both without a portal to
// escape their overflow or a z-index to outbid them.
//
// The shell only — placing, dismissing, and where the keyboard lands. What is
// in the menu is the caller's, because the two that have one are a way of
// rolling a board and a drawer of settings for a keybed, and they agree on
// nothing but the box.
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
      const at = e.target as Node
      if (el && !el.contains(at) && toggle?.contains(at) !== true) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [onClose, toggle, refs])

  return (
    <div
      ref={setFloating}
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

export const menuItem = (on: boolean) => (on ? styles.itemOn : styles.item)

/** A row that is a setting rather than a command, for a `group` drawer. */
export const menuCheck = styles.check
