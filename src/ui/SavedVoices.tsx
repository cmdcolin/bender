import { useState } from 'react'

import { Menu } from './Menu.tsx'
import { sinceWords } from './relativeTime.ts'
import styles from './SavedVoices.module.css'
import { Tip } from './Tip.tsx'
import { cleanVoiceName, VOICE_NAME_MAX } from './voiceModel.ts'

import type { CloudStatus, VoiceFlash } from './useSavedVoices.ts'
import type { RecentSession, SavedVoice } from './voiceModel.ts'

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
// Signed out there is no list, so the button is absent and `Account`'s `sign in`
// is the only box about the account. Signed in, this button opens the list.
export function SavedVoices(props: {
  voices: readonly SavedVoice[]
  /** The autosaved visits before this one, newest first. Recalling one morphs
      to its board and opening one lands it whole, as for a voice, but neither
      makes it the voice you are in. */
  recent: readonly RecentSession[]
  onRecallSession: (session: RecentSession) => void
  onOpenSession: (session: RecentSession) => void
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
}) {
  const signedIn = props.status === 'ready'
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [name, setName] = useState('')
  const [suggested, setSuggested] = useState('')
  // Read when the menu opens, so the words stay still while it is up.
  const [now, setNow] = useState(0)
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

  if (!signedIn) return null

  return (
    <>
      <Tip text="Save this board under a name and bring it back later, the way a synth keeps its voices (ctrl+S saves without opening this). The list lives on your account.">
        <button
          ref={setAnchor}
          className={
            props.flash?.kind === 'failed' ? styles.triggerBad : styles.trigger
          }
          aria-expanded={open}
          onClick={() => {
            setSuggested(props.suggestName())
            setNow(Date.now())
            setOpen(o => !o)
          }}
        >
          {`saved${props.voices.length > 0 ? ` ${props.voices.length}` : ''}${
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
                  const ctrlS =
                    e.key.toLowerCase() === 's' && (e.ctrlKey || e.metaKey)
                  if (ctrlS) e.preventDefault()
                  if (e.key === 'Enter' || ctrlS) save()
                }}
              />
              <button className={styles.save} onClick={() => save()}>
                save
              </button>
            </div>
            {props.voices.length === 0 ? (
              <p className={styles.hint}>
                Nothing saved yet — press save to keep this board under the name
                in the box. It is stored on your account, so it is there on your
                next machine as well as your next session.
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
                  A recall morphs the board across on the panel's own duration,
                  ↗ lands it whole the way a link does, and ⧉ copies a link that
                  does what ↗ does.
                </p>
              </>
            )}
            {props.recent.length > 0 && (
              <>
                <p className={styles.subhead}>earlier sessions</p>
                <div className={styles.list}>
                  {props.recent.map(session => {
                    const kept = props.voices.find(
                      v => v.query === session.query,
                    )
                    return (
                      <div className={styles.row} key={session.id}>
                        <button
                          className={styles.recall}
                          title={`bring back the board as it stood ${sinceWords(session.at, now)}`}
                          onClick={() => props.onRecallSession(session)}
                        >
                          {sinceWords(session.at, now)}
                          {kept && (
                            <span className={styles.savedAs}>
                              {' '}
                              saved as “{kept.name}”
                            </span>
                          )}
                        </button>
                        <button
                          className={styles.rowBtn}
                          aria-label={`open the session from ${sinceWords(session.at, now)}`}
                          title="open it whole, the way a link does"
                          onClick={() => props.onOpenSession(session)}
                        >
                          ↗
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
            {props.error === null ? null : (
              <p className={styles.err}>{props.error}</p>
            )}
          </div>
        </Menu>
      )}
    </>
  )
}
