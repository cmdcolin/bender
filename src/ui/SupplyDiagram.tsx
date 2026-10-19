import bus from './BusDiagram.module.css'
import chip from './ChipLook.module.css'
import { GROUPS } from './controls/index.ts'
import diagram from './Diagram.module.css'
import {
  boxWidth,
  glyphBoxWidth,
  ONE_LINE_H,
  useFlow,
  useReadings,
  useSelectedBox,
  type BoxSpec,
} from './diagram.ts'
import {
  BoxRows,
  BoxView,
  Diagram,
  GlyphBox,
  Label,
  Wire,
} from './DiagramParts.tsx'
import { slidersFirst } from './slidersFirst.ts'

const GROUP = GROUPS.find(g => g.name === 'Power supply')!

const keysOf = (part: string) =>
  slidersFirst(GROUP.sliders.filter(d => d.part === part)).map(d => d.key)

const CELLS = 'cells'
const BOX_KEYS = {
  [CELLS]: keysOf('the cells'),
  'reset chip': keysOf('the reset chip'),
  clip: keysOf('the clip'),
}
type BoxId = keyof typeof BOX_KEYS
const KEYS = Object.values(BOX_KEYS).flat()

const isBox = (id: string | null): id is BoxId => id !== null && id in BOX_KEYS

const HELP: Record<Exclude<BoxId, typeof CELLS>, string> = {
  'reset chip':
    'The chip that watches the rail and holds every machine in reset while it sits too low, and the latch-up that keeps them there.',
  clip: 'A paperclip dragged across the supply pads, biting the rail a few times a second.',
}

const TOP = 8
const BOX_H = ONE_LINE_H
const DROP = 24
const LOW = TOP + BOX_H + DROP
const HEIGHT = LOW + BOX_H + TOP
const GLYPH_W = 16
const GLYPH_H = 9
const RUN = 40
const TAIL = 64

// Two cells end to end, the positive nub on the right.
function batteryGlyph(x: number, mid: number) {
  const y = mid - GLYPH_H / 2
  const body = GLYPH_W - 2
  return (
    <>
      <rect
        x={x}
        y={y}
        width={body}
        height={GLYPH_H}
        rx={1}
        className={diagram.glyphLine}
      />
      <path
        d={`M${x + body / 2} ${y} V${y + GLYPH_H}`}
        className={diagram.glyphLine}
      />
      <path
        d={`M${x + body} ${mid - 2} h2 v4 h-2 Z`}
        className={diagram.glyphFill}
      />
    </>
  )
}

// The rail every machine runs off. The cells feed it through their leads, the
// reset chip watches it and the clip bites it.
export function SupplyDiagram() {
  const r = useReadings(KEYS)
  const pick = useSelectedBox(CELLS)
  const flow = useFlow()

  const cellsW = glyphBoxWidth(CELLS, GLYPH_W)
  const mid = TOP + BOX_H / 2
  const box = (id: Exclude<BoxId, typeof CELLS>, x: number): BoxSpec => ({
    id,
    keys: BOX_KEYS[id],
    x,
    y: LOW,
    w: boxWidth(id),
    h: BOX_H,
    name: id,
    touched: r.touched(...BOX_KEYS[id]),
    help: HELP[id],
  })
  const reset = box('reset chip', cellsW + RUN - boxWidth('reset chip') / 2)
  const clip = box('clip', reset.x + reset.w + RUN)
  const watchX = reset.x + reset.w / 2
  const biteX = clip.x + clip.w / 2
  const width = biteX + TAIL

  return (
    <>
      <div
        className={chip.chips}
        style={{ maxWidth: width + 2, marginInline: 'auto' }}
      >
        <Diagram
          width={width + 2}
          left={1}
          height={HEIGHT}
          label="power supply"
        >
          {arrow => (
            <>
              <Wire
                arrow={arrow}
                d={`M${cellsW} ${mid} H${width - 2}`}
                look={flow}
              />
              <Label x={width - 2} y={mid - 4} anchor="end">
                machines
              </Label>
              <Wire arrow={arrow} d={`M${watchX} ${mid} V${LOW}`} />
              <Wire arrow={arrow} d={`M${biteX} ${LOW} V${mid}`} />
              {[watchX, biteX].map(x => (
                <circle key={x} cx={x} cy={mid} r={1.6} className={bus.joint} />
              ))}
              <GlyphBox
                x={0}
                y={TOP}
                w={cellsW}
                h={BOX_H}
                name={CELLS}
                help="the batteries, their leads, the reservoir cap and the starve that drains them"
                lit={r.touched(...BOX_KEYS[CELLS])}
                selected={pick.selected === CELLS}
                onSelect={() => pick.toggle(CELLS)}
                glyphW={GLYPH_W}
                glyph={batteryGlyph}
              />
              {[reset, clip].map(b => (
                <BoxView
                  key={b.id}
                  box={b}
                  selected={b.id === pick.selected}
                  onSelect={pick.toggle}
                />
              ))}
            </>
          )}
        </Diagram>
      </div>
      <BoxRows
        hint="Press a box for its settings."
        keys={isBox(pick.selected) ? BOX_KEYS[pick.selected] : undefined}
      />
    </>
  )
}
