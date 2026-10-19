import { useState } from 'react'

import { engine } from '../engine/engine.ts'
import chip from './ChipLook.module.css'
import { CHANNELS, GROUPS } from './controls/index.ts'
import { useStoreSelect } from './ControlsContext.ts'
import diagram from './Diagram.module.css'
import {
  boxHeight,
  boxWidth,
  glyphBoxWidth,
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
  type WireLook,
} from './DiagramParts.tsx'
import { slidersFirst } from './slidersFirst.ts'
import { VOICE_BOXES } from './toyBoxKeys.ts'
import { CONE_H, ZoomCone, Zoomed } from './ZoomCone.tsx'

import type { ControlKey } from '../controls.ts'
import type { DrawingProps } from './drawingFor.tsx'

const DRUM_TAP = CHANNELS.find(c => c.name === 'Toy drums')!.tap

type BoxId =
  | keyof typeof VOICE_BOXES
  | 'DAC'
  | 'sample ROM'
  | 'triggers'
  | 'pattern'

const GROUP = GROUPS.find(g => g.name === 'Toy drums')!

const keysOf = (part: string): ControlKey[] =>
  GROUP.sliders.filter(d => d.part === part).map(d => d.key)

const HOST = 'inside the voices'

const BOXES: Record<BoxId, { part: string; keys: readonly ControlKey[] }> = {
  'one-shots': { part: HOST, keys: VOICE_BOXES['one-shots'] },
  tanks: { part: HOST, keys: VOICE_BOXES.tanks },
  'metal bank': { part: HOST, keys: VOICE_BOXES['metal bank'] },
  noise: { part: HOST, keys: VOICE_BOXES.noise },
  DAC: { part: 'the converter', keys: keysOf('the converter') },
  'sample ROM': { part: 'Sample ROM', keys: keysOf('Sample ROM') },
  triggers: {
    part: 'triggers and cross-patch',
    keys: keysOf('triggers and cross-patch'),
  },
  pattern: { part: 'knife on the bus', keys: keysOf('knife on the bus') },
}

const HELP: Record<BoxId, string> = {
  'one-shots':
    'Each voice has a one-shot that turns its trigger into a pulse. The rows set the pulse width, what a one-shot loses to the others fired with it, and what the spike costs the supply.',
  tanks:
    'The bridged-T networks the kick, tom and snare ring. Shocked by a trigger, they swoop down as they run down.',
  'metal bank':
    'Six oscillators behind one resistor chain and a squarer. The hats, the cowbell and the cymbal ring off it.',
  noise:
    'The one transistor run backwards until it avalanches. The snare, the clap and the dice all listen to it.',
  DAC: 'The one converter every voice shares: its word length, its ladder, how it overflows and what its reference is wired to.',
  triggers:
    'What the trigger lines do before a one-shot hears them: retriggers, the floor a voice must drain to, the scan, the accent bus, the choke and the cross-patches.',
  pattern:
    'The step counter and the pattern memory. The rows put a knife on the wires that clock it, address it and carry the word back.',
  'sample ROM':
    'The kit sampled by itself. Switched on, the voices read their slabs from a ROM, and the address and data wires to it can take a knife.',
}

const PADS = 'pads'
const PAD_KEYS = slidersFirst(GROUP.sliders.filter(d => !d.part)).map(
  d => d.key,
)

const KEYS = [...Object.values(BOXES).flatMap(b => b.keys), ...PAD_KEYS]

const WIDTH = 430
const TOP = 6
const BOX_H = boxHeight('a')
const ROW_GAPS = [30, 16]
const HEAD = BOX_H + 16
const BODY_H = 3 * BOX_H + ROW_GAPS[0]! + ROW_GAPS[1]!
const HEIGHT = TOP + 2 * HEAD + BODY_H + TOP
const GLYPH = 12
const PAD = 5
const GAP = 28
const TAIL = 28
const HEAD_GAP = 6
const FIRST = ['tanks', 'metal bank', 'noise'] as const

const plain = (
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  help: string,
): BoxSpec => ({ x, y, w, h, name, touched: false, help })

const bent = (on: boolean): WireLook => (on ? 'alarm' : 'dash')

// The pads the player hits, drawn as four of them.
function padsGlyph(x: number, mid: number) {
  const y = mid - GLYPH / 2
  return (
    <path
      d={[0, 1]
        .flatMap(row =>
          [0, 1].map(
            col =>
              `M${x + col * (PAD + 2)} ${y + row * (PAD + 2)} h${PAD} v${PAD} h${-PAD} Z`,
          ),
        )
        .join(' ')}
      className={diagram.glyphLine}
    />
  )
}

// Pads and the pattern fire the triggers. One-shots and amps each span the three
// voices, so every voice gets its own wire in and out; the sum happens in the DAC.
export function ToyDrumDiagram({ verbs, editor, zoom }: DrawingProps) {
  const r = useReadings(KEYS)
  const pick = useSelectedBox(
    r.touched(...BOXES.pattern.keys) ? 'pattern' : PADS,
  )
  const editing = Boolean(editor)
  const [wasEditing, setWasEditing] = useState(editing)
  if (editing !== wasEditing) {
    setWasEditing(editing)
    if (editing && pick.selected !== PADS) pick.toggle(PADS)
  }
  const flow: WireLook = useStoreSelect(
    engine.sounding,
    lit => lit & (1 << DRUM_TAP),
  )
    ? 'on'
    : 'plain'

  const srcW = Math.max(...FIRST.map(boxWidth))
  const padsW = glyphBoxWidth(PADS, GLYPH)
  const patternW = boxWidth('pattern')
  const widths = [
    Math.max(
      boxWidth('one-shots'),
      boxWidth('triggers'),
      padsW + HEAD_GAP + patternW,
    ),
    srcW,
    boxWidth('amps'),
    Math.max(boxWidth('DAC'), boxWidth('sample ROM')),
  ]
  const xs = widths.map((_, i) =>
    Math.round(widths.slice(0, i).reduce((a, b) => a + b, 0) + GAP * i),
  )
  const width = widths.reduce((a, b) => a + b, 0) + GAP * 3 + TAIL
  const triggersY = TOP + HEAD
  const rowY = (i: number) =>
    TOP + 2 * HEAD + i * BOX_H + ROW_GAPS.slice(0, i).reduce((a, b) => a + b, 0)
  const mid = (i: number) => rowY(i) + BOX_H / 2

  const spec = (id: BoxId, x: number, y: number, w: number, h: number) => {
    const { keys } = BOXES[id]
    return {
      id,
      keys,
      x,
      y,
      w,
      h,
      name: id,
      touched: r.touched(...keys),
      help: HELP[id],
    } satisfies BoxSpec
  }

  const shots = spec('one-shots', xs[0]!, rowY(0), widths[0]!, BODY_H)
  const sources = FIRST.map((id, i) => spec(id, xs[1]!, rowY(i), srcW, BOX_H))
  const amps = plain(
    'amps',
    xs[2]!,
    rowY(0),
    widths[2]!,
    BODY_H,
    'One amplifier a voice, each opened by its own envelope. The accent cap and the cross-patch sit under triggers and cross-patch.',
  )
  const dac = spec('DAC', xs[3]!, rowY(1), widths[3]!, BOX_H)
  const rom = spec('sample ROM', xs[3]!, rowY(2), widths[3]!, BOX_H)
  const triggers = spec('triggers', xs[0]!, triggersY, widths[0]!, BOX_H)
  const padsX = Math.round(
    triggers.x + (triggers.w - padsW - HEAD_GAP - patternW) / 2,
  )
  const pattern = spec(
    'pattern',
    padsX + padsW + HEAD_GAP,
    TOP,
    patternW,
    BOX_H,
  )
  const picks = [pattern, triggers, shots, ...sources, dac, rom]
  const open = picks.find(b => b.id === pick.selected)
  const close = open ? zoom?.(BOXES[open.id].part) : null
  const fmX = xs[1]! + srcW * 0.3
  const syncX = xs[1]! + srcW * 0.7

  return (
    <>
      <Zoomed close={close}>
        <div className={chip.chips}>
          <Diagram
            width={WIDTH}
            left={(WIDTH - width) / 2}
            height={close ? HEIGHT + CONE_H : HEIGHT}
            label="toy drum voices"
          >
            {arrow => (
              <>
                {close && open && (
                  <ZoomCone
                    from={open === rom ? open : undefined}
                    to={{ x: -(WIDTH - width) / 2, w: WIDTH }}
                    top={open.y + BOX_H}
                    knee={HEIGHT}
                    bottom={HEIGHT + CONE_H}
                    title={`zoom: ${open.name}`}
                  />
                )}
                {sources.map((s, i) => (
                  <g key={s.name}>
                    <Wire
                      arrow={arrow}
                      d={`M${shots.x + shots.w} ${mid(i)} H${s.x}`}
                      look={flow}
                    />
                    <Wire
                      arrow={arrow}
                      d={`M${s.x + s.w} ${mid(i)} H${amps.x}`}
                      look={flow}
                    />
                  </g>
                ))}
                <Wire
                  arrow={arrow}
                  d={`M${amps.x + amps.w} ${mid(1)} H${dac.x}`}
                  look={flow}
                />
                <Wire
                  arrow={arrow}
                  d={`M${dac.x + dac.w} ${mid(1)} H${width - 2}`}
                  look={flow}
                />
                <Label x={width - 2} y={mid(1) - 4} anchor="end">
                  out
                </Label>
                <Wire
                  arrow={arrow}
                  d={`M${fmX} ${rowY(1)} V${rowY(0) + BOX_H}`}
                  look={bent(r.value('drumBankFm') > 0)}
                />
                <Label
                  x={fmX - 4}
                  y={rowY(1) - 8}
                  anchor="end"
                  on={r.value('drumBankFm') > 0}
                >
                  FM
                </Label>
                <Wire
                  arrow={arrow}
                  d={`M${syncX} ${rowY(0) + BOX_H} V${rowY(1)}`}
                  look={bent(r.value('drumBankSync') > 0)}
                />
                <Label
                  x={syncX + 8}
                  y={rowY(1) - 8}
                  on={r.value('drumBankSync') > 0}
                >
                  sync
                </Label>
                <Wire
                  arrow={arrow}
                  d={`M${rom.x + rom.w / 2} ${rom.y} V${dac.y + BOX_H}`}
                  look={bent(r.value('drumRom') > 0)}
                />
                <Wire
                  arrow={arrow}
                  d={`M${shots.x + shots.w / 2} ${triggers.y + BOX_H} V${shots.y}`}
                  look={flow}
                />
                {[padsX + padsW / 2, pattern.x + pattern.w / 2].map(x => (
                  <Wire
                    key={x}
                    arrow={arrow}
                    d={`M${x} ${TOP + BOX_H} V${triggers.y}`}
                    look={flow}
                  />
                ))}
                <GlyphBox
                  x={padsX}
                  y={TOP}
                  w={padsW}
                  h={BOX_H}
                  name={PADS}
                  help="the kit's level, tempo, swing, chance, tuning, decay and mute"
                  lit={r.touched(...PAD_KEYS)}
                  selected={pick.selected === PADS}
                  onSelect={() => pick.toggle(PADS)}
                  glyphW={GLYPH}
                  glyph={padsGlyph}
                />
                {picks.map(b => (
                  <BoxView
                    key={b.id}
                    box={b}
                    selected={b.id === pick.selected}
                    onSelect={pick.toggle}
                  />
                ))}
                <BoxView box={amps} />
              </>
            )}
          </Diagram>
        </div>
      </Zoomed>
      {pick.selected === PADS ? (
        <BoxRows keys={PAD_KEYS} verbs={editor} />
      ) : (
        <BoxRows
          hint="Press a box for its settings."
          keys={open?.id === 'triggers' ? [] : open?.keys}
          verbs={
            open &&
            verbs?.(
              BOXES[open.id].part,
              BOXES[open.id].part === HOST
                ? { name: open.id, keys: open.keys }
                : undefined,
            )
          }
        />
      )}
    </>
  )
}
