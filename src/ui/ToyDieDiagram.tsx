import { engine } from '../engine/engine.ts'
import styles from './BusDiagram.module.css'
import { Chip, type ChipBox } from './BusDiagram.tsx'
import { CHANNELS, sliderFor } from './controls/index.ts'
import { useStoreSelect } from './ControlsContext.ts'
import { boxHeight, boxWidth, useReadings } from './diagram.ts'
import { Diagram, Wire, type WireLook } from './DiagramParts.tsx'

const KEYS = [
  'chipBendSpot',
  'chipBendPot',
  'chipDrift',
  'chipCrosstalk',
  'chipScan',
  'chipPwm',
  'chipEnvCap',
  'chipShort',
  'chipGhost',
  'chipStepTap',
  'chipEnvRelax',
  'chipEnvDiv',
  'chipOutAddr',
  'chipOutData',
  'chipPwmTap',
] as const

const SPOTS = sliderFor('chipBendSpot').choices!
const CAPS = sliderFor('chipEnvCap').choices!
const GHOSTS = sliderFor('chipGhost').choices!
const OUT_ADDR = sliderFor('chipOutAddr').choices!
const OUT_DATA = sliderFor('chipOutData').choices!

const TOY_TAP = CHANNELS.find(c => c.name === 'Toy keyboard')!.tap

const WIDTH = 420
const ROOM = 26
const ROW_GAP = 34
const BOX_H = boxHeight('a\nb')
const TAIL = 44
const TOP = ROOM
const LOW = ROOM + BOX_H + ROW_GAP
const HEIGHT = LOW + BOX_H + ROOM
const VOICES_W = 64
const SIDE = 11

const widest = (...names: string[]) => Math.max(...names.map(boxWidth))
const bent = (on: boolean): WireLook => (on ? 'alarm' : 'dash')

// A variable resistor from a spot on the die to ground, above or below its box.
function Pot({
  x,
  y,
  dir,
  on,
}: {
  x: number
  y: number
  dir: 1 | -1
  on: boolean
}) {
  const at = (d: number) => y + dir * d
  const zig = [4, 6, 8, 10, 12, 14, 16]
    .map((d, i) => `L${x + (i % 2 ? 3 : -3)} ${at(d)}`)
    .join(' ')
  const g = at(19)
  return (
    <g className={on ? styles.potOn : styles.pot}>
      <path
        d={`M${x} ${y} V${at(4)} ${zig} L${x} ${at(17)} V${g} M${x - 5} ${g} H${x + 5} M${x - 3} ${g + dir * 2.5} H${x + 3} M${x - 1} ${g + dir * 5} H${x + 1}`}
      />
      <path d={`M${x - 6} ${at(15)} L${x + 6} ${at(5)}`} />
      <text x={x + 9} y={at(12) + 3}>
        pot
      </text>
    </g>
  )
}

function Say({
  x,
  y,
  anchor,
  children,
}: {
  x: number
  y: number
  anchor?: 'start' | 'middle' | 'end'
  children: string
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} className={styles.knifed}>
      {children}
    </text>
  )
}

// The parts of the toy chip the pin bends reach. The key matrix and the tune ROM
// strike the voices, each voice's envelope sets its level, and the output pin
// carries every voice off the chip. One clock times the voices, the scan counter
// and the PWM carrier. Each feedback bend solders one part's signal onto another
// part, and the drawing gives each one its own red wire.
export function ToyDieDiagram() {
  const r = useReadings(KEYS)
  const read = (key: (typeof KEYS)[number]) => Math.round(r.value(key))
  const up = (key: (typeof KEYS)[number]) => r.value(key) > 0
  const flow: WireLook = useStoreSelect(
    engine.sounding,
    lit => lit & (1 << TOY_TAP),
  )
    ? 'on'
    : 'plain'

  const names = ['key matrix', 'voices', 'envelope', 'output pin']
  const widths = [
    widest('key matrix', ...GHOSTS),
    VOICES_W,
    widest('envelope', ...CAPS),
    widest('output pin', 'shorted'),
  ]
  const gap = (WIDTH - TAIL - widths.reduce((a, b) => a + b)) / 3
  const row = names.map((name, i): ChipBox => ({
    name,
    x: Math.round(widths.slice(0, i).reduce((a, b) => a + b + gap, 0)),
    y: LOW,
    w: widths[i]!,
    h: BOX_H,
  }))
  const [keys, voices, env, pin] = [row[0]!, row[1]!, row[2]!, row[3]!]
  const outOn = [
    read('chipOutAddr') > 0 ? OUT_ADDR[read('chipOutAddr')] : '',
    read('chipOutData') > 0 ? OUT_DATA[read('chipOutData')] : '',
  ].filter(Boolean)
  const rom: ChipBox = {
    name: 'tune ROM',
    x: 0,
    y: TOP,
    w: widest('tune ROM', 'A4 D5 ← out'),
    h: BOX_H,
  }
  const clockRight = pin.x + pin.w * 0.6
  const clock: ChipBox = {
    name: 'clock',
    x: voices.x + 14,
    y: TOP,
    w: clockRight - voices.x - 14,
    h: BOX_H,
  }
  const mid = LOW + BOX_H / 2
  const clockMid = TOP + BOX_H / 2
  const pinRight = pin.x + pin.w
  const tap = pinRight + 12
  const route = LOW - 10
  const tuneX = rom.x + rom.w * 0.75
  const stepFrom = voices.x + 20
  const stepTo = rom.x + rom.w * 0.3
  const spot = read('chipBendSpot')
  const scan = up('chipScan')
  const pwmTap = up('chipPwmTap')
  const stepTap = up('chipStepTap')
  const cross = up('chipCrosstalk')
  const ghost = read('chipGhost')
  const cap = read('chipEnvCap')
  const drops: [number, boolean, string][] = [
    [voices.x + voices.w / 2, false, ''],
    [env.x + env.w / 2, up('chipPwm') && !pwmTap, 'PWM'],
    [pin.x + pin.w * 0.3, scan, 'scan'],
  ]
  const potAt: Record<string, [number, number, 1 | -1]> = {
    clock: [clock.x + 14, TOP, -1],
    counter: [rom.x + rom.w / 2, TOP, -1],
    bias: [pin.x + pin.w / 2, LOW + BOX_H, 1],
    gate: [env.x + env.w / 2, LOW + BOX_H, 1],
  }
  const placed = spot > 0 ? potAt[SPOTS[spot]!] : undefined
  const loopL = env.x + env.w * 0.7
  const loopR = env.x + env.w - 5
  return (
    <Diagram width={WIDTH} height={HEIGHT} label="toy chip die">
      {arrow => (
        <>
          {row.slice(1).map((to, i) => (
            <Wire
              key={to.name}
              arrow={arrow}
              d={`M${row[i]!.x + row[i]!.w} ${mid} H${to.x}`}
              look={flow}
            />
          ))}
          <Wire
            arrow={arrow}
            d={`M${pinRight} ${mid} H${WIDTH - 2}`}
            look={flow}
          />
          <text
            x={WIDTH - 2}
            y={mid - 4}
            textAnchor="end"
            className={styles.bus}
          >
            out
          </text>
          <Wire
            arrow={arrow}
            d={`M${clock.x} ${clockMid} H${rom.x + rom.w}`}
            look={stepTap ? 'dash' : 'plain'}
          />
          <text
            x={(clock.x + rom.x + rom.w) / 2}
            y={clockMid - 4}
            textAnchor="middle"
            className={styles.bus}
          >
            tempo
          </text>
          <Wire
            arrow={arrow}
            d={`M${tuneX} ${TOP + BOX_H} V${route} H${voices.x + 10} V${LOW}`}
          />
          {stepTap && (
            <>
              <Wire
                arrow={arrow}
                d={`M${stepFrom} ${LOW} V${route - 10} H${stepTo} V${TOP + BOX_H}`}
                look="alarm"
              />
              <Say x={tuneX + 4} y={route - 13}>
                step tap
              </Say>
            </>
          )}
          {drops.map(([x, on, say]) => (
            <g key={x}>
              <Wire
                arrow={arrow}
                d={`M${x} ${TOP + BOX_H} V${LOW}`}
                look={bent(on)}
              />
              {on && (
                <Say x={x + 4} y={TOP + BOX_H + 11}>
                  {say}
                </Say>
              )}
            </g>
          ))}
          {pwmTap && (
            <>
              <Wire
                arrow={arrow}
                d={`M${voices.x + voices.w} ${mid - SIDE} H${env.x}`}
                look="alarm"
              />
              <Say
                x={(voices.x + voices.w + env.x) / 2}
                y={mid - SIDE - 4}
                anchor="middle"
              >
                PWM
              </Say>
            </>
          )}
          {up('chipEnvDiv') && (
            <>
              <Wire
                arrow={arrow}
                d={`M${env.x} ${mid + SIDE} H${voices.x + voices.w}`}
                look="alarm"
              />
              <Say
                x={(voices.x + voices.w + env.x) / 2}
                y={mid + SIDE + 11}
                anchor="middle"
              >
                dive
              </Say>
            </>
          )}
          {up('chipEnvRelax') && (
            <>
              <Wire
                d={`M${loopL} ${LOW} V${LOW - 6} H${loopR} V${LOW}`}
                look="alarm"
              />
              <Say x={env.x + env.w + 3} y={LOW - 2}>
                relax
              </Say>
            </>
          )}
          <Wire
            arrow={arrow}
            d={`M${tap} ${mid} V${clockMid} H${clockRight}`}
            look={bent(cross)}
          />
          <circle
            cx={tap}
            cy={mid}
            r={1.6}
            className={cross ? styles.solder : styles.joint}
          />
          <text
            x={WIDTH - 2}
            y={clockMid - 4}
            textAnchor="end"
            className={cross ? styles.knifed : styles.bus}
          >
            crosstalk
          </text>
          <Chip
            box={rom}
            reading={outOn.length ? `${outOn.join(' ')} ← out` : undefined}
            help="The counter that steps through the tune and the ROM that holds its notes. The output pin can be soldered onto one of its address or note-code wires."
          />
          <Chip
            box={clock}
            reading={up('chipDrift') ? 'drifting' : undefined}
            help="The crystal and its divider. Pitch, tempo, the scan counter and the PWM carrier all count off it."
          />
          <Chip
            box={keys}
            reading={ghost > 0 ? GHOSTS[ghost] : undefined}
            help="The rows and columns the keys close. With the diodes lifted, holding two keys also closes the other two corners of their rectangle."
          />
          <Chip
            box={voices}
            help="The tone generators, one a note, each with its own pitch divider."
          />
          <Chip
            box={env}
            reading={cap > 0 ? CAPS[cap] : undefined}
            help="The capacitor each note’s level follows. The PWM carrier switches that level on and off."
          />
          <Chip
            box={pin}
            reading={!scan && up('chipShort') ? 'shorted' : undefined}
            help="The pin that carries every voice off the chip. The scan counter connects one voice to it at a time, and a short ties every voice onto it."
          />
          {placed && (
            <Pot
              x={placed[0]}
              y={placed[1]}
              dir={placed[2]}
              on={up('chipBendPot')}
            />
          )}
        </>
      )}
    </Diagram>
  )
}
