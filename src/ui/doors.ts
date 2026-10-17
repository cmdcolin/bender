import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { demos } from '../home/demos.ts'
import { SCENARIOS } from './presets/scenarios.ts'
import { PRESETS } from './presets/table.ts'
import { boardFromUrl } from './share.ts'

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

function fromDemo(name: string, demoName: string, says: string): Door {
  const found = demos.find(d => d.name === demoName)
  if (!found) throw new Error(`no demo named ${demoName}`)
  return {
    name,
    says,
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
  fromDemo(
    'dub drums',
    'More dubby drum with wandering synth',
    'The kit swung at 162 bpm with its trigger lines crossed, an FM voice on a faulted address line, and three feedback loops.',
  ),
  fromDemo(
    'a glitching voice',
    'Glitch voice',
    'The FM chip struck by the kit through the trigger patch, into a sampler loop that keeps recording over itself.',
  ),
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
