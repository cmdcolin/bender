import styles from './BusDiagram.module.css'
import { Chip, type ChipBox } from './BusDiagram.tsx'
import { ChipDrawing } from './ChipDrawing.tsx'
import chip from './ChipLook.module.css'
import diagram from './Diagram.module.css'
import {
  boxWidth,
  ONE_LINE_H,
  useFlow,
  useReadings,
  useSelectedBox,
  card,
  spread,
  useOpensOnAim,
} from './diagram.ts'
import {
  BoxRows,
  Label,
  PickPart,
  Plate,
  Wire,
  type WireLook,
} from './DiagramParts.tsx'

import type { ControlKey } from '../controls.ts'

const KEYS = [
  'fmDacSlot',
  'fmDacSlip',
  'fmAlloc',
  'fmColdBoot',
  'fmAdder',
] as const

const OPENS: Record<string, readonly ControlKey[]> = {
  allocator: ['fmAlloc'],
  registers: ['fmColdBoot'],
  voices: ['fmAdder'],
  DAC: ['fmDacSlot', 'fmDacSlip'],
}

const VOICES = 4
const WIDTH = 420
const TOP = 6
const TAIL = 30
const VOICE_H = 16
const VOICE_GAP = 4
const HEAD = 16
const FOOT = 15
const STACK = VOICES * VOICE_H + (VOICES - 1) * VOICE_GAP
const HEIGHT = TOP + HEAD + STACK + FOOT + TOP
const MID = TOP + HEAD + STACK / 2

const voiceTop = (i: number) => TOP + HEAD + i * (VOICE_H + VOICE_GAP)
const voiceMid = (i: number) => voiceTop(i) + VOICE_H / 2

const stuckLook = (stuck: number, flow: WireLook, i: number): WireLook =>
  stuck === 0 ? flow : stuck - 1 === i ? 'alarm' : 'dash'

const stuckLast = (stuck: number) =>
  [...Array(VOICES).keys()].toSorted(
    (a, b) => Number(a === stuck - 1) - Number(b === stuck - 1),
  )

export function FmDieDiagram() {
  const r = useReadings(KEYS)
  const pick = useSelectedBox()
  useOpensOnAim(pick, OPENS)
  const read = (key: (typeof KEYS)[number]) => Math.round(r.value(key))
  const flow = useFlow('Glint')
  const alloc = read('fmAlloc')
  const slot = read('fmDacSlot')
  const slip = r.value('fmDacSlip')
  const boot = read('fmColdBoot')
  const adder = read('fmAdder')

  const frameW = boxWidth('voice 4') + 16
  const widths = [
    boxWidth('allocator'),
    boxWidth('registers'),
    frameW,
    boxWidth('DAC'),
  ]
  const { gap, xs } = spread(widths, WIDTH - TAIL)
  const box = (i: number, name: string): ChipBox => ({
    name,
    x: xs[i]!,
    y: MID - ONE_LINE_H / 2,
    w: widths[i]!,
    h: ONE_LINE_H,
  })
  const allocBox = box(0, 'allocator')
  const regsBox = box(1, 'registers')
  const dacBox = box(3, 'DAC')
  const frameX = xs[2]!
  const frameRight = frameX + frameW
  const voiceW = boxWidth('voice 4')
  const voiceX = frameX + (frameW - voiceW) / 2
  const fanX = regsBox.x + regsBox.w + gap / 2
  const mergeX = frameRight + gap / 2

  return (
    <>
      <ChipDrawing width={WIDTH} height={HEIGHT} label="FM die and driver">
        {arrow => (
          <>
            <PickPart opens="voices" pick={pick}>
              <title>
                voices — Four channels of two operators each. The log adder sets
                the arithmetic every operator uses.
              </title>
              <Plate
                x={frameX}
                y={TOP}
                w={frameW}
                h={HEAD + STACK + FOOT}
                touched={adder > 0}
                selected={pick.selected === 'voices'}
              />
              <text
                x={frameX + frameW / 2}
                y={TOP + 11}
                textAnchor="middle"
                className={adder ? diagram.nameOn : diagram.name}
              >
                voices
              </text>
              <text
                x={frameX + frameW / 2}
                y={TOP + HEAD + STACK + 11}
                textAnchor="middle"
                className={adder ? diagram.nameOn : styles.bus}
              >
                adder
              </text>
              <g className={chip.inner}>
                {Array.from({ length: VOICES }, (_, i) => (
                  <g key={i}>
                    <Plate x={voiceX} y={voiceTop(i)} w={voiceW} h={VOICE_H} />
                    <text
                      x={voiceX + voiceW / 2}
                      y={voiceMid(i) + 3}
                      textAnchor="middle"
                      className={diagram.name}
                    >
                      voice {i + 1}
                    </text>
                  </g>
                ))}
              </g>
            </PickPart>
            <Wire
              arrow={arrow}
              d={`M${allocBox.x + allocBox.w} ${MID} H${regsBox.x}`}
              look={flow}
            />
            <Wire d={`M${regsBox.x + regsBox.w} ${MID} H${fanX}`} look={flow} />
            {stuckLast(alloc).map(i => (
              <Wire
                key={`in${i}`}
                arrow={arrow}
                d={`M${fanX} ${MID} V${voiceMid(i)} H${voiceX}`}
                look={stuckLook(alloc, flow, i)}
              />
            ))}
            {stuckLast(slot).map(i => (
              <Wire
                key={`out${i}`}
                d={`M${voiceX + voiceW} ${voiceMid(i)} H${mergeX} V${MID}`}
                look={stuckLook(slot, flow, i)}
              />
            ))}
            <Wire
              arrow={arrow}
              d={`M${mergeX} ${MID} H${dacBox.x}`}
              look={flow}
            />
            <Wire
              arrow={arrow}
              d={`M${dacBox.x + dacBox.w} ${MID} H${WIDTH - 2}`}
              look={flow}
            />
            <Label x={WIDTH - 2} y={MID + 12} anchor="end">
              out
            </Label>
            <Chip
              box={allocBox}
              lit={alloc > 0}
              help="The driver’s note allocator. Stuck, it hands every note to one channel."
              pick={pick}
              keys={OPENS.allocator}
            />
            <Chip
              box={regsBox}
              lit={boot > 0}
              help="The register file the driver writes. At power-on it holds clean zeros, or random bytes."
              pick={pick}
              keys={OPENS.registers}
            />
            <Chip
              box={dacBox}
              lit={slot > 0 || slip > 0}
              help="Four channels share one converter, a slot each per sample. A stuck counter repeats one channel in every slot. A slow one reads a channel twice and skips the next."
              pick={pick}
              keys={OPENS.DAC}
            />
          </>
        )}
      </ChipDrawing>
      <BoxRows
        card={card(pick)}
        hint="Press a box for its settings."
        keys={pick.selected ? OPENS[pick.selected] : undefined}
      />
    </>
  )
}
