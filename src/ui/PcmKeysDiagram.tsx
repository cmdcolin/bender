import {
  boxWidth,
  ONE_LINE_H,
  useFlow,
  useReadings,
  useSelectedBox,
  type BoxSpec,
} from './diagram.ts'
import { BoxRows, BoxView, Wire } from './DiagramParts.tsx'
import { CONE_H, ZoomCone, ZoomFrame } from './ZoomCone.tsx'

import type { Verbs, Zoom } from './foldHosting.ts'

const KEYS = [
  'pcmStruck',
  'pcmKeyGate',
  'pcmChord',
  'pcmVibrato',
  'pcmClockX',
  'pcmAddrLine',
  'pcmAddrFault',
  'pcmVoice',
  'pcmDataLine',
  'pcmDataFault',
  'pcmBusCut',
  'pcmEnv',
  'pcmRelease',
  'pcmTone',
] as const

type Key = (typeof KEYS)[number]

const PARTS: Record<string, string> = {
  'addr bus': 'knife on the bus',
  'data bus': 'knife on the bus',
}

const TOP = 4
const ROW = 30
const GAP = 18
const BOX_H = ONE_LINE_H

// How far each bus box leans away from the other, so the two do not touch.
const BUS_LEAN = 14

const midOf = (from: BoxSpec, to: BoxSpec) =>
  Math.round((from.x + from.w + to.x) / 2)

// The keyboard as the board wires it: a key strikes up to four voices, a
// counter walks the sample ROM at the rate the note asks for, the ROM answers
// with a word, and an envelope, a filter and the mix take it from there. The
// counter and the ROM talk over two buses a knife can reach, which hang under
// the wires they sit on, and the die's one vibrato LFO feeds the counter from
// above. Each box opens the knobs of the part it stands for.
export function PcmKeysDiagram({ verbs, zoom }: { verbs: Verbs; zoom?: Zoom }) {
  const r = useReadings(KEYS)
  const pick = useSelectedBox('ROM')
  const flow = useFlow('Parlor')
  const path: [string, readonly Key[], string][] = [
    [
      'keys',
      ['pcmStruck', 'pcmKeyGate', 'pcmChord'],
      'What strikes a note: the toy’s gate line, the kit’s trigger lines and a hand on the bed. The chord button turns each strike into a voicing of up to four voices.',
    ],
    [
      'counter',
      ['pcmClockX'],
      'The address counter. It walks the ROM at the rate the note asks for, so its clock sets the pitch and the aliasing together.',
    ],
    [
      'ROM',
      ['pcmVoice'],
      'The recordings: one short loop per voice, cut into eight-bit words. The sampled voice reads the sampler’s reel instead.',
    ],
    [
      'envelope',
      ['pcmEnv', 'pcmRelease'],
      'The four buttons down the side of the case, and the capacitor that sets how long a note takes to die.',
    ],
    [
      'tone',
      ['pcmTone'],
      'The four voices sum into the eight-bit DAC, and a two-pole filter follows it.',
    ],
  ]
  const box = (
    id: string,
    x: number,
    y: number,
    w: number,
    keys: readonly Key[],
    help: string,
  ): BoxSpec => ({
    id,
    keys,
    x,
    y,
    w,
    name: id,
    touched: r.touched(...keys),
    help,
  })
  const names = [...path.map(([id]) => id), 'mix']
  const widths = names.map(boxWidth)
  let x = 0
  const placed = names.map((id, i) => {
    const at = x
    x += widths[i]! + GAP
    return { id, x: at, w: widths[i]! }
  })
  const width = x - GAP + 2
  const row = path.map(([id, keys, help], i) =>
    box(id, placed[i]!.x, TOP + ROW, placed[i]!.w, keys, help),
  )
  const mix: BoxSpec = {
    ...placed[names.length - 1]!,
    y: TOP + ROW,
    name: 'mix',
    touched: false,
    help: 'The keyboard’s fader and mute are above, in the rows. This is where it joins the source mix.',
  }
  const at = (id: string) => row.find(b => b.id === id)!
  const counter = at('counter')
  const rom = at('ROM')
  const envelope = at('envelope')
  const busY = TOP + ROW * 2
  const bus = (
    id: string,
    mid: number,
    lean: number,
    keys: readonly Key[],
    help: string,
  ) => {
    const w = boxWidth(id)
    return box(id, mid + lean - Math.round(w / 2), busY, w, keys, help)
  }
  const boxes = [
    ...row,
    mix,
    box(
      'vibrato',
      counter.x,
      TOP,
      counter.w,
      ['pcmVibrato'],
      'The die’s one LFO. It has no rate or depth register and no way to stop it; the button picks whether a voice listens to it, and whether it waits first.',
    ),
    bus(
      'addr bus',
      midOf(counter, rom),
      -BUS_LEAN,
      ['pcmAddrLine', 'pcmAddrFault', 'pcmBusCut'],
      'The wires the counter names a word on. A knife through one makes the ROM hand back a real word from the wrong place.',
    ),
    bus(
      'data bus',
      midOf(rom, envelope),
      BUS_LEAN,
      ['pcmDataLine', 'pcmDataFault', 'pcmBusCut'],
      'The eight wires the ROM answers on. A knife through one keeps the pitch and changes the shape of every word.',
    ),
  ]
  const open = boxes.find(b => b.id === pick.selected)
  const part = open && PARTS[open.id!]
  const close = part ? zoom?.(part) : null
  const feet = busY + BOX_H + 4
  const mid = TOP + ROW + BOX_H / 2
  const edge = (from: BoxSpec, to: BoxSpec) =>
    `M${from.x + from.w} ${mid} H${to.x}`
  const chain = [...row, mix]
  const drops = [
    `M${counter.x + counter.w / 2} ${TOP + BOX_H} V${TOP + ROW}`,
    ...[midOf(counter, rom), midOf(rom, envelope)].map(
      m => `M${m} ${busY} V${mid}`,
    ),
  ]
  return (
    <>
      <ZoomFrame
        close={close}
        maxWidth={width}
        width={width}
        height={feet}
        label="parlor signal path"
      >
        {arrow => (
          <>
            {close && open && (
              <ZoomCone
                from={open}
                to={{ x: 0, w: width }}
                top={open.y + BOX_H}
                knee={feet}
                bottom={feet + CONE_H}
                title={`zoom: ${open.name}`}
              />
            )}
            {chain.slice(1).map((to, i) => (
              <Wire
                key={to.id}
                arrow={arrow}
                d={edge(chain[i]!, to)}
                look={i < 2 ? 'plain' : flow}
              />
            ))}
            {drops.map(d => (
              <Wire key={d} d={d} look="dash" />
            ))}
            {boxes.map(b => (
              <BoxView
                key={b.id}
                box={b}
                selected={b.id === pick.selected}
                onSelect={pick.toggle}
              />
            ))}
          </>
        )}
      </ZoomFrame>
      <BoxRows keys={open?.keys} verbs={part && verbs(part)} />
    </>
  )
}
