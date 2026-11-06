import { isControlKey, type ControlKey } from './controls.ts'

// Growler and Howler are two builds of one voice card, each with a melody
// memory of its own, and their controls differ only in this prefix.
export type CardPrefix = 'mono' | 'lead'

type After<K, P extends string> = K extends `${P}${infer S}` ? S : never
export type CardSuffix = After<ControlKey, 'lead'>

export const cardKey = <P extends CardPrefix, S extends CardSuffix>(
  prefix: P,
  suffix: S,
) => `${prefix}${suffix}` as const

/** Howler's twin of one of Growler's controls, if Howler has one. */
export function leadTwin(key: ControlKey) {
  const twin = key.startsWith('mono') ? `lead${key.slice(4)}` : ''
  return isControlKey(twin) ? twin : undefined
}
