import { siteRoot } from '../site/paths.ts'
import { gitSha, versionLabel } from '../version.ts'
import styles from './AboutDialog.module.css'
import dlg from './components/dialog.module.css'
import { Dialog } from './components/Dialog.tsx'

export function AboutDialog(props: { onClose: () => void }) {
  const { onClose } = props
  return (
    <Dialog
      label="about bender"
      size="prose"
      onCancel={onClose}
      onBackdrop={onClose}
    >
      <div className={dlg.head}>
        <span className={dlg.title}>bender</span>
        <button className={dlg.close} autoFocus onClick={() => onClose()}>
          close
        </button>
      </div>
      <p className={dlg.line}>
        A toy keyboard, a drum machine and an FM chip, wired up wrong on
        purpose, with effects pedals too. Every stage is synthesized in the
        browser in an AudioWorklet.
      </p>
      <p className={dlg.line}>
        <a
          className={dlg.link}
          href={siteRoot}
          target="_blank"
          rel="noreferrer"
        >
          bender home: guide, blog, source, privacy ↗
        </a>
      </p>
      <p className={styles.build}>
        {versionLabel} ({gitSha})
      </p>
    </Dialog>
  )
}
