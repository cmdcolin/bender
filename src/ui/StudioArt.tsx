import styles from './StudioArt.module.css'

export function Cassette({ running }: { running: boolean }) {
  const reel = (cx: number) => (
    <g
      className={running ? styles.spin : styles.still}
      style={{ transformOrigin: `${cx}px 55px` }}
    >
      <circle cx={cx} cy={55} r={8} className={styles.hub} />
      {[0, 60, 120].map(a => (
        <line
          key={a}
          x1={cx}
          y1={55 - 7}
          x2={cx}
          y2={55 + 7}
          className={styles.spoke}
          transform={`rotate(${a} ${cx} 55)`}
        />
      ))}
    </g>
  )
  return (
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
        y="9"
        width="100"
        height="28"
        rx="2"
        className={styles.label}
      />
      <line x1="16" y1="20" x2="104" y2="20" className={styles.ruling} />
      <line x1="16" y1="28" x2="104" y2="28" className={styles.ruling} />
      <rect
        x="26"
        y="42"
        width="68"
        height="26"
        rx="13"
        className={styles.window}
      />
      {reel(46)}
      {reel(74)}
      <circle cx="8" cy="8" r="1.6" className={styles.screw} />
      <circle cx="112" cy="8" r="1.6" className={styles.screw} />
      <circle cx="8" cy="68" r="1.6" className={styles.screw} />
      <circle cx="112" cy="68" r="1.6" className={styles.screw} />
    </svg>
  )
}

export function Cartridge({
  name,
  hot,
}: {
  name: string | null
  hot: boolean
}) {
  const shown = name && name.length > 14 ? `${name.slice(0, 13)}…` : name
  return (
    <svg
      className={styles.cartridge}
      viewBox="0 0 96 76"
      role="img"
      aria-label="sample cartridge"
    >
      <g className={hot ? styles.inserted : styles.parked}>
        <path d="M12 6 H84 V54 H12 Z M12 6 V54" className={styles.shell} />
        <rect
          x="20"
          y="12"
          width="56"
          height="26"
          rx="2"
          className={styles.label}
        />
        <text x="48" y="29" className={styles.cartText}>
          {shown ?? 'sample'}
        </text>
        {[24, 32, 40, 48, 56, 64, 72].map(x => (
          <line
            key={x}
            x1={x}
            y1="44"
            x2={x}
            y2="52"
            className={styles.ruling}
          />
        ))}
      </g>
      <rect
        x="6"
        y="52"
        width="84"
        height="16"
        rx="2"
        className={styles.slot}
      />
    </svg>
  )
}
