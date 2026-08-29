import { afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { DEFAULT_CONTROLS } from '../controls'
import { EMPTY_HISTORY } from '../history'
import { engine } from '../engine/engine'
import { letterKeys } from './letters'

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
class SilentGainNode {
  gain = {
    cancelScheduledValues() {},
    setValueAtTime() {},
    linearRampToValueAtTime() {},
  }
  connect(dest: any) {
    return dest
  }
  disconnect() {}
}

class SilentContext {
  state = 'suspended'
  currentTime = 0
  destination = {}
  audioWorklet = { addModule: async () => {} }
  onstatechange: (() => void) | null = null
  resume = async () => {}
  close = async () => {}
  createGain() {
    return new SilentGainNode()
  }
}

class SilentNode {
  port = { onmessage: null, postMessage() {} }
  connect(dest: any) {
    return dest
  }
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
  // Anything the panel opens over the signal path — a tip, the roll menu — is a
  // popover, so the top layer clears the path's own scrolling and clipping
  // without a portal to escape them or a z-index to outbid them. jsdom has the
  // `display: none` half of that (its stylesheet hides every [popover]) and
  // neither the top layer nor the calls that promote an element into it, so
  // without this an opened menu is in the document and inaccessible to every
  // query that respects what a screen reader would see.
  //
  // Setting display is what stands in for `:popover-open`, which is the state
  // jsdom cannot hold. Nothing here wants the top layer itself: what a test
  // asks of an open popover is that it is on screen with its buttons reachable.
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    this.style.display = 'block'
  }
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    this.style.display = ''
  }
  // And <dialog>, of which jsdom has the element and none of the three calls
  // that open or shut one. The panel opens two: the hunt takes the board for
  // the eight seconds it runs and is modal for it, and the midi card is shown
  // rather than modal so the stage behind it stays reachable. Only `open`
  // separates them here — the top layer and the inertness a modal puts on the
  // rest of the page are things jsdom has no notion of either way.
  HTMLDialogElement.prototype.show = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
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
  letterKeys.set('toy')
  // A test that left a key down is a test that hands the next one a note it
  // never played, and the beds light off these.
  engine.keysDown.set(new Set())
  engine.fmKeysDown.set(new Set())
}

beforeAll(() => {
  stubAudio()
  stubLayout()
})

afterEach(() => {
  cleanup()
  resetBoard()
})
