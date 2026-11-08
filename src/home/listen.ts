import { pileMeter } from './pileMeter.ts'

const audio = new Audio()
// The pile's meter reads this through an AnalyserNode, which needs CORS.
// myloveydove.com sends access-control-allow-origin: *; without it the demos
// stop playing.
audio.crossOrigin = 'anonymous'
const pile = document.querySelector<HTMLElement>('.pile')
const meter = pile ? pileMeter(audio, pile) : undefined
let current: HTMLAnchorElement | undefined

const SKIP_S = 10

const nameOf = (play: HTMLAnchorElement) =>
  play.getAttribute('aria-label')!.replace(/^(Play|Pause) /, '')

const waveOf = (play: HTMLAnchorElement) =>
  play.closest('.track')!.querySelector<HTMLElement>('.wave')!

function show(play: HTMLAnchorElement, on: boolean) {
  play.toggleAttribute('data-on', on)
  play.setAttribute('aria-label', `${on ? 'Pause' : 'Play'} ${nameOf(play)}`)
}

function stop() {
  if (current !== undefined) {
    show(current, false)
    waveOf(current).style.removeProperty('--done')
  }
}

function start(play: HTMLAnchorElement) {
  if (current !== play) {
    stop()
    current = play
    audio.src = play.href
  }
  show(play, true)
  meter?.start()
  audio.play().catch(() => {
    show(play, false)
    meter?.stop()
  })
}

for (const play of document.querySelectorAll<HTMLAnchorElement>('.play')) {
  play.addEventListener('click', event => {
    event.preventDefault()
    if (current === play && !audio.paused) audio.pause()
    else start(play)
  })
  play.addEventListener('keydown', event => {
    const step =
      event.key === 'ArrowRight'
        ? SKIP_S
        : event.key === 'ArrowLeft'
          ? -SKIP_S
          : 0
    if (step !== 0 && current === play && audio.duration) {
      event.preventDefault()
      audio.currentTime = Math.min(
        audio.duration,
        Math.max(0, audio.currentTime + step),
      )
    }
  })
  const wave = waveOf(play)
  wave.addEventListener('click', event => {
    const box = wave.getBoundingClientRect()
    const fraction = Math.min(
      1,
      Math.max(0, (event.clientX - box.left) / box.width),
    )
    const seek = () => {
      audio.currentTime = fraction * audio.duration
    }
    start(play)
    if (audio.readyState > 0) seek()
    else audio.addEventListener('loadedmetadata', seek, { once: true })
  })
}

audio.addEventListener('pause', () => {
  meter?.stop()
  if (current !== undefined) show(current, false)
})

audio.addEventListener('timeupdate', () => {
  if (current !== undefined && audio.duration)
    waveOf(current).style.setProperty(
      '--done',
      `${(audio.currentTime / audio.duration) * 100}%`,
    )
})

audio.addEventListener('ended', () => {
  meter?.stop()
  stop()
  audio.currentTime = 0
})
