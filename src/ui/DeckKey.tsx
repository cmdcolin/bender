import styles from './DeckKey.module.css'

import type { ComponentProps, ReactNode } from 'react'

const GLYPHS = {
  play: <path d="M2 1 11 6 2 11Z" />,
  reverse: <path d="M10 1 1 6 10 11Z" />,
  stop: <rect x="2" y="2" width="8" height="8" />,
  rec: <circle cx="6" cy="6" r="4.5" />,
  eject: (
    <>
      <path d="M6 1 11 7H1Z" />
      <rect x="1" y="9" width="10" height="2" />
    </>
  ),
  mic: (
    <>
      <rect x="4" y="0.5" width="4" height="7" rx="2" />
      <path d="M2.5 6a3.5 3.5 0 0 0 7 0H9a3 3 0 0 1-6 0Z" />
      <rect x="5.5" y="9" width="1" height="2" />
      <rect x="3.5" y="11" width="5" height="1" />
    </>
  ),
  more: (
    <>
      <circle cx="2" cy="6" r="1.4" />
      <circle cx="6" cy="6" r="1.4" />
      <circle cx="10" cy="6" r="1.4" />
    </>
  ),
  search: (
    <>
      <path
        fillRule="evenodd"
        d="M5 1a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 1.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Z"
      />
      <path d="M7.8 8.8 8.8 7.8 11.5 10.5 10.5 11.5Z" />
    </>
  ),
  cancel: (
    <path d="M2 1 6 5 10 1 11 2 7 6 11 10 10 11 6 7 2 11 1 10 5 6 1 2Z" />
  ),
} as const

export type Glyph = keyof typeof GLYPHS

// The rest goes to the button, so a Tip around a key finds the ref and the
// pointer handlers it clones onto its child.
type Rest = Omit<ComponentProps<'button'>, 'children' | 'className'>

// One key on the front of a deck. A latched key stays down and says so with
// aria-pressed; a key that only acts leaves `latched` unset.
export function DeckKey({
  glyph,
  legend,
  name,
  latched,
  red,
  ...rest
}: Rest & {
  glyph: Glyph
  legend: string
  name?: string
  latched?: boolean
  red?: boolean
}) {
  const down = latched === true
  const className = red
    ? down
      ? styles.keyRedOn
      : styles.keyRed
    : down
      ? styles.keyOn
      : styles.key
  return (
    <button
      {...rest}
      className={className}
      aria-label={name ?? legend}
      aria-pressed={latched}
    >
      <svg className={styles.glyph} viewBox="0 0 12 12" aria-hidden>
        {GLYPHS[glyph]}
      </svg>
      {legend}
    </button>
  )
}

// A key with a word where the glyph goes, such as a speed.
export function DeckWord({
  children,
  name,
  latched,
  ...rest
}: Rest & { children: ReactNode; name: string; latched: boolean }) {
  return (
    <button
      {...rest}
      className={latched ? styles.keyWordOn : styles.keyWord}
      aria-label={name}
      aria-pressed={latched}
    >
      {children}
    </button>
  )
}

// The bar the keys sit in.
export function DeckWell(props: { label: string; children: ReactNode }) {
  return (
    <div className={styles.well} role="group" aria-label={props.label}>
      {props.children}
    </div>
  )
}

// A rule between groups of keys in one bar.
export function DeckDivider() {
  return <span className={styles.divider} aria-hidden />
}
