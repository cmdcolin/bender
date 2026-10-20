import styles from './Diagram.module.css'

export const ROLL_GLYPH_W = 16
const ROLL_GLYPH_H = 12
const ROLL_NOTES = [
  [2, 8, 4],
  [6, 5, 5],
  [11, 2, 3],
] as const

// Three notes climbing across a frame, for a box that opens a piano roll. The
// glyph uses paths, since ChipLook.module.css repaints every rect inside a
// pressed box.
export function rollGlyph(x: number, mid: number) {
  const y = mid - ROLL_GLYPH_H / 2
  return (
    <>
      <path
        d={`M${x} ${y} h${ROLL_GLYPH_W} v${ROLL_GLYPH_H} h${-ROLL_GLYPH_W} Z`}
        className={styles.glyphLine}
      />
      <path
        d={ROLL_NOTES.map(
          ([dx, dy, w]) => `M${x + dx} ${y + dy} h${w} v2 h${-w} Z`,
        ).join(' ')}
        className={styles.glyphFill}
      />
    </>
  )
}
