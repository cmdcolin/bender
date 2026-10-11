import { useEffect, useRef, useState } from 'react'

import { tiltPoint, type Tilt } from './touch'

type Point = { x: number; y: number }

const supported = () =>
  typeof window !== 'undefined' &&
  'DeviceOrientationEvent' in window &&
  window.matchMedia('(pointer: coarse)').matches

// iOS asks before a page reads the phone's motion, and only from a tap.
async function allowed(): Promise<boolean> {
  const ask: unknown = Reflect.get(DeviceOrientationEvent, 'requestPermission')
  if (typeof ask !== 'function') return true
  try {
    return (await ask.call(DeviceOrientationEvent)) === 'granted'
  } catch {
    return false
  }
}

// The phone's tilt as a point on the stage while tilt is on, measured from
// where the phone sat when it came on.
export function useTilt(onPoint: (p: Point | null) => void) {
  const [on, setOn] = useState(false)
  const point = useRef(onPoint)
  // oxlint-disable-next-line react/refs -- the orientation listener reads the latest callback through this ref
  point.current = onPoint

  useEffect(() => {
    if (!on) return undefined
    let rest: Tilt | null = null
    const move = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return
      const now = { beta: e.beta, gamma: e.gamma }
      rest ??= now
      point.current(tiltPoint(now, rest))
    }
    window.addEventListener('deviceorientation', move)
    return () => {
      window.removeEventListener('deviceorientation', move)
      point.current(null)
    }
  }, [on])

  const toggle = async (): Promise<boolean> => {
    if (on) {
      setOn(false)
      return true
    }
    if (!(await allowed())) return false
    setOn(true)
    return true
  }

  return { supported: supported(), on, toggle }
}
