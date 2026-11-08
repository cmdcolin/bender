import { useState } from 'react'

import { engine } from '../engine/engine.ts'
import { ChipDrawing } from './ChipDrawing.tsx'
import { sliderFor } from './controls/index.ts'
import {
  useBoardValue,
  useControlValue,
  useStoreValue,
} from './ControlsContext.ts'
import diagram from './Diagram.module.css'
import { BoxView, Plate, Wire } from './DiagramParts.tsx'
import styles from './MicPatch.module.css'
import { describeJack, wireIsLate } from './micWiring.ts'
import { plugMic, plugSecond, toggleMic, unplugSecond } from './plugMic.ts'
import { aimAt } from './reveal.ts'
import { Tip } from './Tip.tsx'

const DEST = sliderFor('micPatch').choices!

const DEST_W = 84
const LEFT_X = 4
const MIC_W = 46
const MIC_H = 20
const BOX_GAP = 10
const REACH = 26
const MIC_X = LEFT_X + DEST_W + REACH
const RIGHT_X = MIC_X + MIC_W + REACH
const WIDTH = RIGHT_X + DEST_W + 4
const ROW_H = 15
const STEP = ROW_H + 3
const TOP = 3
const LEFT_N = Math.ceil(DEST.length / 2)
// An odd count sets the shorter right column half a row down, centred on the
// left one.
const RIGHT_DROP = DEST.length - LEFT_N < LEFT_N ? STEP / 2 : 0
const LIST_H =
  Math.max(LEFT_N * STEP, RIGHT_DROP + (DEST.length - LEFT_N) * STEP) - 3
const CENTRE_H = MIC_H * 3 + BOX_GAP * 2
const HEIGHT = TOP * 2 + Math.max(LIST_H, CENTRE_H)
const MIC_Y = TOP + LIST_H / 2 - CENTRE_H / 2
const DELAY_Y = MIC_Y + MIC_H + BOX_GAP
const FREEZE_Y = DELAY_Y + MIC_H + BOX_GAP
const MID_X = MIC_X + MIC_W / 2

const onLeft = (i: number) => i < LEFT_N
const jackX = (i: number) => (onLeft(i) ? LEFT_X : RIGHT_X)
const rowY = (i: number) =>
  onLeft(i) ? TOP + i * STEP : TOP + RIGHT_DROP + (i - LEFT_N) * STEP
const cy = (y: number, h: number) => y + h / 2

type WireNo = 1 | 2

const press = (wire: WireNo, jack: number, onSecond: boolean) =>
  wire === 1 ? plugMic(jack) : onSecond ? unplugSecond() : plugSecond(jack)

function toggleFreeze() {
  engine.armStep()
  engine.set('micFreeze', engine.controls.get().micFreeze >= 0.5 ? 0 : 1)
}

// The mic in the middle of two columns of jacks, the delay and its freeze
// switch under it, and under the drawing what the voice does at each jack it
// is in. A wire runs from the mic, or from the delay where the delay sits on
// it. Pressing a jack moves the wire picked under the drawing there.
export function MicPatch() {
  const first = Math.round(useControlValue('micPatch'))
  const second = Math.round(useControlValue('micPatch2')) - 1
  const up = useControlValue('micLevel') > 0
  const late1 = useBoardValue(c => wireIsLate(c, 1))
  const late2 = useBoardValue(c => c.micPatch2 > 0 && wireIsLate(c, 2))
  const delayUp = useControlValue('micDelay') > 0
  const frozen = useControlValue('micFreeze') >= 0.5
  const [moving, setMoving] = useState<WireNo>(1)
  const lateOn = (wire: WireNo) => (wire === 1 ? late1 : late2)
  const wireAt = (i: number): WireNo | 0 =>
    i === first ? 1 : i === second ? 2 : 0

  return (
    <>
      <ChipDrawing
        maxWidth={WIDTH}
        width={WIDTH}
        height={HEIGHT}
        label="mic patch"
      >
        {() => (
          <>
            <BoxView
              box={{
                id: 'mic',
                keys: ['micLevel'],
                x: MIC_X,
                y: MIC_Y,
                w: MIC_W,
                h: MIC_H,
                name: 'mic',
                touched: up,
                help: 'The microphone. Its level is the row under the drawing.',
              }}
              onSelect={() => aimAt('micLevel')}
            />
            {(late1 || late2) && (
              <Wire
                d={`M${MID_X} ${MIC_Y + MIC_H} L${MID_X} ${DELAY_Y}`}
                look={up ? 'on' : 'plain'}
              />
            )}
            <BoxView
              box={{
                id: 'delay',
                keys: ['micDelay', 'micRepeats', 'micDelaySync', 'micDelayOn'],
                x: MIC_X,
                y: DELAY_Y,
                w: MIC_W,
                h: MIC_H,
                name: 'delay',
                touched: delayUp,
                off: !delayUp,
                help: 'A delay line between the mic and the jack. Turned up, the jack hears you late. Its rows are under the drawing.',
              }}
              onSelect={() => aimAt('micDelay')}
            />
            {delayUp && (
              <Wire
                d={`M${MID_X} ${DELAY_Y + MIC_H} L${MID_X} ${FREEZE_Y}`}
                look={frozen ? 'on' : 'plain'}
              />
            )}
            <BoxView
              box={{
                id: 'freeze',
                keys: ['micFreeze'],
                x: MIC_X,
                y: FREEZE_Y,
                w: MIC_W,
                h: MIC_H,
                name: 'freeze',
                touched: frozen,
                off: !delayUp,
                help: 'Holds what is in the delay and plays it round and round. Press to switch it.',
              }}
              onSelect={() => toggleFreeze()}
            />
            {DEST.map((d, i) => {
              const y = rowY(i)
              const wire = wireAt(i)
              const fromY = wire && lateOn(wire) ? DELAY_Y : MIC_Y
              return (
                <g
                  key={d}
                  className={styles.jack}
                  role="button"
                  tabIndex={0}
                  aria-pressed={wire === moving}
                  aria-label={`solder the ${moving === 1 ? 'mic' : 'second wire'} to ${d}`}
                  opacity={wire ? 1 : 0.6}
                  onClick={() => press(moving, i, wire === 2)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (!e.repeat) press(moving, i, wire === 2)
                    }
                  }}
                >
                  <title>{`${describeJack(i)}${wire === 1 ? ' (plugged in)' : wire === 2 ? ' (second wire)' : ''}`}</title>
                  {wire > 0 && (
                    <Wire
                      d={`M${onLeft(i) ? MIC_X : MIC_X + MIC_W} ${cy(fromY, MIC_H)} L${onLeft(i) ? LEFT_X + DEST_W : RIGHT_X} ${cy(y, ROW_H)}`}
                      look={up ? 'on' : 'plain'}
                    />
                  )}
                  <Plate
                    x={jackX(i)}
                    y={y}
                    w={DEST_W}
                    h={ROW_H}
                    touched={wire > 0 && up}
                    selected={wire > 0}
                  />
                  <text
                    x={jackX(i) + DEST_W / 2}
                    y={cy(y, ROW_H) + 3.5}
                    textAnchor="middle"
                    className={wire ? diagram.nameOn : diagram.name}
                  >
                    {d}
                  </text>
                </g>
              )
            })}
          </>
        )}
      </ChipDrawing>
      <div className={styles.wires} role="group" aria-label="a press moves">
        {([1, 2] as const).map(w => (
          <button
            key={w}
            className={moving === w ? styles.wireOn : styles.wire}
            aria-pressed={moving === w}
            onClick={() => setMoving(w)}
          >
            {w === 1 ? 'first wire' : 'second wire'}
          </button>
        ))}
      </div>
      <p className={styles.caption}>{caption(first, second, late1, late2)}</p>
    </>
  )
}

const jackLine = (jack: number, late: boolean) =>
  `${describeJack(jack)}${late ? ', through the delay' : ''}.`

const caption = (
  first: number,
  second: number,
  late1: boolean,
  late2: boolean,
) =>
  second >= 0 && second !== first
    ? `${jackLine(first, late1)} ${jackLine(second, late2)}`
    : jackLine(first, late1)

/** Opens the microphone or closes it, from the Mic stage's own header. */
export function MicSwitch() {
  const on = useStoreValue(engine.micOn)
  const error = useStoreValue(engine.micError)
  return (
    <>
      <Tip
        text={
          on
            ? 'Closes the microphone and takes it off the board.'
            : 'Opens the microphone as an input to the board.'
        }
      >
        <button
          className={on ? styles.switchOn : styles.switch}
          aria-pressed={on}
          onClick={toggleMic}
        >
          open mic
        </button>
      </Tip>
      {error !== '' && (
        <span className={styles.micError} role="alert">
          {error}
        </span>
      )}
    </>
  )
}
