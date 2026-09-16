import { engine } from '../engine/engine'
import { readSession, writeSession } from './persist'

// Which of the two machines were running, kept for the length of the tab.
//
// The address bar mirrors the board and stops there, deliberately: a link is a
// circuit somebody was sent, and a circuit that breaks into the demo song on
// arrival is a toy rather than an instrument. Your own reload is the other case
// — every knob comes back where you left it, so a board that was playing came
// back looking exactly like the one that had been making a noise a second ago
// and was silent, with nothing on screen to say why.
//
// So the run lines ride in the tab's own storage rather than in the link: a
// reload picks them up, a tab that has not been here has nothing to pick up,
// and the tab beside this one is a second machine. Audio still waits for a
// gesture, so what a restored run line means is that the click that powers the
// page on starts the same thing that was playing before.
//
// Whether the shelf had anything on it is worth knowing on its own, which is
// what keepRunState hands back. The address bar carries every board now, so a
// hash naming one says nothing about where it came from — but a tab with no run
// state on it has never run this app, and that is a board that arrived from
// outside rather than your own reload.
const KEY = 'bender.run'

interface RunState {
  song: boolean
  drums: boolean
}

function stored(): RunState | null {
  const raw = readSession(KEY)
  if (raw === null) return null
  try {
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return null
    const { song, drums } = v as Partial<RunState>
    if (typeof song !== 'boolean' || typeof drums !== 'boolean') return null
    return { song, drums }
  } catch {
    return null
  }
}

/** Puts back what this tab was running, keeps the shelf up to date after, and
    answers whether the tab had been here before. */
export function keepRunState(): boolean {
  const was = stored()
  if (was) {
    engine.setSongPlaying(was.song)
    engine.setDrumsPlaying(was.drums)
  }
  const save = () =>
    writeSession(
      KEY,
      JSON.stringify({
        song: engine.songPlaying.get(),
        drums: engine.drumsPlaying.get(),
      }),
    )
  // On the way in as well as on every change, so a tab where you turned knobs
  // and never pressed play still counts as a tab that has been here.
  save()
  engine.songPlaying.subscribe(save)
  engine.drumsPlaying.subscribe(save)
  return was !== null
}
