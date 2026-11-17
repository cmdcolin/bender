import { useEffect, useRef } from 'react'

export function useWindowRelease(onRelease: () => void) {
  const latest = useRef(onRelease)
  // oxlint-disable-next-line react/refs -- the window listeners read this render's callback through this ref
  latest.current = onRelease

  useEffect(() => {
    const done = () => latest.current()
    window.addEventListener('pointerup', done)
    window.addEventListener('pointercancel', done)
    return () => {
      window.removeEventListener('pointerup', done)
      window.removeEventListener('pointercancel', done)
    }
  }, [])
}
