const audio = new Audio()
let current: HTMLAnchorElement | undefined

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
  audio.play().catch(() => {
    show(play, false)
  })
}

for (const play of document.querySelectorAll<HTMLAnchorElement>('.play')) {
  play.addEventListener('click', event => {
    event.preventDefault()
    if (current === play && !audio.paused) audio.pause()
    else start(play)
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
  stop()
  audio.currentTime = 0
})
