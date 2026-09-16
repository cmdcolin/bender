import { useEffect, useRef, useState } from 'react'

import { engine } from '../engine/engine'
import { putCurrent } from './cloud'
import { boardHash } from './share'

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
// CROSS_REPO_SYNC(current-session-gate)
export const SETTLE_MS = 5000
export const MIN_GAP_MS = 10000

// The query last written to the account, and when it landed.
export interface WriteGate {
  query: string | null
  at: number
}

// When a newly settled board may be written, or null when the account already
// has it. The later of the two gates wins: the debounce measures from now, the
// rate limit from the last write that landed.
export function nextWriteAt(
  gate: WriteGate,
  query: string,
  now: number,
): number | null {
  if (query === gate.query) return null
  return Math.max(now + SETTLE_MS, gate.at + MIN_GAP_MS)
}

// The board this page opened on, and whether it has moved off it since.
export interface Opened {
  query: string | null
  moved: boolean
}

// The app button on the home page opens the stock board, and a demo or a
// shared link opens a finished one. None of those is a session the visitor
// made, and writing one put it over the board the account held, which is what
// the resume card then opened on. The first board the page shows is where it
// opened, and the session starts when the board first differs from it.
export function observe(opened: Opened, query: string | null): Opened {
  if (query === null || opened.moved) return opened
  if (opened.query === null) return { query, moved: false }
  return query === opened.query ? opened : { ...opened, moved: true }
}
// CROSS_REPO_SYNC_END(current-session-gate)

// Subscribed to the engine rather than given the board as a prop: a slider drag
// and a morph each move controls every frame, and whoever held that prop would
// put the whole panel through React to build a string nobody reads until the
// gesture ends.
export function useCurrentSession(uid: string | null) {
  const gate = useRef<WriteGate>({ query: null, at: 0 })
  const live = useRef<string | null>(null)
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
      putCurrent(uid, { query, at }).catch((e: unknown) => {
        // Dropped. The account keeps the previous board, the next settled
        // change tries again, and nothing on screen depends on this landing.
        console.error('saving the current session failed', e)
      })
    }
    const settle = () => {
      const query = boardHash(window.location.hash, engine.controls.get())
      opened.current = observe(opened.current, query)
      if (!opened.current.moved) return
      live.current = query
      const due = nextWriteAt(gate.current, query, Date.now())
      if (due === null) return
      clearTimeout(timer)
      timer = setTimeout(
        () => {
          // The hide handler below may have written this board while the timer
          // waited.
          if (query !== gate.current.query) send(query)
        },
        Math.max(0, due - Date.now()),
      )
    }
    // One last write on the way out, so a tab closed mid-debounce still leaves
    // the board the home page offers back. `visibilitychange` rather than
    // `pagehide`: the lite SDK sends an ordinary fetch with no keepalive flag,
    // and a request started at pagehide dies with the document. Hiding the tab
    // happens earlier and leaves the page alive long enough.
    const onHide = () => {
      if (
        document.visibilityState === 'hidden' &&
        live.current !== null &&
        live.current !== gate.current.query
      )
        send(live.current)
    }
    settle()
    const off = engine.controls.subscribe(settle)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      off()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [uid])
}
