import styles from './ToggleButtonGroup.module.css'

export function ToggleButtonGroup<T extends string>(props: {
  label: string
  options: readonly T[]
  value: T | null
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <div className={styles.group} role="group" aria-label={props.label}>
      {props.options.map(option => (
        <button
          key={option}
          className={option === props.value ? styles.on : styles.off}
          aria-pressed={option === props.value}
          disabled={props.disabled}
          onClick={() => props.onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
