import { MACHINES } from '../machines.ts'
import { useMeterValue } from './ControlsContext.ts'
import { Faceplate } from './Faceplate.tsx'
import { position } from './meterScale.ts'
import { PhraseBox } from './PhraseBox.tsx'
import styles from './PrattleFace.module.css'

const TAP = MACHINES.findIndex(m => m.name === 'Prattle')

const RINGS = [1, 6, 12, 18]
const PITCH = 9.5
const HOLES = RINGS.flatMap((n, ring) =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * (i + ring / 2)) / n
    return {
      ring,
      x: Math.cos(a) * ring * PITCH,
      y: Math.sin(a) * ring * PITCH,
    }
  }),
)

/** The talking toy's speaker, its holes lit from the middle out by what
    Prattle is saying. */
function Grille() {
  const lit = useMeterValue(m =>
    Math.ceil(position(m.taps[TAP] ?? 0) * RINGS.length),
  )
  return (
    <svg className={styles.grille} viewBox="-40 -40 80 80" aria-hidden="true">
      <circle className={styles.rim} r={38} />
      {HOLES.map(({ ring, x, y }) => (
        <circle
          key={`${x},${y}`}
          className={ring < lit ? styles.lit : styles.hole}
          cx={x}
          cy={y}
          r={2.8}
        />
      ))}
    </svg>
  )
}

export function PrattleFace({
  seconds,
  onClose,
}: {
  seconds?: number
  onClose?: () => void
}) {
  return (
    <Faceplate stage="Prattle" seconds={seconds} onClose={onClose}>
      <div className={styles.body}>
        <Grille />
        <PhraseBox />
      </div>
    </Faceplate>
  )
}
