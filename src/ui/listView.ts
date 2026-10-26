import { createStore } from '../listeners.ts'
import { read, write } from './persist.ts'

export const VIEWS = ['diagram', 'all settings'] as const

export const PANEL_VIEWS = ['map', 'every stage'] as const

const KEY = 'bender.listView'

/** Whether the panel lists every stage's sliders in place of the signal path
    drawing and its close-ups. */
export const listView = createStore(read(KEY) === '1')

export function setListView(on: boolean) {
  listView.set(on)
  write(KEY, on ? '1' : '0')
}

const DRAWINGS_KEY = 'bender.stageDrawings'

/** Whether an opened stage starts on its drawing. Off by default, so a first
    look at a stage shows plain sliders. */
export const stageDrawings = createStore(read(DRAWINGS_KEY) === '1')

export function setStageDrawings(on: boolean) {
  stageDrawings.set(on)
  write(DRAWINGS_KEY, on ? '1' : '0')
}
