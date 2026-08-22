import { afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { DEFAULT_CONTROLS } from '../controls'
import { EMPTY_HISTORY } from '../history'
import { engine } from '../engine/engine'

// What the panel needs under it that jsdom does not have, and a board back
// where it booted between tests. Imported for its hooks — `import './testDom'`
// is the whole of using it.
//
// The board itself already runs in node: it is a store and a table of numbers.
// The only thing between a test and the panel is the hardware the engine reaches
// for on the way up, and the two things the panel asks of a layout jsdom does
// not do. No audio starts here and nothing asks it to — what these tests are
// about is what the panel does with a board, which is the half with no sound in
// it.

// Enough of a context to get through boot: a module to load, a node to build,
// and somewhere to connect it. A context that threw instead would come back as
// an unhandled rejection out of autostart, which is a fault in the test rig
// arriving as a fault in the app.
class SilentContext {
  state = 'suspended'
  destination = {}
  audioWorklet = { addModule: async () => {} }
  onstatechange: (() => void) | null = null
  resume = async () => {}
  close = async () => {}
}

class SilentNode {
  port = { onmessage: null, postMessage() {} }
  connect() {}
  disconnect() {}
}

function stubAudio() {
  const g = globalThis as Record<string, unknown>
  g.AudioContext ??= SilentContext
  g.AudioWorkletNode ??= SilentNode
}

// The panel scrolls itself to the stage it just opened, and draws a scope and a
// body pad on canvas. jsdom has neither — and its own getContext warns, loudly
// and once per canvas, on the way to handing back the null we want anyway.
function stubLayout() {
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.scrollTo ??= () => {}
  HTMLCanvasElement.prototype.getContext = () => null
  // The drum grid hands a captured touch pointer straight back, so a finger
  // dragged across it reaches cells other than the one it landed on. jsdom has
  // pointer events and neither half of pointer capture.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
}

// The engine is a module singleton, so one test's turning is the next one's
// starting board unless it is put back. The switches beside the board go with
// it: a test that left the kit running is a test that renames the button the
// next one is looking for, and one that left a memory armed is a test that
// records the next one's keypresses.
function resetBoard() {
  engine.stopDrift()
  engine.stopHunt()
  engine.writeBoard({ ...DEFAULT_CONTROLS })
  engine.history.set(EMPTY_HISTORY)
  engine.setSongPlaying(false)
  engine.setDrumsPlaying(false)
  engine.drumRecord.set(false)
  engine.tuneRecord.set(false)
}

beforeAll(() => {
  stubAudio()
  stubLayout()
})

afterEach(() => {
  cleanup()
  resetBoard()
})
