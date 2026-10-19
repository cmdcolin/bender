import styles from './TabKey.module.css'

import type { ComponentProps } from 'react'

type Rest = Omit<ComponentProps<'button'>, 'children' | 'className'>

// A key on the top edge of a walkman. It shows a few millimetres of cap above
// the body, and a latched key sits down into it.
export function TabKey({
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
      className={red ? styles.tabRed : styles.tab}
      aria-label={name ?? legend}
      aria-pressed={latched}
    >
      {legend}
    </button>
  )
}
