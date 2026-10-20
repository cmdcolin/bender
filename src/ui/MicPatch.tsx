import { engine } from '../engine/engine.ts'
import { ChipDrawing } from './ChipDrawing.tsx'
import { sliderFor } from './controls/index.ts'
import { useControlValue, useStoreValue } from './ControlsContext.ts'
import diagram from './Diagram.module.css'
import { BoxView, Plate, Wire } from './DiagramParts.tsx'
import styles from './MicPatch.module.css'
import { describeJack } from './micWiring.ts'
import { plugMic, toggleMic } from './plugMic.ts'
import { aimAt } from './reveal.ts'
import { Tip } from './Tip.tsx'

const DEST = sliderFor('micPatch').choices!

const DEST_W = 84
const LEFT_X = 4
const MIC_W = 46
const MIC_H = 20
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
const HEIGHT = TOP * 2 + Math.max(LIST_H, MIC_H)
const MIC_Y = TOP + LIST_H / 2 - MIC_H / 2

const onLeft = (i: number) => i < LEFT_N
const jackX = (i: number) => (onLeft(i) ? LEFT_X : RIGHT_X)
const rowY = (i: number) =>
  onLeft(i) ? TOP + i * STEP : TOP + RIGHT_DROP + (i - LEFT_N) * STEP
const cy = (y: number, h: number) => y + h / 2

// The mic between two columns of jacks, and under them what the voice does at
// the jack it is in. Pressing a jack moves the wire there, and the wire lights
// once the mic is turned up. Pressing the mic finds its level row.
export function MicPatch() {
  const patch = Math.round(useControlValue('micPatch'))
  const up = useControlValue('micLevel') > 0

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
            {DEST.map((d, i) => {
              const y = rowY(i)
              const on = i === patch
              return (
                <g
                  key={d}
                  className={styles.jack}
                  role="button"
                  tabIndex={0}
                  aria-pressed={on}
                  aria-label={`solder the mic to ${d}`}
                  opacity={on ? 1 : 0.6}
                  onClick={() => plugMic(i)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      plugMic(i)
                    }
                  }}
                >
                  <title>{`${describeJack(i)}${on ? ' (plugged in)' : ''}`}</title>
                  {on && (
                    <Wire
                      d={`M${onLeft(i) ? MIC_X : MIC_X + MIC_W} ${cy(MIC_Y, MIC_H)} L${onLeft(i) ? LEFT_X + DEST_W : RIGHT_X} ${cy(y, ROW_H)}`}
                      look={up ? 'on' : 'plain'}
                    />
                  )}
                  <Plate
                    x={jackX(i)}
                    y={y}
                    w={DEST_W}
                    h={ROW_H}
                    touched={on && up}
                    selected={on}
                  />
                  <text
                    x={jackX(i) + DEST_W / 2}
                    y={cy(y, ROW_H) + 3.5}
                    textAnchor="middle"
                    className={on ? diagram.nameOn : diagram.name}
                  >
                    {d}
                  </text>
                </g>
              )
            })}
          </>
        )}
      </ChipDrawing>
      <p className={styles.caption}>{describeJack(patch)}</p>
    </>
  )
}

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
