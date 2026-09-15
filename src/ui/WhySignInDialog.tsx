import { useState } from 'react'
import { privacyUrl } from '../home/paths'
import { FREE_WITHOUT, PITCH } from './whySignIn'
import styles from './WhySignInDialog.module.css'

// Why an account, and the two ways on from the question: sign in, or copy the
// board as a link and keep it that way. The panel's ☰ menu opens the card, the
// library popover opens it, and so does a save pressed with nobody signed in —
// the press that leaves a board waiting on an answer.
export function WhySignInDialog(props: {
  onClose: () => void
  onSignIn: () => void
  /** Resolves false when the clipboard refused, so the ✓ means it landed. */
  onCopyLink: () => Promise<boolean>
  /** The name a waiting save will land under, or null when none is waiting. */
  pendingName: string | null
}) {
  const { onClose } = props
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void props.onCopyLink().then(ok => {
      if (!ok) return
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }
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
      aria-label="why sign in"
      className={styles.card}
    >
      <div className={styles.head}>
        <span className={styles.title}>why sign in?</span>
        <button className={styles.close} onClick={() => onClose()}>
          close
        </button>
      </div>
      {/* Names the board the waiting save will write, so the sentence points
          at something the reader recognises. */}
      {props.pendingName === null ? null : (
        <p className={styles.pending}>
          Signing in saves the board on screen as{' '}
          <b className={styles.pendingName}>{props.pendingName}</b>.
        </p>
      )}
      <p className={styles.pitch}>{PITCH}</p>
      <p className={styles.line}>
        {FREE_WITHOUT}{' '}
        {/* A new tab, like every link on the about card. Navigating away from
            the app tears down the audio graph. */}
        <a
          className={styles.link}
          href={privacyUrl}
          target="_blank"
          rel="noreferrer"
        >
          what an account holds ↗
        </a>
      </p>
      <div className={styles.row}>
        <button className={styles.go} autoFocus onClick={props.onSignIn}>
          sign in with Google
        </button>
        {/* The other way to keep a board, for anyone who would rather not have
            an account: every board is already a link. */}
        <button className={styles.alt} onClick={copy}>
          {copied ? 'link copied ✓' : 'copy this board as a link'}
        </button>
      </div>
    </dialog>
  )
}
