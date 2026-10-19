import { memo, useState } from 'react'

import {
  asLen,
  DRUM_VOICES,
  STEPS,
  stepState,
  voiceBit,
  type DrumVoice,
} from '../drums.ts'
import { engine } from '../engine/engine.ts'
import { bench, setBench } from './bench.ts'
import {
  useControlValue,
  useMeterValue,
  useStoreValue,
} from './ControlsContext.ts'
import { DeviceVerbs, DrawerSlider } from './DeviceVerbs.tsx'
import { padKeyFor } from './drumKeys.ts'
import styles from './DrumKit.module.css'
import { FaceBadge } from './FaceBadge.tsx'
import { useCoarse, useWidth } from './measure.ts'
import { RailLamp } from './RailLamp.tsx'
import { Tip } from './Tip.tsx'
import { useStruck } from './useStruck.ts'

const hit = (voice: number) => engine.drumHit(voiceBit(voice))

// DrumKit draws the toy drum machine as a moulded case with switches that run
// the pattern and arm recording, the pattern in miniature, and eight rubber
// pads. A pad lights on every hit the kit reports, from the pads, the number
// keys, the pattern or a trigger patch.
//
// The pattern and the pads render as separate components, so a step redraws
// only the pattern and a hit redraws only the pads that changed.
//
// Below this many pixels the kit's Level moves into its ⋯ menu, so the deck
// keeps one row, as a narrow keybed does.
const ROOMY_KIT = 360

export function DrumKit({
  seconds,
  onClose,
  onOpen,
}: {
  seconds?: number
  onClose?: () => void
  onOpen?: (stage: string) => void
}) {
  const playing = useStoreValue(engine.drumsPlaying)
  const armed = useStoreValue(engine.drumRecord)
  const [kit, setKit] = useState<HTMLDivElement | null>(null)
  const width = useWidth(kit)
  const levelInMenu = width !== undefined && width < ROOMY_KIT

  return (
    <div ref={setKit} className={styles.kit} role="group" aria-label="clatter">
      <div className={styles.deck}>
        <FaceBadge className={styles.brand} stage="Clatter" onOpen={onOpen}>
          drums
        </FaceBadge>
        <div className={styles.switches}>
          <RailLamp onOpen={onOpen} />
          <Tip
            text={
              playing
                ? 'Stops the drum pattern.'
                : 'Runs the drum pattern. Space runs the keyboard tune and the drums together.'
            }
          >
            <button
              className={playing ? styles.playOn : styles.play}
              aria-label={playing ? 'stop pattern' : 'start pattern'}
              aria-pressed={playing}
              onClick={() => engine.setDrumsPlaying(!playing)}
            >
              {playing ? '❚❚' : '▶'}
            </button>
          </Tip>
          <Tip
            text={
              !armed
                ? 'Records hits into the pattern on the nearest step, and runs the pattern if it is stopped.'
                : playing
                  ? 'Each hit goes to the nearest step and flashes there. Press to stop recording.'
                  : 'Recording is armed but the pattern is stopped, so hits sound and none is kept. Press play to record.'
            }
          >
            <button
              className={
                !armed ? styles.rec : playing ? styles.recOn : styles.recIdle
              }
              aria-pressed={armed}
              onClick={() => engine.armDrumRecord(!armed)}
            >
              rec
            </button>
          </Tip>
          <DeviceVerbs
            stage="Clatter"
            seconds={seconds}
            onClose={onClose}
            noLevel={levelInMenu}
            more={
              levelInMenu ? <DrawerSlider control="drumLevel" /> : undefined
            }
          />
        </div>
      </div>
      <Pattern
        playing={playing}
        onOpen={
          onOpen &&
          (() => {
            setBench({ ...bench.get(), grid: true })
            onOpen('Clatter')
          })
        }
      />
      <Pads />
    </div>
  )
}

// The pattern in miniature, a row of lights per voice, so the kit shows what it
// plays without the panel open, and a recorded hit flashes on the step it went
// to. Pressing it opens the grid.
function Pattern({
  playing,
  onOpen,
}: {
  playing: boolean
  onOpen?: () => void
}) {
  const level = useControlValue('drumLevel')
  const tick = useMeterValue(m => m.tick)
  const taken = useStoreValue(engine.drumTaken)
  // A hit taken before the pattern mounted is old news, not one to flash.
  const [old] = useState(taken)
  const fresh = taken === old ? null : taken
  const at = playing && level > 0 ? tick : -1
  const rows = DRUM_VOICES.map((voice, v) => (
    <PatternRow
      key={voice.key}
      voice={voice}
      tick={at}
      taken={fresh && fresh.bits & voiceBit(v) ? fresh : null}
    />
  ))
  if (!onOpen)
    return (
      <div className={styles.pattern} aria-hidden="true">
        {rows}
      </div>
    )
  return (
    <Tip text="The pattern, a row of lights per voice. Opens the grid to edit it.">
      <button
        className={styles.patternButton}
        aria-label="edit the drum pattern"
        onClick={onOpen}
      >
        {rows}
      </button>
    </Tip>
  )
}

const PatternRow = memo(function PatternRow({
  voice,
  tick,
  taken,
}: {
  voice: DrumVoice
  tick: number
  taken: { tick: number; at: number } | null
}) {
  const mask = useControlValue(voice.key)
  const maybe = useControlValue(voice.maybe)
  const len = asLen(useControlValue(voice.len))
  const head = tick < 0 ? -1 : tick % len
  const flash = taken ? taken.tick % len : -1
  return (
    <span className={styles.row} aria-hidden="true">
      {Array.from({ length: STEPS }, (_, s) => {
        const state = s < len ? stepState(mask, maybe, s) : 'out'
        const classes = [
          styles.cell,
          styles[state],
          s % 4 === 0 && styles.beat,
          s === head && styles.head,
          s === flash && styles.taken,
        ]
        return (
          <span
            key={s === flash ? `${s}@${taken?.at}` : s}
            className={classes.filter(Boolean).join(' ')}
          />
        )
      })}
    </span>
  )
})

function Pads() {
  const struck = useStruck()
  const coarse = useCoarse()
  return (
    <div className={styles.pads}>
      {DRUM_VOICES.map((voice, i) => (
        <Pad
          key={voice.key}
          voice={voice}
          index={i}
          lit={(struck & voiceBit(i)) !== 0}
          coarse={coarse}
        />
      ))}
    </div>
  )
}

const Pad = memo(function Pad({
  voice,
  index,
  lit,
  coarse,
}: {
  voice: DrumVoice
  index: number
  lit: boolean
  coarse: boolean
}) {
  return (
    <Tip
      text={`Plays the ${voice.label}.${coarse ? '' : ` The ${padKeyFor(index)} key plays it too.`}`}
    >
      <button
        className={lit ? styles.padOn : styles.pad}
        aria-label={`${voice.label} pad`}
        onPointerDown={e => {
          if (e.button === 0) hit(index)
        }}
        onClick={e => {
          if (e.detail === 0) hit(index)
        }}
      >
        {!coarse && <span className={styles.padKey}>{padKeyFor(index)}</span>}
        <span className={styles.padName}>{voice.label}</span>
      </button>
    </Tip>
  )
})
