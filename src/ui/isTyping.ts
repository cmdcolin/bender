// Where a keypress belongs to the control rather than to the board. A range
// input keeps focus after a drag ends, so it must not count as typing or a
// slider would swallow every shortcut key until focus moves elsewhere.
const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target instanceof HTMLInputElement && target.type === 'range')
    return false
  return TYPING.has(target.tagName)
}

const PRESSABLE = 'button, summary, [role=button], [role=menuitem]'

/** Whether Space presses a control the keyboard focused. A pointer press also
    focuses a button, but without a focus ring, and leaves Space to the run
    line. */
export const pressesSpace = (target: EventTarget | null) =>
  target instanceof Element &&
  target.matches(PRESSABLE) &&
  target.matches(':focus-visible')
