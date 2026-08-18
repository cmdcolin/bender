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
// reload picks them up, a pasted link never has them, and the tab beside this
// one is a second machine. Audio still waits for a gesture, so what a restored
// run line means is that the click that powers the page on starts the same thing
// that was playing before.
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

/** Put back what this tab was running, and keep the shelf up to date after. */
export function keepRunState() {
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
  engine.songPlaying.subscribe(save)
  engine.drumsPlaying.subscribe(save)
}
