import { SUPPLY } from '../dsp/supplies.ts'
import { SUPPLY_WIRED } from './cardWiring.ts'
import { ChipDrawing } from './ChipDrawing.tsx'
import { GROUPS } from './controls/index.ts'
import { machinesOn } from './controls/supply.ts'
import { useBoardValue } from './ControlsContext.ts'
import diagram from './Diagram.module.css'
import {
  boxWidth,
  glyphBoxWidth,
  ONE_LINE_H,
  useFlow,
  useReadings,
  useSelectedBox,
  type BoxSpec,
  card,
  useOpensOnAim,
  besideOf,
} from './diagram.ts'
import {
  Bend,
  BoxRows,
  BoxView,
  Dot,
  GlyphBox,
  Label,
  Wire,
} from './DiagramParts.tsx'
import { slidersFirst } from './slidersFirst.ts'

const GROUP = GROUPS.find(g => g.name === 'Power supply')!

const keysOf = (part: string) =>
  slidersFirst(GROUP.sliders.filter(d => d.part === part)).map(d => d.key)

const CELLS = 'cells'
const SECOND = 'second cells'
const BOX_KEYS = {
  [CELLS]: keysOf('the cells'),
  'reset chip': keysOf('the reset chip'),
  clip: keysOf('the clip'),
  [SECOND]: keysOf('second cells'),
}
type BoxId = keyof typeof BOX_KEYS
const KEYS = Object.values(BOX_KEYS).flat()

const isBox = (id: string | null): id is BoxId => id !== null && id in BOX_KEYS

type Hung = Exclude<BoxId, typeof CELLS | typeof SECOND>

const HELP: Record<Hung, string> = {
  'reset chip':
    'The chip that watches the rail and holds every machine in reset while it sits too low, and the latch-up that keeps them there.',
  clip: 'A paperclip dragged across the supply pads, biting the rail a few times a second.',
}

const TOP = 8
const BOX_H = ONE_LINE_H
const DROP = 24
const LOW = TOP + BOX_H + DROP
const SECOND_Y = LOW + BOX_H + DROP
const HEIGHT = SECOND_Y + BOX_H + TOP
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

// The rail the machines boot on. The cells feed it through their leads, the
// reset chip watches it and the clip bites it. The second cells sit under it
// with a rail of their own, feeding whichever machines have moved to them.
export function SupplyDiagram() {
  const r = useReadings(KEYS)
  const pick = useSelectedBox(CELLS)
  useOpensOnAim(pick, BOX_KEYS)
  const flow = useFlow()
  const shared = useBoardValue(c => machinesOn(c, SUPPLY.shared).length)
  const second = useBoardValue(c =>
    machinesOn(c, SUPPLY.second).join(', ').toLowerCase(),
  )

  const cellsW = glyphBoxWidth(CELLS, GLYPH_W)
  const secondW = glyphBoxWidth(SECOND, GLYPH_W)
  const mid = TOP + BOX_H / 2
  const mid2 = SECOND_Y + BOX_H / 2
  const box = (id: Hung, x: number): BoxSpec => ({
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
      <ChipDrawing
        maxWidth={width + 2}
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
              look={shared > 0 ? flow : 'plain'}
            />
            <Label x={width - 2} y={mid - 4} anchor="end">
              {shared > 0 ? 'machines' : 'nothing'}
            </Label>
            <Wire
              arrow={arrow}
              d={`M${secondW} ${mid2} H${width - 2}`}
              look={second ? flow : 'plain'}
            />
            <Label x={width - 2} y={mid2 - 4} anchor="end">
              {second || 'nothing'}
            </Label>
            {(
              [
                [reset, `M${watchX} ${mid} V${LOW}`, watchX],
                [clip, `M${biteX} ${LOW} V${mid}`, biteX],
              ] as const
            ).map(([b, d, x]) => (
              <Bend
                key={b.id}
                name={`${b.name} wire`}
                opens={b.id!}
                pick={pick}
                hit={d}
              >
                <Wire arrow={arrow} d={d} />
                <Dot x={x} y={mid} />
              </Bend>
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
            <GlyphBox
              x={0}
              y={SECOND_Y}
              w={secondW}
              h={BOX_H}
              name={SECOND}
              help="a second set of cells, with their own starve, leads, reservoir, clip and watchdog, for the machines whose Supply picks them"
              lit={r.touched(...BOX_KEYS[SECOND])}
              selected={pick.selected === SECOND}
              onSelect={() => pick.toggle(SECOND)}
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
      </ChipDrawing>
      <BoxRows
        card={card(pick)}
        hint="Press a box for its settings."
        keys={isBox(pick.selected) ? BOX_KEYS[pick.selected] : undefined}
        beside={besideOf(BOX_KEYS, SUPPLY_WIRED, pick.selected)}
        note={
          pick.selected === SECOND && !second
            ? 'Set a machine’s Supply to second cells to run it off these.'
            : undefined
        }
      />
    </>
  )
}
