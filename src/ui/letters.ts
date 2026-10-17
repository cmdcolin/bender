import { createStore } from '../listeners.ts'

import type { NoteDest } from '../engine/messages.ts'

/** Where the letter keys go: one of the keybeds, or the bend keys. */
export type LetterDest = NoteDest | 'bends'

// There are several keybeds on the panel and one computer keyboard in front of
// it, so the letters are a wire that goes to one of them. Which one is a switch
// on each deck rather than a modifier held down: a hand that has to hold
// something to play the other synthesiser is a hand that is not playing this
// one. The bend keys are a fourth place the wire can go, for a hand that wants
// the letters throwing the board around rather than playing notes.
export const letterKeys = createStore<LetterDest>('toy')
