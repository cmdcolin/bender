import styles from './MachineKey.module.css'

import type { ComponentProps } from 'react'

type Rest = Omit<ComponentProps<'button'>, 'children' | 'className'>

// A piano key on a cassette machine: the legend prints on the strip above the
// cap, and a latched key stays down the way a record key does.
export function MachineKey({
  legend,
  name,
  latched,
  red,
  ...rest
}: Rest & {
  legend: string
  name?: string
  latched?: boolean
  red?: boolean
}) {
  return (
    <button
      {...rest}
      className={styles.key}
      aria-label={name ?? legend}
      aria-pressed={latched}
    >
      <span className={styles.legend}>{legend}</span>
      <span className={red ? styles.capRed : styles.cap} />
    </button>
  )
}
