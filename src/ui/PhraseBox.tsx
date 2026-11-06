import { useState } from 'react'

import { engine } from '../engine/engine.ts'
import { phraseControls, phraseOf, phraseText } from '../prattle.ts'
import { useBoardValue } from './ControlsContext.ts'
import styles from './PhraseBox.module.css'

const WORDS = [
  'kill',
  'the',
  'bass',
  'kick',
  'drop',
  'noise',
  'acid',
  'machine',
  'error',
  'reboot',
  'again',
  'jack',
  'your',
  'body',
  'harder',
  'one',
  'two',
  'three',
  'four',
]

const AUDIBLE = 0.8

function speak(text?: string, after = false) {
  const c = engine.controls.get()
  engine.patch({
    ...(text !== undefined && phraseControls(text, after ? phraseOf(c) : [])),
    ...(c.talkLevel === 0 && { talkLevel: AUDIBLE }),
  })
  engine.talk()
}

/** Prattle's phrase memory: what it holds, words to add, and a press to say it. */
export function PhraseBox() {
  const held = useBoardValue(c => phraseText(phraseOf(c)))
  const [draft, setDraft] = useState('')
  const say = () => {
    speak(draft.trim() === '' ? undefined : draft)
    setDraft('')
  }
  return (
    <div className={styles.box}>
      <div className={styles.held}>
        {held === '' ? 'empty: it counts one to four' : held}
      </div>
      <div className={styles.row}>
        <input
          className={styles.input}
          type="text"
          value={draft}
          placeholder="type a phrase"
          aria-label="phrase for Prattle"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') say()
          }}
        />
        <button className={styles.say} onClick={say}>
          say it
        </button>
      </div>
      <div className={styles.words}>
        {WORDS.map(w => (
          <button
            key={w}
            className={styles.word}
            onClick={() => speak(w, true)}
          >
            {w}
          </button>
        ))}
        <button
          className={styles.clear}
          onClick={() => engine.patch(phraseControls(''))}
        >
          clear
        </button>
      </div>
    </div>
  )
}
