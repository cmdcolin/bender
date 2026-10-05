import { engine } from '../engine/engine'
import { createStore } from '../listeners'
import { padId, type PadBinding } from './pads'
import { omit, parseMap, read, write } from './persist'
import { THROWS } from './throws'

export type ThrowPadMap = Partial<Record<string, PadBinding>>

const THROW_PADS_KEY = 'bender.midi.throwpads'

const throwNamed = (name: string) => THROWS.find(t => t.name === name) ?? null

export const parseThrowPads = (raw: string | null): ThrowPadMap =>
  parseMap(
    raw,
    name => throwNamed(name)?.name ?? null,
    stored => {
      const { channel, note } = stored as Partial<PadBinding>
      return typeof channel === 'number' && typeof note === 'number'
        ? { channel, note }
        : null
    },
  )

// A pad held down holds its throw, and lifting it springs the board back, the
// way the hold row's buttons and keys do. A pad binds to one throw at a time.
export class ThrowPads {
  readonly bindings = createStore<ThrowPadMap>(
    parseThrowPads(read(THROW_PADS_KEY)),
  )
  readonly armed = createStore<string | null>(null)

  private throwByPad = new Map<string, string>()

  constructor() {
    this.reindex()
  }

  arm(name: string | null) {
    this.armed.set(name)
  }

  clear(name: string) {
    engine.letGoThrow(name)
    this.persist(omit(this.bindings.get(), name))
  }

  clearAll() {
    this.releaseAll()
    this.persist({})
  }

  releaseAll() {
    for (const name of Object.keys(this.bindings.get())) engine.letGoThrow(name)
  }

  throwFor(channel: number, note: number): string | null {
    return this.throwByPad.get(padId({ channel, note })) ?? null
  }

  /** True once a throw pad has dealt with the note: bound, held or let go. */
  play(channel: number, note: number, on: boolean): boolean {
    const armed = this.armed.get()
    if (armed !== null) {
      if (on) {
        this.bind(armed, { channel, note })
        this.armed.set(null)
      }
      return true
    }
    const name = this.throwFor(channel, note)
    const def = name === null ? null : throwNamed(name)
    if (def === null) return false
    if (on) engine.holdThrow(def.name, def.push(engine.controls.get()))
    else engine.letGoThrow(def.name)
    return true
  }

  private bind(name: string, p: PadBinding) {
    const prev = this.throwByPad.get(padId(p))
    const map =
      prev === undefined ? this.bindings.get() : omit(this.bindings.get(), prev)
    this.persist({ ...map, [name]: p })
  }

  private persist(next: ThrowPadMap) {
    this.bindings.set(next)
    this.reindex()
    write(THROW_PADS_KEY, JSON.stringify(next))
  }

  private reindex() {
    this.throwByPad.clear()
    for (const [name, p] of Object.entries(this.bindings.get()))
      if (p !== undefined) this.throwByPad.set(padId(p), name)
  }
}
