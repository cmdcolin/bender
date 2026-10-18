import { engine } from '../engine/engine.ts'

// The rail is down for about 70 ms on a reboot, too short to read, so a reboot
// stays flagged this long.
const FLASH_MS = 260

/** Calls `paint` with the rail and whether a reboot is showing, on each meter
    post and once more when a flash ends. Returns the unsubscribe. */
export function watchRail(
  paint: (rail: number, rebooting: boolean) => void,
): () => void {
  let seen = engine.meter.get().reboots
  let flashUntil = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const post = () => {
    const now = performance.now()
    const { rail, reboots } = engine.meter.get()
    if (reboots !== seen) {
      seen = reboots
      flashUntil = now + FLASH_MS
      clearTimeout(timer)
      timer = setTimeout(post, FLASH_MS + 20)
    }
    paint(rail, now < flashUntil)
  }
  const off = engine.meter.subscribe(post)
  return () => {
    off()
    clearTimeout(timer)
  }
}
