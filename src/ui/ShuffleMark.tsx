import styles from './ShuffleMark.module.css'

export function ShuffleMark() {
  return (
    <svg className={styles.shuffle} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M1 3h2c3 0 3 6 6 6h2M1 9h2c3 0 3-6 6-6h2M9.5 1.5 11 3 9.5 4.5M9.5 7.5 11 9 9.5 10.5" />
    </svg>
  )
}
