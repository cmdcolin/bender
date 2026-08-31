import { gitSha, versionLabel } from '../version'
import styles from './AboutDialog.module.css'

const REPO = 'https://github.com/cmdcolin/bender'

// Three things, and no more: what the board is, where to read about it, and
// which build you are looking at. The tour and the key list are in the docs,
// and a second copy of them here would be a page nobody remembered to edit
// against an app that keeps moving.
export function AboutDialog(props: { onClose: () => void }) {
  const { onClose } = props
  return (
    <dialog
      ref={el => {
        if (el && !el.open) el.showModal()
      }}
      onCancel={e => {
        e.preventDefault()
        onClose()
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      aria-label="about bender"
      className={styles.card}
    >
      <div className={styles.head}>
        <span className={styles.title}>bender</span>
        <button className={styles.close} autoFocus onClick={() => onClose()}>
          close
        </button>
      </div>
      <p className={styles.line}>
        A toy keyboard, a drum machine and an FM chip, wired up wrong on
        purpose, with effects pedals too. Every stage is synthesized in the
        browser in an AudioWorklet.
      </p>
      <p className={styles.line}>
        <a
          className={styles.link}
          href={`${REPO}/blob/main/docs/USER-GUIDE.md`}
          target="_blank"
          rel="noreferrer"
        >
          user guide ↗
        </a>{' '}
        ·{' '}
        <a
          className={styles.link}
          href={`${REPO}/blob/main/docs/BENDS.md`}
          target="_blank"
          rel="noreferrer"
        >
          what the bends do ↗
        </a>{' '}
        ·{' '}
        <a className={styles.link} href={REPO} target="_blank" rel="noreferrer">
          source on GitHub ↗
        </a>
      </p>
      {/* The sha as well as the tag: a bug report against "v0.17.2" cannot say
          which of the day's builds it was. */}
      <p className={styles.build}>
        {versionLabel} ({gitSha})
      </p>
    </dialog>
  )
}
