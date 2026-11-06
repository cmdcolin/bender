import { createStore } from '../listeners.ts'
import { read, write } from './persist.ts'

const SHOWN_KEY = 'bender.sourceMeters'

export const sourceMetersShown = createStore(read(SHOWN_KEY) === '1')

export function showSourceMeters(on: boolean) {
  sourceMetersShown.set(on)
  write(SHOWN_KEY, on ? '1' : '0')
}
