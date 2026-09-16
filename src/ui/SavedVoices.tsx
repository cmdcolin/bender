import { useState } from 'react'

import { Menu } from './Menu'
import styles from './SavedVoices.module.css'
import { Tip } from './Tip'
import { cleanVoiceName, VOICE_NAME_MAX } from './voiceModel'

import type { CloudStatus, VoiceFlash } from './useSavedVoices'
import type { SavedVoice } from './voiceModel'

// The voice library: one button in the panel's chrome, beside the nameplate and
// the MIDI drawer. A synth's save and recall.
//
// It sits with those rather than in the row of verbs under it, because it is
// not a verb over the board on screen — it is a fact about the session, the
// same kind of thing the nameplate answers for the app.
//
// It is a popover rather than a fold of the panel: saving takes two seconds and
// recall is a list you open, and neither wants permanent panel height. The
// presets row stays what it is — the app's own catalog, browsed by eye. This
// list is yours and starts empty.
//
// The button always says `saved`. It used to read `sign in` with nobody signed
// in, which made one button stand for two different things: press it, answer
// Google, and the save form you never opened was what came back. The account
// is its own control now (`Account`), and this one only ever opens the list.
export function SavedVoices(props: {
  voices: readonly SavedVoice[]
  /** What the name box offers when you type nothing. A function rather than a
      value: working out which preset the board matches costs a pass over the
      catalog, and nothing wants that on every frame of a morph. Read when the
      menu opens, and by ctrl+S — which saves with the menu shut — so both
      offer the same name. */
  suggestName: () => string
  onSave: (name: string) => void
  onRecall: (voice: SavedVoice) => void
  /** The other half of recall: put the board on the address bar, which is what
      a link does, so the whole board arrives rather than being morphed into. */
  onOpen: (voice: SavedVoice) => void
  onDelete: (name: string) => void
  /** Resolves false when the clipboard refused, so the ✓ stands for something
      that happened rather than for something that was attempted. */
  onCopyLink: (voice: SavedVoice) => Promise<boolean>
  flash: VoiceFlash | null
  status: CloudStatus
  error: string | null
  onSignIn: () => void
  /** Opens the why-sign-in card, which the panel's menu and the save button
      open too. The pane here gives the one-sentence version. */
  onWhy: () => void
}) {
  const signedIn = props.status === 'ready'
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [name, setName] = useState('')
  const [suggested, setSuggested] = useState('')
  // Which row's link just went to the clipboard. A copy is otherwise silent.
  const [copied, setCopied] = useState<string | null>(null)

  // Typing nothing saves under the suggestion the placeholder is already
  // showing. That is the whole ease of it: open, press save, done.
  const save = (given?: string) => {
    props.onSave(given ?? (cleanVoiceName(name) === '' ? suggested : name))
    setName('')
  }
  const copy = (voice: SavedVoice) => {
    void props.onCopyLink(voice).then(ok => {
      if (!ok) return
      setCopied(voice.name)
      setTimeout(() => setCopied(null), 1200)
    })
  }

  return (
    <>
      <Tip
        text={
          signedIn
            ? 'Save this board under a name and bring it back later, the way a synth keeps its voices (ctrl+S saves without opening this). The list lives on your account.'
            : 'The boards you keep under a name. An account holds the list, so this one opens onto what an account is for.'
        }
      >
        <button
          ref={setAnchor}
          className={
            props.flash?.kind === 'failed' ? styles.triggerBad : styles.trigger
          }
          aria-expanded={open}
          onClick={() => {
            setSuggested(props.suggestName())
            setOpen(o => !o)
          }}
        >
          {`saved${
            signedIn && props.voices.length > 0 ? ` ${props.voices.length}` : ''
          }${
            props.flash?.kind === 'saved'
              ? ' ✓'
              : props.flash?.kind === 'failed'
                ? ' ✕'
                : ''
          }`}
        </button>
      </Tip>
      {open && (
        <Menu
          anchor={anchor}
          toggle={anchor}
          role="group"
          label="saved voices"
          onClose={() => setOpen(false)}
        >
          <div className={styles.body}>
            {signedIn ? (
              <>
                {/* Deliberately not a <form>: a form in a popover submits, and
                    in every engine that means a navigation unless it is
                    cancelled — one keystroke from throwing the board away.
                    Enter is wired straight to the same call. */}
                <div className={styles.saveRow}>
                  <input
                    className={styles.nameInput}
                    type="text"
                    value={name}
                    maxLength={VOICE_NAME_MAX}
                    placeholder={suggested}
                    aria-label="name for this voice"
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') save()
                    }}
                  />
                  <button className={styles.save} onClick={() => save()}>
                    save
                  </button>
                </div>
                {props.voices.length === 0 ? (
                  <p className={styles.hint}>
                    Nothing saved yet — press save to keep this board under the
                    name in the box. It is stored on your account, so it is
                    there on your next machine as well as your next session.
                  </p>
                ) : (
                  <>
                    <div className={styles.list}>
                      {props.voices.map(voice => (
                        <div className={styles.row} key={voice.name}>
                          <button
                            className={styles.recall}
                            title={`recall “${voice.name}” — shift+click overwrites it with the board on screen`}
                            onClick={e => {
                              if (e.shiftKey) save(voice.name)
                              else props.onRecall(voice)
                            }}
                          >
                            {voice.name}
                          </button>
                          <button
                            className={styles.rowBtn}
                            aria-label={`open ${voice.name}`}
                            title={`open “${voice.name}” — the whole board at once, as a link would`}
                            onClick={() => props.onOpen(voice)}
                          >
                            ↗
                          </button>
                          <button
                            className={styles.rowBtn}
                            aria-label={`copy a link to ${voice.name}`}
                            title={`copy a link to “${voice.name}”`}
                            onClick={() => copy(voice)}
                          >
                            {copied === voice.name ? '✓' : '⧉'}
                          </button>
                          <button
                            className={styles.rowDel}
                            aria-label={`delete ${voice.name}`}
                            title={`delete “${voice.name}”`}
                            onClick={() => props.onDelete(voice.name)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className={styles.hint}>
                      A recall morphs the board across on the panel's own
                      duration, ↗ lands it whole the way a link does, and ⧉
                      copies a link that does what ↗ does.
                    </p>
                  </>
                )}
              </>
            ) : (
              <SignInPane
                status={props.status}
                onSignIn={props.onSignIn}
                onWhy={() => {
                  setOpen(false)
                  props.onWhy()
                }}
                error={props.error}
              />
            )}
            {props.error === null || !signedIn ? null : (
              <p className={styles.err}>{props.error}</p>
            )}
          </div>
        </Menu>
      )}
    </>
  )
}

// What an account is for here, and the button. One sentence, because the
// library is the only thing in the app that needs one. `why sign in?` opens the
// long answer for anyone who wants it.
function SignInPane(props: {
  status: CloudStatus
  error: string | null
  onSignIn: () => void
  onWhy: () => void
}) {
  // Picking a session back up is not being asked to start one: a returning user
  // would otherwise read the pitch for something they already have.
  if (props.status === 'loading') {
    return <p className={styles.hint}>checking your account…</p>
  }
  return (
    <div className={styles.signIn}>
      <p className={styles.hint}>
        Sign in to keep voices under a name — they live on your Google account,
        so they follow you to another machine. Everything else here works signed
        out.
      </p>
      <div className={styles.signInRow}>
        <button className={styles.save} onClick={props.onSignIn}>
          sign in with Google
        </button>
        <button className={styles.why} onClick={props.onWhy}>
          why sign in?
        </button>
      </div>
      {props.error === null ? null : (
        <p className={styles.err}>{props.error}</p>
      )}
    </div>
  )
}
