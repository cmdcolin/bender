import styles from './pocket.module.css'

import type { Shelf } from './shelves.ts'

export const BENDS_TAB = 'bends'

// The strip mounts afresh for each tab and scrolls to the chip that is up.
const showUpChip = (nav: HTMLElement | null) =>
  nav
    ?.querySelector('[aria-pressed="true"]')
    ?.scrollIntoView({ inline: 'center', block: 'nearest' })

export function Tabs(props: {
  shelves: readonly Shelf[]
  tab: string
  onTab: (name: string) => void
}) {
  const names = [...props.shelves.map(s => s.name), BENDS_TAB]
  return (
    <div className={styles.tabs} role="tablist" aria-label="Kinds of sound">
      {names.map(name => (
        <button
          key={name}
          role="tab"
          aria-selected={props.tab === name}
          className={props.tab === name ? styles.tabOn : styles.tab}
          onClick={() => props.onTab(name)}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

export function Strip(props: {
  shelf: Shelf
  up: string | null
  rolled: boolean
  normal: boolean
  strength: number
  onRoll: () => void
  onNormal: () => void
  onPick: (name: string) => void
}) {
  return (
    <nav
      key={props.shelf.name}
      className={styles.strip}
      aria-label="Presets"
      ref={showUpChip}
    >
      <span className={styles.roll}>
        <button
          className={props.rolled ? styles.chipOn : styles.chip}
          aria-pressed={props.rolled}
          title="a random board"
          onClick={props.onRoll}
        >
          ⚄ random
        </button>
      </span>
      <button
        className={props.normal ? styles.chipOn : styles.chip}
        aria-pressed={props.normal}
        data-preset="normal"
        onClick={props.onNormal}
      >
        normal
      </button>
      {props.shelf.presets.map(p => {
        const up = props.up === p.name
        return (
          <button
            key={p.name}
            className={up ? styles.chipOn : styles.chip}
            aria-pressed={up}
            data-preset={p.name}
            title={p.blurb}
            onClick={() => props.onPick(p.name)}
          >
            {p.name}
            {up && props.strength < 1 ? (
              <span className={styles.chipStrength}>
                {Math.round(props.strength * 100)}
              </span>
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}
