import styles from './Diagram.module.css'

/** Room the parent drawing adds under itself for the cone's title. */
export const CONE_H = 20

// Two dashed lines flaring from the foot of the parts a close-up draws down to
// the close-up's own top corners, with its title between them. The parent
// drawing runs this to its own bottom edge and the close-up sits flush below.
export function ZoomCone({
  from,
  to,
  top,
  bottom,
  title,
}: {
  from: { x: number; w: number }
  /** The close-up's own span across the drawing. */
  to: { x: number; w: number }
  top: number
  bottom: number
  title: string
}) {
  return (
    <g>
      <path
        d={`M${from.x} ${top} L${to.x + 0.5} ${bottom}`}
        className={styles.wireDash}
      />
      <path
        d={`M${from.x + from.w} ${top} L${to.x + to.w - 0.5} ${bottom}`}
        className={styles.wireDash}
      />
      <text
        x={to.x + to.w / 2}
        y={bottom - 5}
        textAnchor="middle"
        className={styles.note}
      >
        {title}
      </text>
    </g>
  )
}
