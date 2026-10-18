import { engine } from '../engine/engine.ts'
import styles from './BusDiagram.module.css'
import { Chip, type ChipBox } from './BusDiagram.tsx'
import chip from './ChipLook.module.css'
import { CHANNELS, sliderFor } from './controls/index.ts'
import { useStoreSelect } from './ControlsContext.ts'
import { boxHeight, boxWidth, useReadings } from './diagram.ts'
import { Diagram, Label, Wire, type WireLook } from './DiagramParts.tsx'

const KEYS = [
  'fmDacSlot',
  'fmDacSlip',
  'fmAlloc',
  'fmColdBoot',
  'fmAdder',
] as const

const ALLOC = sliderFor('fmAlloc').choices!
const SLOTS = sliderFor('fmDacSlot').choices!
const BOOT = sliderFor('fmColdBoot').choices!
const ADDER = sliderFor('fmAdder').choices!

const FM_TAP = CHANNELS.find(c => c.name === 'FM chip')!.tap

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

const voiceTop = (i: number) => TOP + HEAD + i * (VOICE_H + VOICE_GAP)
const voiceMid = (i: number) => voiceTop(i) + VOICE_H / 2

const stuckLook = (stuck: number, flow: WireLook, i: number): WireLook =>
  stuck === 0 ? flow : stuck - 1 === i ? 'alarm' : 'dash'

const stuckLast = (stuck: number) =>
  [...Array(VOICES).keys()].toSorted(
    (a, b) => Number(a === stuck - 1) - Number(b === stuck - 1),
  )

// The allocator hands each note to a channel, the register file holds what the
// driver wrote, four voices run off it, and one converter takes a slot for each
// in turn. A stuck allocator or slot counter draws the one channel it leaves in
// red. The log adder does the arithmetic inside every operator.
export function FmDieDiagram() {
  const r = useReadings(KEYS)
  const read = (key: (typeof KEYS)[number]) => Math.round(r.value(key))
  const flow: WireLook = useStoreSelect(
    engine.sounding,
    lit => lit & (1 << FM_TAP),
  )
    ? 'on'
    : 'plain'
  const alloc = read('fmAlloc')
  const slot = read('fmDacSlot')
  const slip = r.value('fmDacSlip')
  const boot = read('fmColdBoot')
  const adder = read('fmAdder')

  const frameW = widest('adder 11 bits')
  const widths = [
    widest('allocator', ...ALLOC),
    widest('registers', BOOT[1]!),
    frameW,
    widest('DAC', ...SLOTS),
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
  const allocBox = { ...box(0, 'a\nb'), name: 'allocator' }
  const regsBox = { ...box(1, 'a\nb'), name: 'registers' }
  const dacBox = { ...box(3, 'a\nb\nc'), name: 'DAC' }
  const frameX = xs[2]!
  const frameRight = frameX + frameW
  const voiceW = boxWidth('voice 4')
  const voiceX = frameX + (frameW - voiceW) / 2
  const fanX = regsBox.x + regsBox.w + gap / 2
  const mergeX = frameRight + gap / 2

  return (
    <div className={chip.chips}>
      <Diagram width={WIDTH} height={HEIGHT} label="FM die and driver">
        {arrow => (
          <>
            <g>
              <title>
                voices — Four channels of two operators each. The log adder sets
                the arithmetic every operator uses.
              </title>
              <rect
                x={frameX}
                y={TOP}
                width={frameW}
                height={HEAD + STACK + FOOT}
                rx={3}
                className={styles.chip}
              />
              <text
                x={frameX + frameW / 2}
                y={TOP + 11}
                textAnchor="middle"
                className={styles.chipName}
              >
                voices
              </text>
              <text
                x={frameX + frameW / 2}
                y={TOP + HEAD + STACK + 11}
                textAnchor="middle"
                className={adder ? styles.knifed : styles.bus}
              >
                {`adder ${ADDER[adder]}`}
              </text>
            </g>
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
            <Chip
              box={allocBox}
              reading={alloc > 0 ? ALLOC[alloc] : undefined}
              help="The driver’s note allocator. Stuck, it hands every note to one channel."
            />
            <Chip
              box={regsBox}
              reading={boot > 0 ? BOOT[boot] : undefined}
              help="The register file the driver writes. At power-on it holds clean zeros, or whatever the die felt like."
            />
            <Chip
              box={dacBox}
              reading={[
                ...(slot > 0 ? [SLOTS[slot]!] : []),
                ...(slip > 0 ? [`slip ${Math.round(slip * 100)}%`] : []),
              ]}
              help="Four channels share one converter, a slot each per sample. A stuck counter repeats one channel in every slot, and a slow one skips slots."
            />
          </>
        )}
      </Diagram>
    </div>
  )
}
