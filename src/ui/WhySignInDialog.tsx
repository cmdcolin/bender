import { siteRoot, privacyUrl } from '../site/paths.ts'
import dlg from './components/dialog.module.css'
import { Dialog } from './components/Dialog.tsx'
import { useFlash } from './useFlash.ts'
import {
  FREE_WITHOUT,
  HOW,
  PITCH,
  SHOT,
  SHOT_ALT,
  SHOT_CAPTION,
  SHOT_H,
  SHOT_W,
} from './whySignIn.ts'
import styles from './WhySignInDialog.module.css'

export function WhySignInDialog(props: {
  onClose: () => void
  onSignIn: () => void
  onCopyLink: () => Promise<boolean>
  pendingName: string | null
}) {
  const { onClose } = props
  const { shown: copied, flash: flashCopied } = useFlash<true>(1600)
  const copy = () => {
    void props.onCopyLink().then(ok => {
      if (!ok) return
      flashCopied(true)
    })
  }
  return (
    <Dialog
      label="why sign in"
      size="picture"
      onCancel={onClose}
      onBackdrop={onClose}
    >
      <div className={dlg.head}>
        <span className={dlg.title}>why sign in?</span>
        <button className={dlg.close} onClick={() => onClose()}>
          close
        </button>
      </div>
      {props.pendingName === null ? null : (
        <p className={styles.pending}>
          Signing in saves the board on screen as{' '}
          <b className={styles.pendingName}>{props.pendingName}</b>.
        </p>
      )}
      <p className={styles.pitch}>{PITCH}</p>
      <figure className={styles.figure}>
        <img
          className={styles.shot}
          src={`${siteRoot}${SHOT}`}
          alt={SHOT_ALT}
          width={SHOT_W}
          height={SHOT_H}
        />
        <figcaption className={styles.caption}>{SHOT_CAPTION}</figcaption>
      </figure>
      <p className={styles.line}>
        {FREE_WITHOUT} {HOW}{' '}
        <a
          className={dlg.link}
          href={privacyUrl}
          target="_blank"
          rel="noreferrer"
        >
          what an account stores ↗
        </a>
      </p>
      <div className={styles.row}>
        <button className={styles.go} autoFocus onClick={props.onSignIn}>
          sign in with Google
        </button>
        <button className={styles.alt} onClick={copy}>
          {copied ? 'link copied ✓' : 'copy this board as a link'}
        </button>
      </div>
    </Dialog>
  )
}
