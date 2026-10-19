import { createStore } from '../listeners.ts'

/** Whether a file is over the app, which the whole window takes as a drop onto
    the tape loop. */
export const dragging = createStore(false)
