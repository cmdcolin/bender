import { useEffect } from 'react'

const drop = (sentinel: WakeLockSentinel) => {
  sentinel.release().catch(() => {})
}

// A phone locks its screen after half a minute without a touch, and listening
// is not touching. The browser releases the lock whenever the page hides and
// does not give it back, so a visible page asks again.
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined
    let held: WakeLockSentinel | null = null
    let stopped = false
    const acquire = () => {
      if (held !== null || document.visibilityState !== 'visible') return
      navigator.wakeLock.request('screen').then(
        sentinel => {
          if (stopped) {
            drop(sentinel)
            return
          }
          held = sentinel
          sentinel.addEventListener('release', () => {
            held = null
          })
        },
        () => {},
      )
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', acquire)
      if (held !== null) drop(held)
    }
  }, [active])
}
