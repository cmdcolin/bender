const BANDS = [
  ['low', 1, 5],
  ['mid', 5, 40],
  ['high', 40, 200],
] as const

export interface Follower {
  slow: number
  peak: number
}

export const follower = (): Follower => ({ slow: 0, peak: 0.05 })

export function punch(f: Follower, v: number) {
  f.slow += (v - f.slow) * 0.05
  f.peak = Math.max(v, f.peak * 0.995)
  const glow = (0.3 * v) / f.peak
  const hit = (v - f.slow) / (0.25 * f.peak)
  return Math.min(1, Math.max(0, glow + hit))
}

export function pileMeter(audio: HTMLAudioElement, figure: HTMLElement) {
  let tap: { context: AudioContext; analyser: AnalyserNode } | undefined
  let frame = 0
  const followers = BANDS.map(follower)
  const bins = new Uint8Array(512)

  const open = () => {
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    context
      .createMediaElementSource(audio)
      .connect(analyser)
      .connect(context.destination)
    return { context, analyser }
  }

  const tick = (analyser: AnalyserNode) => {
    analyser.getByteFrequencyData(bins)
    BANDS.forEach(([name, lo, hi], i) => {
      const sum = bins.subarray(lo, hi).reduce((a, b) => a + b, 0)
      const level = punch(followers[i]!, sum / (hi - lo) / 255)
      figure.style.setProperty(`--${name}`, level.toFixed(2))
    })
    frame = requestAnimationFrame(() => tick(analyser))
  }

  const stop = () => {
    cancelAnimationFrame(frame)
    delete figure.dataset.playing
  }

  const start = () => {
    tap ??= open()
    void tap.context.resume()
    stop()
    figure.dataset.playing = ''
    tick(tap.analyser)
  }

  return { start, stop }
}
