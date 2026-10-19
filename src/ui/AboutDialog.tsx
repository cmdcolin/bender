import { siteRoot } from '../site/paths.ts'
import { gitSha, versionLabel } from '../version.ts'
import styles from './AboutDialog.module.css'

// What the board is, one link to the home page, and which build you are
// looking at. The home page carries the guide, blog, source and privacy links.
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
          href={siteRoot}
          target="_blank"
          rel="noreferrer"
        >
          bender home: guide, blog, source, privacy ↗
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
