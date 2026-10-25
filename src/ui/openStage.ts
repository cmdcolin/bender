import { engine } from '../engine/engine.ts'
import { createStore } from '../listeners.ts'
import { useStoreValue } from './ControlsContext.ts'
import { shownOn } from './fitted.ts'
import styles from './openStage.module.css'
import { readSession, writeSession } from './persist.ts'

const KEY = 'bender.openStage'

export const openStage = createStore<string | null>(readSession(KEY) || null)
openStage.subscribe(() => writeSession(KEY, openStage.get() ?? ''))

export function forgetStaleStage() {
  const name = openStage.get()
  if (name && !shownOn(engine.controls.get()).has(name)) openStage.set(null)
}

export const useOpenFace = (stage: string): string =>
  useStoreValue(openStage) === stage ? (styles.open ?? '') : ''
