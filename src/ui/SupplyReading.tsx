import { SUPPLY } from '../dsp/supplies.ts'
import { machinesOn, sharedLoads } from './controls/supply.ts'
import { useBoardValue } from './ControlsContext.ts'
import { RailLamp } from './RailLamp.tsx'
import styles from './SupplyReading.module.css'

const list = (names: string[]) =>
  names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

// Each supply's voltage at the head of its own panel, with the machines it
// feeds named beside it. The lamp on each deck reads whichever one that
// machine runs off.
export function SupplyReading() {
  const shared = useBoardValue(c => list(machinesOn(c, SUPPLY.shared)))
  const second = useBoardValue(c => list(machinesOn(c, SUPPLY.second)))
  const bench = useBoardValue(c => list(machinesOn(c, SUPPLY.bench)))
  const all = useBoardValue(c => machinesOn(c, SUPPLY.shared).length === 5)
  const loads = useBoardValue(c => list(sharedLoads(c)))

  return (
    <div className={styles.readings}>
      <div className={styles.reading}>
        <RailLamp />
        <p className={styles.feeds}>
          {all
            ? 'Feeds Plinky, Clatter, Glint, Parlor and Growler. Every knob here sags all five at once, until a machine’s Supply moves it off these cells.'
            : shared
              ? `Feeds ${shared}.`
              : 'Feeds nothing: every machine is on other supplies.'}
        </p>
      </div>
      {loads && <p className={styles.loads}>Also sagged by {loads}.</p>}
      {second && (
        <div className={styles.reading}>
          <RailLamp cells={SUPPLY.second} />
          <p className={styles.feeds}>Second cells feed {second}.</p>
        </div>
      )}
      {bench && <p className={styles.feeds}>On the bench supply: {bench}.</p>}
    </div>
  )
}
