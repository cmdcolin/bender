import { engine } from '../engine/engine.ts'
import { AddMenu } from './AddMenu.tsx'
import { BEND_SLOT_KEYS, BENDS } from './controls/index.ts'
import { useBoardValue } from './ControlsContext.ts'
import { add } from './fitted.ts'
import styles from './Instruments.module.css'

import type { Controls } from '../controls.ts'

const ADDED_MIX = 0.5

const KIND: Record<string, string> = {
  'Ring mod': 'ring modulator',
  Crusher: 'bit crusher',
  Clipper: 'distortion',
  Comb: 'comb filter',
  'Glitch buffer': 'stutter',
  'Screech filter': 'resonant filter',
  'Freq shifter': 'frequency shifter',
  Octave: 'octave sub and up',
}

const inChain = (c: Controls, id: number) =>
  BEND_SLOT_KEYS.some(k => Math.round(c[k]) === id)

/** Puts a bend in the first empty position, or trades out the last one when
    the chain is full, and brings its mix up so the bend is heard. */
function bringIn(group: string, onOpen: (stage: string) => void) {
  const id = BENDS.findIndex(b => b.group === group) + 1
  const board = engine.controls.get()
  const empty = BEND_SLOT_KEYS.findIndex(k => Math.round(board[k]) === 0)
  const slot = BEND_SLOT_KEYS[empty === -1 ? BEND_SLOT_KEYS.length - 1 : empty]!
  const mix = BENDS[id - 1]!.mix
  engine.armStep()
  engine.writeBoard({
    ...board,
    [slot]: id,
    ...(board[mix] === 0 && { [mix]: ADDED_MIX }),
  })
  add([group])
  onOpen(group)
}

export function AddBend({ onOpen }: { onOpen: (stage: string) => void }) {
  const left = useBoardValue(c =>
    BENDS.filter((_, i) => !inChain(c, i + 1))
      .map(b => b.group)
      .join('|'),
  )
  const choices = left
    ? left.split('|').map(stage => ({ stage, kind: KIND[stage]! }))
    : []
  return (
    <AddMenu
      className={styles.add}
      text="Add bend"
      choices={choices}
      onPick={stage => bringIn(stage, onOpen)}
    />
  )
}
