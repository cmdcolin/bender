import { createStore } from '../listeners.ts'
import { useStoreValue } from './ControlsContext.ts'
import styles from './openStage.module.css'

/** The stage open in the panel, which its face on the bench lights up for. */
export const openStage = createStore<string | null>(null)

export const useOpenFace = (stage: string): string =>
  useStoreValue(openStage) === stage ? (styles.open ?? '') : ''
