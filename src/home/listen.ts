const audio = new Audio()
let current: HTMLAnchorElement | undefined

const nameOf = (play: HTMLAnchorElement) =>
  play.getAttribute('aria-label')!.replace(/^(Play|Pause) /, '')

function fillOf(play: HTMLAnchorElement) {
  return play.closest('.track')!.querySelector<HTMLElement>('.fill')!
}

function show(play: HTMLAnchorElement, on: boolean) {
  play.toggleAttribute('data-on', on)
  play.setAttribute('aria-label', `${on ? 'Pause' : 'Play'} ${nameOf(play)}`)
}

function stop() {
  if (current === undefined) return
  show(current, false)
  fillOf(current).style.transform = ''
}

for (const play of document.querySelectorAll<HTMLAnchorElement>('.play')) {
  play.addEventListener('click', event => {
    event.preventDefault()
    if (current === play && !audio.paused) {
      audio.pause()
      return
    }
    if (current !== play) {
      stop()
      current = play
      audio.src = play.href
    }
    show(play, true)
    audio.play().catch(() => {
      show(play, false)
    })
  })
}

audio.addEventListener('pause', () => {
  if (current !== undefined) show(current, false)
})

audio.addEventListener('timeupdate', () => {
  if (current === undefined || !audio.duration) return
  fillOf(current).style.transform =
    `scaleX(${audio.currentTime / audio.duration})`
})

audio.addEventListener('ended', () => {
  stop()
  audio.currentTime = 0
})
