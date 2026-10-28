import { Jack } from './BenchJack.tsx'
import { rewire } from './benchStores.ts'
import { useBoardValue } from './ControlsContext.ts'
import styles from './GateCables.module.css'
import {
  aimCv,
  cableSays,
  cvFacing,
  destName,
  destsOf,
  modCables,
  sourcePlate,
  shortDest,
  sourceName,
  spareWire,
} from './modCables.ts'
import { Tip } from './Tip.tsx'

import type { Machine } from './connections.ts'

export function ModOut({ src }: { src: number }) {
  const full = useBoardValue(c => spareWire(c) < 0)
  const name = sourceName(src)
  return (
    <Tip
      text={
        full
          ? `The patch bay’s ${name}. All four of the bay’s cables are in use, so pull one before patching another`
          : `The patch bay’s ${name}. Drag a cable from here to a machine’s CV jack, or press here and then on that jack, and it moves that machine`
      }
    >
      <Jack
        end={{ line: 'mod', side: 'out', id: String(src) }}
        className={styles.modOut}
        label={`${name} out`}
        full={full}
      >
        <span className={styles.plateName}>{sourcePlate(src)}</span>
      </Jack>
    </Tip>
  )
}

/** Where the last cable into a CV jack lands, as a short legend over a picker
    holding every destination the bay reaches on that machine. */
function CvDest({
  machine,
  wire,
  dest,
  onPlate,
}: {
  machine: Machine
  wire: number
  dest: number
  onPlate: boolean
}) {
  return (
    <label className={onPlate ? styles.plateDest : styles.cvDest}>
      {shortDest(dest)}
      <select
        className={styles.destPick}
        aria-label={`${machine} CV lands on`}
        title={`Lands on ${destName(dest)}`}
        value={dest}
        onChange={e => rewire(c => aimCv(c, wire, Number(e.target.value)))}
      >
        {destsOf(machine).map(d => (
          <option key={d} value={d}>
            {destName(d)}
          </option>
        ))}
      </select>
    </label>
  )
}

/** A machine's CV input. Pressing it pulls the last cable in, or patches the
    bay's LFO in while it is empty. */
export function CvJack({ machine }: { machine: Machine }) {
  const says = useBoardValue(c =>
    modCables(c)
      .filter(m => m.machine === machine)
      .map(cableSays)
      .join('. '),
  )
  const last = useBoardValue(c => {
    const m = modCables(c).findLast(each => each.machine === machine)
    return m ? `${m.wire}:${m.dest}` : ''
  })
  const onPlate = cvFacing(machine) === 'up'
  const [wire, dest] = last.split(':').map(Number)
  const jack = (
    <Tip
      text={
        says
          ? `${says}. Press to pull the last cable, or drag it to another CV jack`
          : `${machine}’s CV input. Press to patch the bay’s LFO in, or drag a cable here from the MOD plate`
      }
    >
      <Jack
        end={{ line: 'mod', side: 'in', id: machine }}
        className={onPlate ? styles.plateJack : styles.cv}
        label={`${machine} CV`}
      >
        {!onPlate && !last && <span className={styles.legend}>cv</span>}
      </Jack>
    </Tip>
  )
  const legend = last ? (
    <CvDest machine={machine} wire={wire!} dest={dest!} onPlate={onPlate} />
  ) : (
    onPlate && <span className={styles.plateName}>cv</span>
  )
  return onPlate ? (
    <span className={styles.kitCv}>
      {jack}
      {legend}
    </span>
  ) : (
    <>
      {jack}
      {legend}
    </>
  )
}
