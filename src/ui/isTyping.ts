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
