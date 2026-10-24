import { AddMenu } from './AddMenu.tsx'
import { bench, setBench } from './bench.ts'
import { switchOn } from './bendChain.ts'
import { BENDS } from './controls/index.ts'
import { useStoreValue } from './ControlsContext.ts'
import { add } from './fitted.ts'
import styles from './Instruments.module.css'

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

// Puts the bend's face on the bench, slots the bend into the chain if it is in
// no position, and brings its mix up so the face is not born silent.
function bringUp(stage: string) {
  switchOn(stage)
  add([stage])
  const { bends } = bench.get()
  setBench({ ...bench.get(), bends: [...bends, stage] })
}

export function AddBend() {
  const { bends } = useStoreValue(bench)
  const choices = BENDS.filter(b => !bends.includes(b.group)).map(b => ({
    stage: b.group,
    kind: KIND[b.group]!,
  }))
  return (
    <AddMenu
      className={styles.add}
      text="Add bend"
      choices={choices}
      onPick={bringUp}
    />
  )
}
