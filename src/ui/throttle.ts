/** Runs `run` at once when its last run is `ms` old, else once when it will be;
    calls in between fold into that one run. */
export function throttle(run: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let ranAt = -Infinity
  const go = () => {
    timer = undefined
    ranAt = performance.now()
    run()
  }
  const call = () => {
    if (timer !== undefined) return
    const wait = ms - (performance.now() - ranAt)
    if (wait <= 0) go()
    else timer = setTimeout(go, wait)
  }
  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
  }
  return { call, cancel }
}
