import { useEffect, useRef, useState } from 'react'
import {
  MIN_GAP_MS,
  observe,
  SETTLE_MS,
  type Opened,
  type WriteGate,
} from 'skillet-shared/session-gate'

import { engine } from '../engine/engine.ts'
import { putSession } from './cloud.ts'
import { takeSessionId } from './resumeHandoff.ts'
import { boardHash } from './share.ts'
import { newVoiceId } from './voiceModel.ts'

// The board a signed-in user has open, mirrored onto their account so the home
// page can offer it back on the next machine. The same hash the address bar
// carries, from the same writer.
//
// The address bar takes a write per settled change and costs nothing. A
// Firestore document takes a round trip and counts against a quota, so this one
// is gated twice: a change waits `SETTLE_MS` for the board to stop moving, and
// no two writes land closer together than `MIN_GAP_MS`. A morph therefore
// writes once every ten seconds while the address bar writes four times a
// second, and a board identical to the one on the account writes nothing.
// Subscribed to the engine rather than given the board as a prop: a slider drag
// and a morph each move controls every frame, and whoever held that prop would
// put the whole panel through React to build a string nobody reads until the
// gesture ends.
export function useCurrentSession(uid: string | null) {
  const [sessionId] = useState(() => takeSessionId() ?? newVoiceId())
  const gate = useRef<WriteGate>({ query: null, at: 0 })
  // Bender.tsx patches a linked board into the engine before the first render,
  // so the board at the first render is the one the page opened on.
  const [start] = useState(() =>
    boardHash(window.location.hash, engine.controls.get()),
  )
  const opened = useRef<Opened>({ query: start, moved: false })

  useEffect(() => {
    if (uid === null) {
      // Signing out forgets what the last account held, so signing into another
      // one on the same page writes its first board immediately.
      gate.current = { query: null, at: 0 }
      return undefined
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const send = (query: string) => {
      const at = Date.now()
      gate.current = { query, at }
      putSession(uid, { id: sessionId, query, at }).catch((e: unknown) => {
        // Dropped. The account keeps the previous board, the next settled
        // change tries again, and nothing on screen depends on this landing.
        console.error('saving the current session failed', e)
      })
    }
    let dirty = false
    const flush = () => {
      dirty = false
      clearTimeout(timer)
      const query = boardHash(window.location.hash, engine.controls.get())
      opened.current = observe(opened.current, query)
      if (opened.current.moved && query !== gate.current.query) send(query)
    }
    // Hashing the board is the dear part, so a change only marks it and pushes
    // the timer back; the hash waits for the timer or the hide.
    const settle = () => {
      dirty = true
      clearTimeout(timer)
      timer = setTimeout(
        flush,
        Math.max(SETTLE_MS, gate.current.at + MIN_GAP_MS - Date.now()),
      )
    }
    // One last write on the way out, so a tab closed mid-debounce still leaves
    // the board the home page offers back. `visibilitychange` rather than
    // `pagehide`: the lite SDK sends an ordinary fetch with no keepalive flag,
    // and a request started at pagehide dies with the document. Hiding the tab
    // happens earlier and leaves the page alive long enough.
    const onHide = () => {
      if (document.visibilityState === 'hidden' && dirty) flush()
    }
    settle()
    const off = engine.controls.subscribe(settle)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      off()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [uid, sessionId])
}
