import { Tip } from './Tip.tsx'
import styles from './ToggleButtonGroup.module.css'

export function ToggleButtonGroup<T extends string>(props: {
  label: string
  options: readonly T[]
  value: T | null
  onChange: (value: T) => void
  disabled?: boolean
  large?: boolean
  full?: boolean
  /** The option that lights in the accent while chosen, such as a switch's on. */
  lit?: T
  tips?: Partial<Record<T, string>>
}) {
  return (
    <div
      className={[
        styles.group,
        props.large && styles.large,
        props.full && styles.full,
      ]
        .filter(Boolean)
        .join(' ')}
      role="group"
      aria-label={props.label}
    >
      {props.options.map(option => {
        const button = (
          <button
            key={option}
            className={
              option !== props.value
                ? styles.off
                : option === props.lit
                  ? styles.lit
                  : styles.on
            }
            aria-pressed={option === props.value}
            disabled={props.disabled}
            onClick={() => props.onChange(option)}
          >
            {option}
          </button>
        )
        const tip = props.tips?.[option]
        return tip ? (
          <Tip key={option} text={tip}>
            {button}
          </Tip>
        ) : (
          button
        )
      })}
    </div>
  )
}
