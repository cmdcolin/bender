import { PARLOR_OPENS as OPENS, PARLOR_WIRED } from './cardWiring.ts'
import { ChipDrawing } from './ChipDrawing.tsx'
import {
  boxWidth,
  ONE_LINE_H,
  useFlow,
  useReadings,
  useSelectedBox,
  type BoxSpec,
  boxMaker,
  chainPaths,
  lefts,
  useOpensOnAim,
  besideOf,
} from './diagram.ts'
import { Bend, BoxRows, BoxView, OpenBox, Wire } from './DiagramParts.tsx'

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
  'pcmAddrCross',
  'pcmDataCross',
  'pcmEnv',
  'pcmRelease',
  'pcmTone',
  'pcmLevel',
  'pcmMute',
  'pcmSupply',
  'pcmRunOn',
  'pcmWrite',
  'pcmSignDir',
  'pcmLatch',
  'pcmGlint',
] as const

type Key = (typeof KEYS)[number]

const PARTS: Record<string, string> = {
  'addr bus': 'fault on the bus',
  'data bus': 'fault on the bus',
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
// counter and the ROM talk over two buses a fault can reach, which hang under
// the wires they sit on, and the die's one vibrato LFO feeds the counter from
// above. Each box opens the knobs of the part it stands for.
export function PcmKeysDiagram({ verbs, zoom }: { verbs: Verbs; zoom?: Zoom }) {
  const r = useReadings(KEYS)
  const pick = useSelectedBox('ROM')
  const flow = useFlow('Parlor')
  const path: [string, readonly Key[], string][] = [
    [
      'keys',
      OPENS.keys,
      'What strikes a note: the toy’s gate line, the kit’s trigger lines and a hand on the bed. The chord button turns each strike into a voicing of up to four voices.',
    ],
    [
      'counter',
      OPENS.counter,
      'The address counter. It walks the ROM at the rate the note asks for, so its clock sets the pitch and the aliasing together. Its up/down pin and the latch the four voices share sit here too.',
    ],
    [
      'ROM',
      OPENS.ROM,
      'The recordings: one short loop per voice, cut into eight-bit words. The sampled voice reads the sampler’s reel instead. The loop comparator and the write strobe sit here too.',
    ],
    [
      'envelope',
      OPENS.envelope,
      'The four buttons down the side of the case, and the capacitor that sets how long a note takes to die.',
    ],
    [
      'tone',
      OPENS.tone,
      'The four voices sum into the eight-bit DAC, and a two-pole filter follows it.',
    ],
  ]
  const box = boxMaker(r.touched)
  const names = [...path.map(([id]) => id), 'mix']
  const widths = names.map(boxWidth)
  const xs = lefts(widths, GAP)
  const width = xs.at(-1)! + widths.at(-1)! + 2
  const row = path.map(([id, keys, help], i) =>
    box(id, xs[i]!, TOP + ROW, widths[i]!, keys, help),
  )
  const mix = box(
    'mix',
    xs.at(-1)!,
    TOP + ROW,
    widths.at(-1)!,
    OPENS.mix,
    'The keyboard’s fader and mute, where it joins the source mix, and the supply it runs off.',
  )
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
      OPENS.vibrato,
      'The die’s one LFO. It has no rate or depth register and no way to stop it; the button picks whether a voice listens to it, and whether it waits first.',
    ),
    bus(
      'addr bus',
      midOf(counter, rom),
      -BUS_LEAN,
      OPENS['addr bus'],
      'The wires the counter names a word on. A fault on one makes the ROM hand back a real word from the wrong place.',
    ),
    bus(
      'data bus',
      midOf(rom, envelope),
      BUS_LEAN,
      OPENS['data bus'],
      'The eight wires the ROM answers on. A fault on one keeps the pitch and changes the shape of every word.',
    ),
  ]
  useOpensOnAim(pick, boxes)
  const open = boxes.find(b => b.id === pick.selected)
  const part = open && PARTS[open.id!]
  const close = part ? zoom?.(part) : null
  const feet = busY + BOX_H + 4
  const mid = TOP + ROW + BOX_H / 2
  const chain = [...row, mix]
  const drops: [string, string][] = [
    ['vibrato', `M${counter.x + counter.w / 2} ${TOP + BOX_H} V${TOP + ROW}`],
    ['addr bus', `M${midOf(counter, rom)} ${busY} V${mid}`],
    ['data bus', `M${midOf(rom, envelope)} ${busY} V${mid}`],
  ]
  return (
    <>
      <ChipDrawing
        maxWidth={width}
        width={width}
        height={feet}
        label="parlor signal path"
      >
        {arrow => (
          <>
            {chainPaths(chain, mid).map((d, i) => (
              <Wire key={d} arrow={arrow} d={d} look={i < 2 ? 'plain' : flow} />
            ))}
            {drops.map(([opens, d]) => (
              <Bend
                key={opens}
                name={`${opens} wire`}
                opens={opens}
                pick={pick}
                hit={d}
              >
                <Wire d={d} look="dash" />
              </Bend>
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
      </ChipDrawing>
      {open && (
        <OpenBox name={open.name} onHide={() => pick.toggle(open.id!)}>
          {close}
          <BoxRows
            title={open.name}
            keys={open.keys}
            beside={besideOf(OPENS, PARLOR_WIRED, open.id)}
            verbs={part && verbs(part)}
          />
        </OpenBox>
      )}
    </>
  )
}
