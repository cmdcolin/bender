import { N_DRUM_VOICES, voiceBit } from '../drums.ts'
import { followsGate, voiceMask } from '../dsp/trigbus.ts'
import { engine } from '../engine/engine.ts'
import { KEY_RUNS, TRIGGER_CABLES } from './connections.ts'

// How long a wire stays lit after a kit hit: the same as a pad on the grid.
const FLASH_MS = 110

// The kit's bridges, by the wire the map draws them as and the control that
// picks the voice.
const BRIDGES = TRIGGER_CABLES.map(x => x.key)

// The gate line's runs, each live while a jumper at or beyond it is
// soldered and that machine is sounding a note.
const RUNS = KEY_RUNS.map(r => ({ ...r, notes: engine.notesOn[r.keybed] }))

/** Marks `data-live` on the map's wires that are carrying a trigger right now:
    a bridge while the kit voice it listens to is hitting, a run of the gate line
    while the toy keyboard and a machine downstream of it are both sounding.
    Writes to the DOM off each meter post, as the rail lamp does, because the
    map redraws on a slower clock than a hit lasts. Returns the unsubscribe. */
export function watchTriggers(root: HTMLElement): () => void {
  const hitAt = new Float64Array(N_DRUM_VOICES)
  let timer: ReturnType<typeof setTimeout> | undefined

  const paint = () => {
    clearTimeout(timer)
    const now = performance.now()
    const c = engine.controls.get()
    const live = new Set<string>()

    let struck = 0
    for (let v = 0; v < N_DRUM_VOICES; v++)
      if (now - hitAt[v]! < FLASH_MS) struck |= voiceBit(v)
    for (const key of BRIDGES)
      if (struck & voiceMask(Math.round(c[key]))) live.add(key)

    if (engine.chipNotes.get().size > 0) {
      const reaching = RUNS.map(
        r => followsGate(c[r.jumper]) && r.notes.get().size > 0,
      )
      for (const [i, { id }] of RUNS.entries())
        if (reaching.slice(i).some(Boolean)) live.add(id)
    }

    // Read off the DOM rather than remembered: a redraw hands a wire's element
    // to whichever wire now sits at its place in the tree.
    for (const el of root.querySelectorAll('[data-live]'))
      if (!live.has(el.getAttribute('data-wire') ?? ''))
        el.removeAttribute('data-live')
    for (const id of live)
      root.querySelector(`[data-wire="${id}"]`)?.setAttribute('data-live', '')
    if (struck !== 0) timer = setTimeout(paint, FLASH_MS)
  }

  const post = () => {
    const { hits } = engine.meter.get()
    if (hits !== 0) {
      const now = performance.now()
      for (let v = 0; v < N_DRUM_VOICES; v++)
        if (hits & voiceBit(v)) hitAt[v] = now
    }
    paint()
  }

  const offs = [
    engine.meter.subscribe(post),
    engine.chipNotes.subscribe(paint),
    ...RUNS.map(r => r.notes.subscribe(paint)),
  ]
  return () => {
    clearTimeout(timer)
    for (const off of offs) off()
  }
}
