import { isControlKey, type ControlKey } from '../controls'
import { engine } from '../engine/engine'
import { createStore } from '../listeners'
import { padId, type PadBinding } from './pads'
import { omit, parseMap, read, write } from './persist'
import { THROWS } from './throws'

export type ThrowPadMap = Partial<Record<string, PadBinding>>

/** A control a pad pushes to `value` while it is down. */
export interface EffectPad extends PadBinding {
  value: number
}

export type EffectPadMap = Partial<Record<ControlKey, EffectPad>>

/** An effect waiting for its pad. */
export interface EffectArm {
  control: ControlKey
  value: number
}

const THROW_PADS_KEY = 'bender.midi.throwpads'
const EFFECT_PADS_KEY = 'bender.midi.effectpads'

const throwNamed = (name: string) => THROWS.find(t => t.name === name) ?? null
const effectName = (control: string) => `effect:${control}`

const readPad = (stored: object) => {
  const { channel, note } = stored as Partial<PadBinding>
  return typeof channel === 'number' && typeof note === 'number'
    ? { channel, note }
    : null
}

export const parseThrowPads = (raw: string | null): ThrowPadMap =>
  parseMap(raw, name => throwNamed(name)?.name ?? null, readPad)

export const parseEffectPads = (raw: string | null): EffectPadMap =>
  parseMap(
    raw,
    name => (isControlKey(name) ? name : null),
    stored => {
      const pad = readPad(stored)
      const { value } = stored as Partial<EffectPad>
      return pad !== null && typeof value === 'number'
        ? { ...pad, value }
        : null
    },
  )

type Target = { throw: string } | { effect: ControlKey }

// A pad held down holds its throw or pushes its control, and lifting it springs
// the board back, the way the hold row's buttons and keys do. A pad binds to one
// target at a time.
export class ThrowPads {
  readonly bindings = createStore<ThrowPadMap>(
    parseThrowPads(read(THROW_PADS_KEY)),
  )
  readonly effects = createStore<EffectPadMap>(
    parseEffectPads(read(EFFECT_PADS_KEY)),
  )
  readonly armed = createStore<string | null>(null)
  readonly armedEffect = createStore<EffectArm | null>(null)

  private targetByPad = new Map<string, Target>()

  constructor() {
    this.reindex()
  }

  arm(name: string | null) {
    this.armedEffect.set(null)
    this.armed.set(name)
  }

  armEffect(effect: EffectArm | null) {
    this.armed.set(null)
    this.armedEffect.set(effect)
  }

  cancel() {
    this.armed.set(null)
    this.armedEffect.set(null)
  }

  clear(name: string) {
    engine.letGoThrow(name)
    this.persistThrows(omit(this.bindings.get(), name))
  }

  clearEffect(control: ControlKey) {
    engine.letGoThrow(effectName(control))
    this.persistEffects(omit(this.effects.get(), control))
  }

  clearAll() {
    this.releaseAll()
    this.persistThrows({})
    this.persistEffects({})
  }

  releaseAll() {
    for (const name of Object.keys(this.bindings.get())) engine.letGoThrow(name)
    for (const control of Object.keys(this.effects.get()))
      engine.letGoThrow(effectName(control))
  }

  /** True once a pad has dealt with the note: bound, held or let go. */
  play(channel: number, note: number, on: boolean): boolean {
    const pad = { channel, note }
    const armed = this.armed.get()
    const armedEffect = this.armedEffect.get()
    if (armed !== null || armedEffect !== null) {
      if (!on) return true
      this.release(pad)
      if (armed !== null)
        this.persistThrows({ ...this.bindings.get(), [armed]: pad })
      else if (armedEffect !== null)
        this.persistEffects({
          ...this.effects.get(),
          [armedEffect.control]: { ...pad, value: armedEffect.value },
        })
      this.cancel()
      return true
    }
    const target = this.targetByPad.get(padId(pad))
    if (target === undefined) return false
    if ('throw' in target) {
      const def = throwNamed(target.throw)
      if (def === null) return false
      if (on) engine.holdThrow(def.name, def.push(engine.controls.get()))
      else engine.letGoThrow(def.name)
      return true
    }
    const effect = this.effects.get()[target.effect]
    if (effect === undefined) return false
    const name = effectName(target.effect)
    if (on) engine.holdThrow(name, { [target.effect]: effect.value })
    else engine.letGoThrow(name)
    return true
  }

  // A pad takes one target, so binding it elsewhere drops what it held.
  private release(pad: PadBinding) {
    const prev = this.targetByPad.get(padId(pad))
    if (prev === undefined) return
    if ('throw' in prev)
      this.persistThrows(omit(this.bindings.get(), prev.throw))
    else this.persistEffects(omit(this.effects.get(), prev.effect))
  }

  private persistThrows(next: ThrowPadMap) {
    this.bindings.set(next)
    this.reindex()
    write(THROW_PADS_KEY, JSON.stringify(next))
  }

  private persistEffects(next: EffectPadMap) {
    this.effects.set(next)
    this.reindex()
    write(EFFECT_PADS_KEY, JSON.stringify(next))
  }

  private reindex() {
    this.targetByPad.clear()
    for (const [name, p] of Object.entries(this.bindings.get()))
      if (p !== undefined) this.targetByPad.set(padId(p), { throw: name })
    for (const [control, p] of Object.entries(this.effects.get()))
      if (p !== undefined && isControlKey(control))
        this.targetByPad.set(padId(p), { effect: control })
  }
}
