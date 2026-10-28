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
import { bench, stageKit } from './bench.ts'
import {
  useControlValue,
  useMeterValue,
  useStoreValue,
} from './ControlsContext.ts'
import { DeviceVerbs } from './DeviceVerbs.tsx'
import { DrumGrid } from './DrumGrid.tsx'
import { padKeyFor } from './drumKeys.ts'
import styles from './DrumKit.module.css'
import { FaceBadge } from './FaceBadge.tsx'
import { TrigPlate } from './GateCables.tsx'
import { useCoarse, useWidth } from './measure.ts'
import { useOpenFace } from './openStage.ts'
import { RailLamp } from './RailLamp.tsx'
import { Tip } from './Tip.tsx'
import { useStruck } from './useStruck.ts'

const hit = (voice: number) => engine.drumHit(voiceBit(voice))

// DrumKit draws the toy drum machine as a moulded case with switches that run
// the pattern, arm recording and pick small or large, the pattern in
// miniature, and eight rubber pads. A pad lights on every hit the kit reports,
// from the pads, the number keys, the pattern or a trigger patch. Large, the
// case spans the main area and the miniature becomes the whole grid.
//
// The pattern and the pads render as separate components, so a step redraws
// only the pattern and a hit redraws only the pads that changed.
//
// Below this many pixels the kit's Level moves into its ⋯ menu, so the deck
// keeps one row, as a narrow keybed does. Between the two the row has no room
// for the mic cap, and Mic into on the bench bar still lists the kit's jack.
const ROOMY_KIT = 390
const ROOMY_FOR_MIC = 420

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
  const staged = useStoreValue(bench).grid
  const [kit, setKit] = useState<HTMLDivElement | null>(null)
  const width = useWidth(kit)
  const micCramped =
    width !== undefined && width >= ROOMY_KIT && width < ROOMY_FOR_MIC
  const ring = useOpenFace('Clatter')

  return (
    <div
      ref={setKit}
      className={`${staged ? styles.kitStaged : styles.kit} ${ring}`}
      role="group"
      aria-label="clatter"
    >
      <TrigPlate />
      <div className={styles.deck}>
        <FaceBadge className={styles.brand} stage="Clatter" onOpen={onOpen}>
          clatter
        </FaceBadge>
        <div className={styles.switches}>
          <RailLamp onOpen={onOpen} supply="drumSupply" />
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
          <div className={styles.size} role="group" aria-label="kit size">
            <Tip text="Folds the drum machine into its small face: the pattern in miniature over the pads.">
              <button
                className={staged ? styles.sizeOff : styles.sizeOn}
                aria-pressed={!staged}
                onClick={() => stageKit(false)}
              >
                small
              </button>
            </Tip>
            <Tip text="Spreads the drum machine across the bench, the whole grid at full size.">
              <button
                className={staged ? styles.sizeOn : styles.sizeOff}
                aria-pressed={staged}
                onClick={() => stageKit(true)}
              >
                large
              </button>
            </Tip>
          </div>
          <DeviceVerbs
            stage="Clatter"
            seconds={seconds}
            onClose={onClose}
            noMic={micCramped}
          />
        </div>
      </div>
      {staged ? (
        <div className={styles.screen} ref={showStage}>
          <DrumGrid staged />
        </div>
      ) : (
        <Pattern playing={playing} />
      )}
      <Pads />
    </div>
  )
}

const showStage = (el: HTMLDivElement | null) =>
  el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })

// The pattern in miniature, a row of lights per voice, so the kit shows what it
// plays when folded, and a recorded hit flashes on the step it went to.
// Pressing it stages the kit.
function Pattern({ playing }: { playing: boolean }) {
  const level = useControlValue('drumLevel')
  const tick = useMeterValue(m => m.tick)
  const taken = useStoreValue(engine.drumTaken)
  const rowMute = useControlValue('drumRowMute')
  // A hit taken before the pattern mounted is old news, not one to flash.
  const [old] = useState(taken)
  const fresh = taken === old ? null : taken
  const at = playing && level > 0 ? tick : -1
  const rows = DRUM_VOICES.map((voice, v) => (
    <PatternRow
      key={voice.key}
      voice={voice}
      muted={(rowMute & voiceBit(v)) !== 0}
      tick={at}
      taken={fresh && fresh.bits & voiceBit(v) ? fresh : null}
    />
  ))
  return (
    <Tip text="The pattern, a row of lights per voice. Spreads the drum machine across the bench to edit it.">
      <button
        className={styles.patternButton}
        aria-label="edit the drum pattern"
        onClick={() => stageKit(true)}
      >
        {rows}
      </button>
    </Tip>
  )
}

const PatternRow = memo(function PatternRow({
  voice,
  muted,
  tick,
  taken,
}: {
  voice: DrumVoice
  muted: boolean
  tick: number
  taken: { tick: number; at: number } | null
}) {
  const mask = useControlValue(voice.key)
  const maybe = useControlValue(voice.maybe)
  const len = asLen(useControlValue(voice.len))
  const head = tick < 0 ? -1 : tick % len
  const flash = taken ? taken.tick % len : -1
  return (
    <span className={muted ? styles.rowMuted : styles.row} aria-hidden="true">
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
