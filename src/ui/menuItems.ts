import styles from './Menu.module.css'

export const menuItem = (on: boolean) => (on ? styles.itemOn : styles.item)

/** A row that is a setting rather than a command, for a `group` drawer. */
export const menuCheck = styles.check
