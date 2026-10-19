import styles from './BusDiagram.module.css'
import { Chip, type ChipBox } from './BusDiagram.tsx'
import chip from './ChipLook.module.css'
import {
  boxHeight,
  boxWidth,
  useFlow,
  useReadings,
  useSelectedBox,
  card,
} from './diagram.ts'
import {
  BoxRows,
  Diagram,
  Label,
  Pressable,
  Wire,
  type WireLook,
} from './DiagramParts.tsx'

import type { ControlKey } from '../controls.ts'
import type { ReactNode } from 'react'

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

const widest = (...names: string[]) => Math.max(...names.map(boxWidth))
const BOX_LINES = 'a'

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
  const read = (key: (typeof KEYS)[number]) => Math.round(r.value(key))
  const flow = useFlow('Glint')
  const alloc = read('fmAlloc')
  const slot = read('fmDacSlot')
  const slip = r.value('fmDacSlip')
  const boot = read('fmColdBoot')
  const adder = read('fmAdder')

  const frameW = boxWidth('voice 4') + 16
  const widths = [
    widest('allocator'),
    widest('registers'),
    frameW,
    widest('DAC'),
  ]
  const gap = (WIDTH - TAIL - widths.reduce((a, b) => a + b)) / 3
  const xs = widths.map((_, i) =>
    Math.round(widths.slice(0, i).reduce((a, b) => a + b + gap, 0)),
  )
  const box = (i: number, lines: string): ChipBox => ({
    name: '',
    x: xs[i]!,
    y: MID - boxHeight(lines) / 2,
    w: widths[i]!,
    h: boxHeight(lines),
  })
  const allocBox = { ...box(0, BOX_LINES), name: 'allocator' }
  const regsBox = { ...box(1, BOX_LINES), name: 'registers' }
  const dacBox = { ...box(3, BOX_LINES), name: 'DAC' }
  const frameX = xs[2]!
  const frameRight = frameX + frameW
  const voiceW = boxWidth('voice 4')
  const voiceX = frameX + (frameW - voiceW) / 2
  const fanX = regsBox.x + regsBox.w + gap / 2
  const mergeX = frameRight + gap / 2

  const node = (name: string, child: ReactNode) => (
    <Pressable
      name={name}
      selected={pick.selected === name}
      onSelect={() => pick.toggle(name)}
    >
      {child}
    </Pressable>
  )

  return (
    <>
      <div className={chip.chips}>
        <Diagram width={WIDTH} height={HEIGHT} label="FM die and driver">
          {arrow => (
            <>
              {node(
                'voices',
                <g>
                  <title>
                    voices — Four channels of two operators each. The log adder
                    sets the arithmetic every operator uses.
                  </title>
                  <rect
                    x={frameX}
                    y={TOP}
                    width={frameW}
                    height={HEAD + STACK + FOOT}
                    rx={3}
                    className={adder ? styles.chipOn : styles.chip}
                  />
                  <text
                    x={frameX + frameW / 2}
                    y={TOP + 11}
                    textAnchor="middle"
                    className={adder ? styles.chipNameOn : styles.chipName}
                  >
                    voices
                  </text>
                  <text
                    x={frameX + frameW / 2}
                    y={TOP + HEAD + STACK + 11}
                    textAnchor="middle"
                    className={adder ? styles.chipNameOn : styles.bus}
                  >
                    adder
                  </text>
                </g>,
              )}
              <Wire
                arrow={arrow}
                d={`M${allocBox.x + allocBox.w} ${MID} H${regsBox.x}`}
                look={flow}
              />
              <Wire
                d={`M${regsBox.x + regsBox.w} ${MID} H${fanX}`}
                look={flow}
              />
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
              {Array.from({ length: VOICES }, (_, i) => (
                <Chip
                  key={i}
                  box={{
                    name: `voice ${i + 1}`,
                    x: voiceX,
                    y: voiceTop(i),
                    w: voiceW,
                    h: VOICE_H,
                  }}
                  className={chip.inner}
                />
              ))}
              {node(
                'allocator',
                <Chip
                  box={allocBox}
                  lit={alloc > 0}
                  help="The driver’s note allocator. Stuck, it hands every note to one channel."
                />,
              )}
              {node(
                'registers',
                <Chip
                  box={regsBox}
                  lit={boot > 0}
                  help="The register file the driver writes. At power-on it holds clean zeros, or random bytes."
                />,
              )}
              {node(
                'DAC',
                <Chip
                  box={dacBox}
                  lit={slot > 0 || slip > 0}
                  help="Four channels share one converter, a slot each per sample. A stuck counter repeats one channel in every slot. A slow one reads a channel twice and skips the next."
                />,
              )}
            </>
          )}
        </Diagram>
      </div>
      <BoxRows
        card={card(pick)}
        hint="Press a box for its settings."
        keys={pick.selected ? OPENS[pick.selected] : undefined}
      />
    </>
  )
}
