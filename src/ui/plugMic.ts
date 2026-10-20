import { engine } from '../engine/engine.ts'
import { gateOff, GATES } from './chain-map.ts'
import { sliderFor } from './controls/index.ts'
import { add } from './fitted.ts'
import { MIC_JACKS } from './micWiring.ts'

const MIC_LEVEL = 1
const WOKEN = 0.6

const noop = () => {}

// A jack on a stage whose level or mix sits at zero does nothing you can hear,
// so plugging in raises the first of them.
function wake(stage: string) {
  const keys = GATES[stage]
  if (!keys) return
  const c = engine.controls.get()
  if (keys.some(k => c[k] !== gateOff(k))) return
  const def = sliderFor(keys[0]!)
  engine.set(keys[0]!, WOKEN * (def.normal?.[1] ?? def.max))
}

function listen() {
  if (engine.controls.get().micLevel === 0) engine.set('micLevel', MIC_LEVEL)
  engine
    .start()
    .then(() => engine.enableMic())
    .catch(noop)
}

/** Opens the mic, solders it to a jack, and turns up the mic and the stage the
    jack sits on if either is at zero. One undo step. */
export function plugMic(jack: number) {
  const { stage } = MIC_JACKS[jack]!
  engine.armStep()
  engine.set('micPatch', jack)
  if (stage !== 'mix') {
    wake(stage)
    add(['Mic', stage])
  } else add(['Mic'])
  listen()
}

/** Opens the mic, turning it up from zero, or closes it. */
export function toggleMic() {
  if (engine.micOn.get()) {
    engine.disableMic()
    return
  }
  engine.armStep()
  listen()
}
