import { useEffect } from 'react'

import { bench } from './bench.ts'
import { fetchPrefs, putPrefs } from './cloud.ts'
import { keymap } from './keymap.ts'
import { morphSetting } from './morph.ts'
import {
  applyPrefs,
  collectPrefs,
  decide,
  isApplying,
  localAt,
  readPrefs,
  stampLocal,
} from './prefs.ts'

// Settings change rarely, and a few in a row are one visit to the bench.
const SETTLE_MS = 2000

// Mirrors the player's setup onto their account. Every change a hand makes
// stamps this machine's clock, signed in or not, so a setup made before signing
// in still counts as newer than an account that never heard of it.
//
// Nothing here is allowed to be loud: a fetch or write that fails leaves the
// setup working from this machine, and the next change tries again.
export function useSyncedPrefs(uid: string | null) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let live = true
    const push = () => {
      if (uid === null) return
      putPrefs(uid, collectPrefs(localAt())).catch((e: unknown) => {
        console.error('saving the setup failed', e)
      })
    }
    const changed = () => {
      if (isApplying()) return
      stampLocal(Date.now())
      if (uid === null) return
      clearTimeout(timer)
      timer = setTimeout(push, SETTLE_MS)
    }
    const offs = [bench, morphSetting, keymap].map(s => s.subscribe(changed))

    if (uid !== null) {
      fetchPrefs(uid)
        .then(raw => {
          if (!live) return
          const sync = decide(localAt(), readPrefs(raw))
          switch (sync.kind) {
            case 'adopt':
              applyPrefs(sync.prefs)
              stampLocal(sync.prefs.at)
              break
            case 'push':
              push()
              break
            case 'none':
              break
          }
        })
        .catch((e: unknown) => {
          console.error('reading the setup failed', e)
        })
    }

    return () => {
      live = false
      clearTimeout(timer)
      for (const off of offs) off()
    }
  }, [uid])
}
