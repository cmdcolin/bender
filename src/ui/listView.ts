import { createStore } from '../listeners.ts'
import { read, write } from './persist.ts'

export const VIEWS = ['diagram', 'all settings'] as const

const KEY = 'bender.listView'

/** Whether the panel lists every stage's sliders in place of the signal path
    drawing and its close-ups. */
export const listView = createStore(read(KEY) === '1')

export function setListView(on: boolean) {
  listView.set(on)
  write(KEY, on ? '1' : '0')
}
