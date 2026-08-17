import {
  useEffect,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from 'react'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { engine } from '../engine/engine'
import { gitSha, versionLabel } from '../version'
import { BodyPad } from './BodyPad'
import { ChainMap } from './ChainMap'
import { useStoreValue } from './ControlsContext'
import { GROUPS } from './controls'
import { Keys } from './Keys'
import {
  loadMorph,
  MORPH_LABELS,
  MORPH_SECONDS,
  saveMorph,
  type MorphSeconds,
} from './morph'
import { Presets } from './Presets'
import { mutate, randomLook, SCENARIOS } from './presets'
import { Scope } from './Scope'
import { OpenGroup, PathHint } from './Section'
import { boardUrl } from './share'
import { useBoardUrl } from './useBoardUrl'
import styles from './App.module.css'

function clock(seconds: number): string {
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// One slot holding either the duration a new board *will* take to arrive or,
// while one travels, how far along it is and the way to stop it. They are one
// widget read two ways, and the actions row has no sixth place to give.
//
// The flight readout earns its place because a long morph is otherwise
// indistinguishable from an app that ignored you: at 30s the first second moves
// almost nothing. Pressing it says "I liked it better half way", which until now
// you could only say by grabbing a slider — that is, by changing the board you
// wanted to keep.
//
// The only thing here that subscribes to the morph, deliberately: progress moves
// every frame, and held in App it would re-render the whole panel at that rate.
function MorphControl(props: {
  seconds: MorphSeconds
  onSet: (s: MorphSeconds) => void
}) {
  const progress = useSyncExternalStore(
    engine.morphProgress.subscribe,
    engine.morphProgress.get,
  )
  if (progress !== null) {
    return (
      <button
        className={styles.flight}
        onClick={() => engine.stopMorph()}
        title={`travelling over ${props.seconds}s — press to stop here and keep the half-way board, which is a board like any other. Grabbing a slider does the same`}
      >
        <span
          className={styles.flightFill}
          style={{ transform: `scaleX(${progress})` }}
        />
        <span className={styles.flightLabel}>stop here</span>
      </button>
    )
  }
  return (
    <select
      className={styles.btn}
      value={props.seconds}
      onChange={e => {
        const picked = MORPH_SECONDS.find(s => String(s) === e.target.value)
        if (picked === undefined) return
        props.onSet(picked)
        saveMorph(picked)
      }}
      title={
        props.seconds > 0
          ? `presets, random, mutate and reset travel to the new board over ${props.seconds}s instead of cutting to it. Rolling again mid-morph carries on from wherever the board has got to`
          : 'presets, random, mutate and reset land in one frame — pick a duration to make them travel there instead, which is where the sounds between two presets live'
      }
    >
      {MORPH_SECONDS.map(s => (
        <option key={s} value={s}>{`morph: ${MORPH_LABELS[s]}`}</option>
      ))}
    </select>
  )
}

export function App() {
  const running = useStoreValue(engine.running)
  const micOn = useStoreValue(engine.micOn)
  const songPlaying = useStoreValue(engine.songPlaying)
  const drumsPlaying = useStoreValue(engine.drumsPlaying)
  const recording = useStoreValue(engine.recording)
  const recSeconds = useStoreValue(engine.recSeconds)
  const sampleName = useStoreValue(engine.sampleName)
  const controls = useStoreValue(engine.controls)
  const [dragging, setDragging] = useState(false)
  // Which stage's controls the panel is showing. The map is the way in — every
  // group has a door on it, stages in the path and the rest on the shelf under
  // it — so one stage is open at a time and the rest of the panel stays the map.
  const [open, setOpen] = useState<string | null>(null)
  const openGroup = GROUPS.find(g => g.name === open)
  const toggle = (name: string) => setOpen(o => (o === name ? null : name))
  const [copied, setCopied] = useState(false)
  const [morphSeconds, setMorphSeconds] = useState<MorphSeconds>(loadMorph)
  const walk = useStoreValue(engine.history)

  useEffect(() => engine.autostart(), [])
  useBoardUrl(controls)

  // The bar already says this; the button is for handing it to someone.
  const share = () => {
    navigator.clipboard
      ?.writeText(boardUrl(engine.controls.get()))
      .catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Space is the run/stop line over both machines, wherever the focus is; the
  // keypress itself is the gesture that takes the audio context live.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey)
        return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      e.preventDefault()
      engine.toggleRun()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The walk, on the keys every other app puts it on. Repeats count: holding
  // ctrl+z is how you get back out of a run of rolls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      if (e.shiftKey) engine.redo(morphSeconds)
      else engine.undo(morphSeconds)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [morphSeconds])

  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) await engine.loadSample(file)
  }

  return (
    <div className={styles.app}>
      <div
        className={styles.left}
        onDragOver={e => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Scope />
        <Keys />
        <BodyPad onOpen={setOpen} />
        <div className={styles.ioRow}>
          {/* Two machines, two switches. The kit used to run off the demo
              song's line, so writing a pattern and hearing it meant putting the
              toy's ROM tune on underneath it. */}
          <button
            className={songPlaying ? styles.playBtnOn : styles.playBtn}
            onClick={() => engine.setSongPlaying(!songPlaying)}
            title="run or stop the toy chip's ROM tune. Nothing else starts it — space runs both machines"
          >
            {songPlaying ? '❚❚ pause demo song' : '▶ play demo song'}
          </button>
          <button
            className={drumsPlaying ? styles.playBtnOn : styles.playBtn}
            onClick={() => engine.setDrumsPlaying(!drumsPlaying)}
            title="run or stop the drum machine's pattern, with or without the demo song. Bring the kit's Level up if you hear nothing"
          >
            {drumsPlaying ? '❚❚ pause drums' : '▶ play drums'}
          </button>
          <button
            className={recording ? styles.recBtnOn : styles.ioBtn}
            onClick={() =>
              recording ? engine.stopRecording() : engine.startRecording()
            }
            title="record the output to a wav file — stopping saves it"
          >
            {recording ? `■ stop & save ${clock(recSeconds)}` : '● record'}
          </button>
          <button
            className={micOn ? styles.ioBtnOn : styles.ioBtn}
            onClick={() => engine.enableMic()}
          >
            {micOn ? '● mic live' : 'enable mic'}
          </button>
          <span className={dragging ? styles.dropHot : styles.drop}>
            {sampleName
              ? `sample: ${sampleName}`
              : 'drop an audio file anywhere'}
          </span>
        </div>
        <p className={styles.hint}>
          {!running && (
            <b className={styles.warn}>
              click anywhere to power on — loud, harsh noise ahead, start with
              your volume low.{' '}
            </b>
          )}
          press <b>play demo song</b> or <b>play drums</b> (
          <span className={styles.kbd}>space</span> runs both), or play keys
          with <span className={styles.kbd}>a s d f …</span> — turn up{' '}
          <b>Starve</b> until the toy reboots, solder the <b>Bend spot</b> pot,
          push any <b>Feedback</b> past 1
        </p>
      </div>

      <div className={styles.panel}>
        <div className={styles.masthead}>
          <span className={styles.brand}>bender</span>
          <span
            className={styles.version}
            title={`bender ${versionLabel} (${gitSha})`}
          >
            {versionLabel}
          </span>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.btn}
            onClick={() =>
              engine.morphTo(randomLook(controls, Math.random), morphSeconds)
            }
            title="a board you have not heard: a random preset nudged off itself. It replaces the circuit — mutate keeps it, and either way your song, pattern, levels and what is running stay put"
          >
            random
          </button>
          <button
            className={styles.btn}
            onClick={e =>
              engine.morphTo(
                mutate(
                  engine.controls.get(),
                  e.shiftKey ? 0.3 : e.altKey ? 0.04 : 0.12,
                  Math.random,
                ),
                morphSeconds,
              )
            }
            title="keep this board and nudge every control around where it sits, in time: the tempo stays put and the delay, slice, roll and LFO land back on the grid — shift for wild, alt for gentle"
          >
            mutate
          </button>
          <button
            className={styles.btn}
            onClick={() =>
              engine.morphTo({ ...DEFAULT_CONTROLS }, morphSeconds)
            }
          >
            reset
          </button>
          {/* Beside reset, because what undo has in common with it is what a
              hand reaching for either one wants: out of here. */}
          <button
            className={walk.past.length ? styles.btn : styles.btnOff}
            onClick={() => engine.undo(morphSeconds)}
            disabled={!walk.past.length}
            title="step back through the boards you have been through (ctrl+z). It arrives however morph says boards arrive, so at a long one the way back is a transition too"
          >
            undo
          </button>
          {/* Only once there is a walk to step forward into: a permanently
              greyed redo would cost a slot in the row on every session that
              never undid anything. */}
          {walk.future.length > 0 && (
            <button
              className={styles.btn}
              onClick={() => engine.redo(morphSeconds)}
              title="step forward again (ctrl+shift+z)"
            >
              redo
            </button>
          )}
          <MorphControl seconds={morphSeconds} onSet={setMorphSeconds} />
          <button
            className={styles.btn}
            onClick={share}
            title="copy a link that opens this exact board"
          >
            {copied ? 'copied' : 'share'}
          </button>
          <button className={styles.btnDanger} onClick={() => engine.panic()}>
            panic
          </button>
        </div>

        {/* Rolls that are about how the stages sit together, so no one panel
            could offer them. The ones that are about a single stage live in
            that stage's own header, next to its reset. */}
        <div className={styles.dice}>
          <span className={styles.diceLabel}>roll</span>
          {SCENARIOS.map(s => (
            <button
              key={s.name}
              className={styles.die}
              title={s.blurb}
              onClick={() =>
                engine.morphTo(s.roll(controls, Math.random), morphSeconds)
              }
            >
              {s.name}
            </button>
          ))}
        </div>

        <Presets controls={controls} morphSeconds={morphSeconds} />

        <ChainMap open={open} onOpen={toggle} />
        {openGroup ? (
          <OpenGroup
            group={openGroup}
            onClose={() => setOpen(null)}
            seconds={morphSeconds}
          />
        ) : (
          <PathHint />
        )}
      </div>
    </div>
  )
}
