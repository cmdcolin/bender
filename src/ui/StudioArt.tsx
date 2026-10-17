import styles from './StudioArt.module.css'

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

export function Cassette({ running }: { running: boolean }) {
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
        className={styles.stripe}
      />
      <line x1="32" y1="18" x2="104" y2="18" className={styles.ruling} />
      <line x1="15" y1="30" x2="104" y2="30" className={styles.ruling} />
      <rect
        x="30"
        y="40"
        width="60"
        height="22"
        rx="3"
        className={styles.window}
      />
      <CassetteHub cx={45} cy={51} running={running} />
      <CassetteHub cx={75} cy={51} running={running} />
      <path d="M32 72 L38 64.5 L82 64.5 L88 72 Z" className={styles.window} />
      <circle cx="47" cy="69" r="1.6" className={styles.hole} />
      <circle cx="73" cy="69" r="1.6" className={styles.hole} />
      <circle cx="8" cy="8" r="1.6" className={styles.screw} />
      <circle cx="112" cy="8" r="1.6" className={styles.screw} />
      <circle cx="8" cy="68" r="1.6" className={styles.screw} />
      <circle cx="112" cy="68" r="1.6" className={styles.screw} />
    </svg>
  )
}

const REELS = [34, 106] as const
const REEL_Y = 30
const FLANGE = 19
const PACK = 14
const GUIDES = [52, 88] as const
const GUIDE_Y = 63

function Reel({
  cx,
  loaded,
  running,
  hot,
}: {
  cx: number
  loaded: boolean
  running: boolean
  hot: boolean
}) {
  return (
    <g>
      {loaded && (
        <circle cx={cx} cy={REEL_Y} r={PACK} className={styles.tapePack} />
      )}
      <g
        className={turns(running)}
        style={{ transformOrigin: `${cx}px ${REEL_Y}px` }}
      >
        <circle
          cx={cx}
          cy={REEL_Y}
          r={FLANGE}
          className={hot ? styles.flangeHot : styles.flange}
        />
        {angles(3).map(a => (
          <line
            key={a}
            x1={cx}
            y1={REEL_Y - 6}
            x2={cx}
            y2={REEL_Y - FLANGE + 1}
            className={styles.reelSpoke}
            transform={`rotate(${a} ${cx} ${REEL_Y})`}
          />
        ))}
        <circle cx={cx} cy={REEL_Y} r={6} className={styles.hub} />
      </g>
      <circle cx={cx} cy={REEL_Y} r={1.6} className={styles.spindle} />
    </g>
  )
}

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
  const bottom = REEL_Y + PACK
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
      {name && (
        <path
          d={`M${REELS[0]} ${bottom} L${GUIDES[0]} ${GUIDE_Y} L${GUIDES[1]} ${GUIDE_Y} L${REELS[1]} ${bottom}`}
          className={styles.tape}
        />
      )}
      {REELS.map(cx => (
        <Reel key={cx} cx={cx} loaded={!!name} running={running} hot={hot} />
      ))}
      {GUIDES.map(cx => (
        <circle key={cx} cx={cx} cy={GUIDE_Y} r={3} className={styles.guide} />
      ))}
      <rect
        x="60"
        y="65"
        width="20"
        height="8"
        rx="1.5"
        className={styles.headBlock}
      />
      {[63, 68.5, 74].map(x => (
        <rect
          key={x}
          x={x}
          y="66.5"
          width="3"
          height="5"
          className={styles.head}
        />
      ))}
      <rect
        x="12"
        y="76"
        width="116"
        height="11"
        rx="2"
        className={styles.paper}
      />
      <text x="70" y="84" className={name ? styles.deckText : styles.deckEmpty}>
        {shown ?? 'no tape'}
      </text>
    </svg>
  )
}
