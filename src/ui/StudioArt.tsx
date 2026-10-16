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

const DECK_REELS = [34, 106] as const

export function ReelDeck({
  name,
  running,
  hot,
}: {
  name: string | null
  running: boolean
  hot: boolean
}) {
  const shown = name && name.length > 20 ? `${name.slice(0, 19)}…` : name
  return (
    <svg
      className={styles.deck}
      viewBox="0 0 140 92"
      role="img"
      aria-label="reel-to-reel tape deck"
    >
      <rect
        x="2"
        y="2"
        width="136"
        height="88"
        rx="6"
        className={styles.shell}
      />
      <path
        d={`M${DECK_REELS[0]} 48 L52 63 L88 63 L${DECK_REELS[1]} 48`}
        className={styles.tape}
      />
      {DECK_REELS.map(cx => (
        <g key={cx}>
          <circle
            cx={cx}
            cy={30}
            r={18}
            className={hot ? styles.packHot : styles.pack}
          />
          <g
            className={running ? styles.spin : styles.still}
            style={{ transformOrigin: `${cx}px 30px` }}
          >
            <circle cx={cx} cy={30} r={7} className={styles.hub} />
            {[0, 60, 120].map(a => (
              <line
                key={a}
                x1={cx}
                y1={24}
                x2={cx}
                y2={36}
                className={styles.spoke}
                transform={`rotate(${a} ${cx} 30)`}
              />
            ))}
          </g>
        </g>
      ))}
      <circle cx="52" cy="63" r="2.5" className={styles.guide} />
      <circle cx="88" cy="63" r="2.5" className={styles.guide} />
      <rect
        x="63"
        y="64"
        width="14"
        height="7"
        rx="1"
        className={styles.head}
      />
      <rect
        x="12"
        y="74"
        width="116"
        height="12"
        rx="2"
        className={styles.label}
      />
      <text x="70" y="83" className={styles.deckText}>
        {shown ?? 'no tape'}
      </text>
    </svg>
  )
}
