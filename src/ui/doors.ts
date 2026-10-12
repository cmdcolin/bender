import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { demos } from '../home/demos'
import { SCENARIOS } from './presets/scenarios'
import { PRESETS } from './presets/table'
import { boardFromUrl } from './share'

// The ways in a fresh tab offers before anything plays. Each door hands back
// the board it opens onto, from stock.
export interface Door {
  name: string
  says: string
  board: () => Partial<Controls>
}

function fromPreset(name: string, presetName: string): Door {
  const found = PRESETS.find(p => p.name === presetName)
  if (!found) throw new Error(`no preset named ${presetName}`)
  return { name, says: found.blurb, board: () => found.patch }
}

function fromDemo(name: string, demoName: string): Door {
  const found = demos.find(d => d.name === demoName)
  if (!found) throw new Error(`no demo named ${demoName}`)
  return {
    name,
    says: found.says,
    board: () => boardFromUrl('', `#${found.query}`) ?? {},
  }
}

const ROLLS = ['let it age', 'cascade', 'knife', 'rewire', 'wreck it'].map(
  name => {
    const found = SCENARIOS.find(s => s.name === name)
    if (!found) throw new Error(`no scenario named ${name}`)
    return found
  },
)

const pick = <T>(from: T[]) => from[Math.floor(Math.random() * from.length)]!

const STARTS = [
  fromPreset('a drone', 'under the floor'),
  fromDemo('dub drums', 'More dubby drum with wandering synth'),
  fromDemo('a glitching voice', 'Glitch voice'),
]

export const DOORS: Door[] = [
  ...STARTS,
  {
    name: 'roll the dice',
    says: 'One of the boards above, then aged, rewired, cut or wrecked at random. A different board every time',
    board: () =>
      pick(ROLLS).roll(
        { ...DEFAULT_CONTROLS, ...pick(STARTS).board() },
        Math.random,
      ),
  },
]
