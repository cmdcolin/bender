import styles from './StudioArt.module.css'

import type { ReactNode } from 'react'

const turns = (running: boolean) => (running ? styles.spin : styles.still)

const angles = (count: number) =>
  Array.from({ length: count }, (_, i) => (360 / count) * i)

function CassetteHub({
  cx,
  cy,
  running,
}: {
  cx: number
  cy: number
  running: boolean
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={10} className={styles.tapePack} />
      <g
        className={turns(running)}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      >
        <circle cx={cx} cy={cy} r={6} className={styles.hub} />
        {angles(6).map(a => (
          <line
            key={a}
            x1={cx}
            y1={cy - 3}
            x2={cx}
            y2={cy - 6}
            className={styles.tooth}
            transform={`rotate(${a} ${cx} ${cy})`}
          />
        ))}
      </g>
    </g>
  )
}

export function Cassette({
  running,
  children,
}: {
  running: boolean
  children?: ReactNode
}) {
  return (
    <div className={styles.deck}>
      <svg
        className={styles.cassette}
        viewBox="0 0 120 76"
        role="img"
        aria-label="cassette"
      >
        <rect
          x="2"
          y="2"
          width="116"
          height="72"
          rx="6"
          className={styles.shell}
        />
        <rect
          x="10"
          y="8"
          width="100"
          height="28"
          rx="2"
          className={styles.paper}
        />
        <rect
          x="15"
          y="13"
          width="11"
          height="11"
          rx="2"
          className={running ? styles.stripeRec : styles.stripe}
        />
        <line x1="15" y1="30" x2="104" y2="30" className={styles.ruling} />
        <rect
          x="18"
          y="40"
          width="84"
          height="22"
          rx="3"
          className={styles.window}
        />
        <CassetteHub cx={36} cy={51} running={running} />
        <CassetteHub cx={84} cy={51} running={running} />
        <path d="M28 72 L36 64.5 L84 64.5 L92 72 Z" className={styles.window} />
        <circle cx="49" cy="69" r="1.6" className={styles.hole} />
        <circle cx="71" cy="69" r="1.6" className={styles.hole} />
        <circle cx="8" cy="8" r="1.6" className={styles.screw} />
        <circle cx="112" cy="8" r="1.6" className={styles.screw} />
        <circle cx="8" cy="68" r="1.6" className={styles.screw} />
        <circle cx="112" cy="68" r="1.6" className={styles.screw} />
      </svg>
      <div className={styles.label}>{children}</div>
    </div>
  )
}
