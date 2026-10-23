import { engine } from '../engine/engine.ts'
import chip from './ChipLook.module.css'
import { sliderFor } from './controls/index.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import { useSelectedBox, useOpensOnAim } from './diagram.ts'
import { BoxRows } from './DiagramParts.tsx'
import styles from './PatchBay.module.css'
import { coherePatch, wireFault } from './presets/patch.ts'
import { StepLanes } from './StepLanes.tsx'
import { Tip } from './Tip.tsx'

const SRC = sliderFor('mod0Src').choices!
const DEST = sliderFor('mod0Dest').choices!
// Where the 'wire N depth' destinations start in the list — a wire patched
// here reaches no stage at all, only another wire's own push, which is the
// one thing on this bay that closes a loop on itself.
const WIRE_DEPTH_AT = DEST.indexOf('wire 1 depth')

const MOD_KEYS = ([0, 1, 2, 3] as const).map(i => ({
  src: `mod${i}Src` as const,
  dest: `mod${i}Dest` as const,
  depth: `mod${i}Depth` as const,
}))

// Sources that are a sequencer running rather than a control being up. Nothing
// in the bay can tell you about those — a stopped kit is not a setting — so the
// picture says it where the picture is, and the transport says it.
const WAITS_ON_KIT = new Set([
  SRC.indexOf('drum hit'),
  SRC.indexOf('lane A'),
  SRC.indexOf('lane B'),
])
const WAITS_ON_SONG = SRC.indexOf('ROM step')

const NUM_X = 2
const SRC_X = 14
const SRC_W = 54
const DEST_X = SRC_X + SRC_W + 30
const DEST_W = 132
const ROW_H = 20
const STEP = ROW_H + 8
const TOP = 6
const LOOP_X = DEST_X + DEST_W + 12
// With nothing soldered the four leads stand in one row, each a source box.
const SLOT = SRC_X + SRC_W + 6

const rowY = (i: number) => TOP + i * STEP
const cy = (y: number) => y + ROW_H / 2

// Four wires as four short leads: a source box, a line coloured by sign and
// dashed when nothing is patched, and a destination box. A destination that is
// another wire's depth gets a curved lead out to that wire's row. Pressing a
// wire opens its from, to and depth rows underneath.
const HOLDS = MOD_KEYS.map((k, i) => ({
  id: String(i),
  keys: [k.src, k.dest, k.depth],
}))

export function PatchBay() {
  const pick = useSelectedBox()
  useOpensOnAim(pick, HOLDS)
  const raw = useBoardValue(c =>
    MOD_KEYS.flatMap(k => [c[k.src], c[k.dest], c[k.depth]]).join(','),
  )
  // One string rather than four, for the same reason the values come back as
  // one: a fresh array off every write is a redraw every frame a morph runs.
  const faults = useBoardValue(c =>
    [0, 1, 2, 3].map(i => wireFault(c, i) ?? '').join('|'),
  ).split('|')
  const drums = useStoreValue(engine.drumsPlaying)
  const song = useStoreValue(engine.songPlaying)
  const dead = faults.filter(Boolean).length
  const nums = raw.split(',').map(Number)
  const wires = [0, 1, 2, 3].map(i => ({
    src: Math.round(nums[i * 3]!),
    dest: Math.round(nums[i * 3 + 1]!),
    depth: nums[i * 3 + 2]!,
  }))

  // The bay's other door, counted: every control one of these wires can land on
  // carries a `+ mod` of its own, and somebody who found the bay first has no
  // way to know that. Said here because this is where the four are drawn, and
  // how many are left is the same sentence.
  const free = wires.filter(w => w.src === 0).length
  const spare =
    free === 0
      ? 'All four wires are soldered. Each says so on the row it is on.'
      : `${free === 4 ? 'All four' : `${free} of the four`} wires ${free === 1 ? 'is' : 'are'} free — press + mod on any control row the bay can reach to solder one there.`

  const open =
    pick.selected === null ? undefined : MOD_KEYS[Number(pick.selected)]
  const bare = free === 4
  const height = (bare ? TOP : rowY(3)) + ROW_H + 8

  return (
    <>
      <div className={`${chip.chips} ${styles.bay}`}>
        <svg
          className={styles.diagram}
          style={bare ? { maxWidth: SLOT * 4 } : undefined}
          viewBox={`0 0 ${bare ? SLOT * 4 : LOOP_X + 20} ${height}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {wires.map((w, i) => {
            const y = bare ? TOP : rowY(i)
            const y0 = cy(y)
            const patched = w.src > 0
            const live = patched && w.depth !== 0
            const wire = !live
              ? 'var(--fg4)'
              : w.depth < 0
                ? 'var(--cool)'
                : 'var(--accent)'
            const toWire =
              patched && w.dest >= WIRE_DEPTH_AT && w.dest < WIRE_DEPTH_AT + 4
            // What the wire is, then what is wrong with it: a lead that reads as
            // patched and does nothing is the one thing four rows of choices can
            // never tell you, and this is where somebody is already looking.
            const waiting =
              (WAITS_ON_KIT.has(w.src) &&
                !drums &&
                ' The kit is stopped, so this carries only when something else hits it.') ||
              (w.src === WAITS_ON_SONG &&
                !song &&
                ' The song is stopped, so the step counter is holding still.') ||
              ''
            const title = !patched
              ? `Wire ${i + 1} — nothing plugged in.`
              : `${SRC[w.src]} → ${DEST[w.dest]}, ${
                  w.depth === 0
                    ? 'depth at 0'
                    : `${Math.abs(w.depth).toFixed(2)} ${w.depth < 0 ? 'flipped' : 'straight'}`
                }.${faults[i] ? ` This wire ${faults[i]}.` : ''}${waiting}`
            return (
              <g
                key={i}
                transform={bare ? `translate(${i * SLOT} 0)` : undefined}
                className={styles.wire}
                role="button"
                tabIndex={0}
                aria-pressed={pick.selected === String(i)}
                aria-label={`wire ${i + 1} controls`}
                onClick={() => pick.toggle(String(i))}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    pick.toggle(String(i))
                  }
                }}
              >
                <title>{title}</title>
                <rect
                  x={NUM_X - 2}
                  y={y - 3}
                  width={(bare ? SLOT - 4 : LOOP_X) - NUM_X}
                  height={ROW_H + 6}
                  rx={5}
                  className={
                    pick.selected === String(i) ? styles.hitOn : styles.hit
                  }
                />
                <g opacity={live ? 1 : 0.55}>
                  <text x={NUM_X} y={y0 + 4} className={styles.num}>
                    {i + 1}
                  </text>
                  <rect
                    x={SRC_X}
                    y={y}
                    width={SRC_W}
                    height={ROW_H}
                    rx={3}
                    fill="none"
                    stroke={patched ? wire : 'var(--fg4)'}
                    strokeDasharray={patched ? undefined : '3 2'}
                  />
                  <text
                    x={SRC_X + SRC_W / 2}
                    y={y0 + 4}
                    textAnchor="middle"
                    className={styles.label}
                    fill={patched ? 'var(--fg)' : 'var(--fg4)'}
                  >
                    {patched ? SRC[w.src] : 'unwired'}
                  </text>
                  {patched && (
                    <>
                      <line
                        x1={SRC_X + SRC_W}
                        y1={y0}
                        x2={DEST_X - 5}
                        y2={y0}
                        stroke={wire}
                        strokeWidth={live ? 1.5 : 1}
                        strokeDasharray={live ? undefined : '2 2'}
                      />
                      <path
                        d={`M ${DEST_X - 5} ${y0 - 3} L ${DEST_X} ${y0} L ${DEST_X - 5} ${y0 + 3}`}
                        fill="none"
                        stroke={wire}
                        strokeWidth={1.5}
                      />
                      <rect
                        x={DEST_X}
                        y={y}
                        width={DEST_W}
                        height={ROW_H}
                        rx={3}
                        fill="none"
                        stroke={wire}
                        strokeDasharray={toWire ? '3 2' : undefined}
                      />
                      <text
                        x={DEST_X + DEST_W / 2}
                        y={y0 + 4}
                        textAnchor="middle"
                        className={styles.label}
                        fill={live ? 'var(--fg)' : 'var(--fg3)'}
                      >
                        {DEST[w.dest]}
                      </text>
                    </>
                  )}
                </g>
              </g>
            )
          })}

          {wires.map((w, i) => {
            const patched = w.src > 0
            if (
              !patched ||
              w.dest < WIRE_DEPTH_AT ||
              w.dest >= WIRE_DEPTH_AT + 4
            )
              return null
            const target = w.dest - WIRE_DEPTH_AT
            const y0 = cy(rowY(i))
            const yT = cy(rowY(target))
            return (
              <path
                key={`loop${i}`}
                d={`M ${DEST_X + DEST_W} ${y0} C ${LOOP_X} ${y0} ${LOOP_X} ${yT} ${DEST_X + DEST_W} ${yT}`}
                fill="none"
                stroke="var(--cool)"
                strokeWidth={1.3}
                strokeDasharray="3 2"
              />
            )
          })}
        </svg>
      </div>
      <BoxRows inOrder keys={open && [open.src, open.dest, open.depth]} />
      <StepLanes />
      {!open && (
        <span className={styles.spare}>
          Press a wire to open its from, to and depth.
        </span>
      )}
      <span className={styles.spare}>{spare}</span>
      {dead > 0 && (
        <Tip
          text={`${faults
            .flatMap((f, i) => (f ? [`Wire ${i + 1} ${f}`] : []))
            .join(
              ' ',
            )} Pressing this moves the loose end onto something the board is running — it turns nothing up, so the stages stay where you left them.`}
        >
          <button
            className={styles.dead}
            onClick={() => {
              engine.armStep()
              engine.writeBoard(
                coherePatch(engine.controls.get(), Math.random, {
                  wake: false,
                }),
              )
            }}
          >
            {dead === 1
              ? 'one wire reaches nothing — solder it somewhere'
              : `${dead} wires reach nothing — solder them somewhere`}
          </button>
        </Tip>
      )}
    </>
  )
}
