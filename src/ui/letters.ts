import type { NoteDest } from '../engine/messages'
import { createStore } from '../listeners'

// There are two keybeds on the panel and one computer keyboard in front of it,
// so the letters are a wire that goes to one of them. Which one is a switch on
// each deck rather than a modifier held down: a hand that has to hold something
// to play the other synthesiser is a hand that is not playing this one.
export const letterKeys = createStore<NoteDest>('toy')
