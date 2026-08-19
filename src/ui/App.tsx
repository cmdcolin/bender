import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from 'react'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { gitSha, versionLabel } from '../version'
import { BodyPad } from './BodyPad'
import { ChainMap } from './ChainMap'
import { useStoreValue } from './ControlsContext'
import { GROUPS } from './controls'
import { HuntDialog } from './HuntDialog'
import { Keys } from './Keys'
import { MidiPanel } from './MidiPanel'
import {
  loadMorph,
  MORPH_LABELS,
  MORPH_SECONDS,
  saveMorph,
  type MorphSeconds,
} from './morph'
import { Presets } from './Presets'
import { huntCandidates, mutate, randomLook, SCENARIOS } from './presets'
import { Scope } from './Scope'
import { OpenGroup, PathHint } from './Section'
import { useBoardUrl } from './useBoardUrl'
import styles from './App.module.css'
import { Tip } from './Tip'

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
      <Tip
        text={`travelling over ${props.seconds}s — press to stop here and keep the half-way board, which is a board like any other. Grabbing a slider does the same`}
      >
        <button className={styles.flight} onClick={() => engine.stopMorph()}>
          <span
            className={styles.flightFill}
            style={{ transform: `scaleX(${progress})` }}
          />
          <span className={styles.flightLabel}>stop here</span>
        </button>
      </Tip>
    )
  }
  return (
    <Tip
      text={
        props.seconds > 0
          ? `presets, random, mutate and reset travel to the new board over ${props.seconds}s instead of cutting to it. Rolling again mid-morph carries on from wherever the board has got to`
          : 'presets, random, mutate and reset land in one frame — pick a duration to make them travel there instead, which is where the sounds between two presets live'
      }
    >
      <select
        className={styles.btn}
        value={props.seconds}
        onChange={e => {
          const picked = MORPH_SECONDS.find(s => String(s) === e.target.value)
          if (picked === undefined) return
          props.onSet(picked)
          saveMorph(picked)
        }}
      >
        {MORPH_SECONDS.map(s => (
          <option key={s} value={s}>{`morph: ${MORPH_LABELS[s]}`}</option>
        ))}
      </select>
    </Tip>
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
  const [dragging, setDragging] = useState(false)
  // Which stage's controls the panel is showing. The map is the way in — every
  // group has a door on it, stages in the path and the rest on the shelf under
  // it — so one stage is open at a time and the rest of the panel stays the map.
  const [open, setOpen] = useState<string | null>(null)
  const openGroup = GROUPS.find(g => g.name === open)
  const toggle = (name: string) => setOpen(o => (o === name ? null : name))
  const [morphSeconds, setMorphSeconds] = useState<MorphSeconds>(loadMorph)
  const walk = useStoreValue(engine.history)
  const drifting = useStoreValue(engine.drifting)
  // Whether the last hunt reached the end and kept a board, as against being
  // called off, which is what the dialog stays up to say. A hunt that was
  // stopped by hand needs no note: you are holding the answer.
  const [landed, setLanded] = useState(false)
  const dismissLanded = useCallback(() => setLanded(false), [])

  useEffect(() => engine.autostart(), [])
  useBoardUrl()

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
          <Tip text="run or stop the toy chip's ROM tune. Nothing else starts it — space runs both machines">
            <button
              className={songPlaying ? styles.playBtnOn : styles.playBtn}
              onClick={() => engine.setSongPlaying(!songPlaying)}
            >
              {songPlaying ? '❚❚ pause demo song' : '▶ play demo song'}
            </button>
          </Tip>
          <Tip text="run or stop the drum machine's pattern, with or without the demo song. Bring the kit's Level up if you hear nothing">
            <button
              className={drumsPlaying ? styles.playBtnOn : styles.playBtn}
              onClick={() => engine.setDrumsPlaying(!drumsPlaying)}
            >
              {drumsPlaying ? '❚❚ pause drums' : '▶ play drums'}
            </button>
          </Tip>
          <Tip text="record the output to a wav file — stopping saves it">
            <button
              className={recording ? styles.recBtnOn : styles.ioBtn}
              onClick={() =>
                recording ? engine.stopRecording() : engine.startRecording()
              }
            >
              {recording ? `■ stop & save ${clock(recSeconds)}` : '● record'}
            </button>
          </Tip>
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
          with <span className={styles.kbd}>a s d f …</span> (
          <span className={styles.kbd}>z</span>{' '}
          <span className={styles.kbd}>x</span> for octaves) — turn up{' '}
          <b>Starve</b> until the toy reboots, solder the <b>Bend spot</b> pot,
          bridge the two boxes in <b>Trigger patch</b>, push any <b>Feedback</b>{' '}
          past 1
        </p>
      </div>

      <div className={styles.panel}>
        <div className={styles.masthead}>
          <span className={styles.brand}>bender</span>
          <Tip text={`bender ${versionLabel} (${gitSha})`}>
            <span className={styles.version}>{versionLabel}</span>
          </Tip>
        </div>

        <div className={styles.actions}>
          <Tip text="a board you have not heard: a random preset nudged off itself. It replaces the circuit — mutate keeps it, and either way your song, pattern, levels and what is running stay put">
            <button
              className={styles.btn}
              onClick={() =>
                engine.morphTo(
                  randomLook(engine.controls.get(), Math.random),
                  morphSeconds,
                )
              }
            >
              random
            </button>
          </Tip>
          <Tip text="keep this board and nudge every control around where it sits, in time: the tempo stays put and the delay, slice, roll and LFO land back on the grid — shift for wild, alt for gentle">
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
            >
              mutate
            </button>
          </Tip>
          {/* Beside mutate, because that is what it is: the same nudge, gentle,
              on a timer, forever. Nothing else on the board plays itself. */}
          <Tip
            text={
              drifting
                ? 'stop drifting and keep the board wherever it has got to'
                : 'let the board nudge itself somewhere near where it stands, every fifteen seconds, travelling most of the way there before it sets off again — a board that plays itself. Your levels, song and pattern stay put, and none of it lands in the walk: one undo puts back the board you set drifting'
            }
          >
            <button
              className={drifting ? styles.btnOn : styles.btn}
              onClick={() =>
                drifting
                  ? engine.stopDrift()
                  : engine.startDrift(() =>
                      mutate(engine.controls.get(), 0.05, Math.random),
                    )
              }
            >
              {drifting ? 'drifting…' : 'drift'}
            </button>
          </Tip>
          <Tip text="back to the board the toy ships with. It travels there like anything else, and it lands in the walk, so undo brings back whatever you were on">
            <button
              className={styles.btn}
              onClick={() =>
                engine.morphTo({ ...DEFAULT_CONTROLS }, morphSeconds)
              }
            >
              reset
            </button>
          </Tip>
          {/* Beside reset, because what undo has in common with it is what a
              hand reaching for either one wants: out of here. */}
          <Tip text="step back through the boards you have been through (ctrl+z). It arrives however morph says boards arrive, so at a long one the way back is a transition too">
            <button
              className={walk.past.length ? styles.btn : styles.btnOff}
              onClick={() => engine.undo(morphSeconds)}
              disabled={!walk.past.length}
            >
              undo
            </button>
          </Tip>
          {/* Only once there is a walk to step forward into: a permanently
              greyed redo would cost a slot in the row on every session that
              never undid anything. */}
          {walk.future.length > 0 && (
            <Tip text="step forward again (ctrl+shift+z)">
              <button
                className={styles.btn}
                onClick={() => engine.redo(morphSeconds)}
              >
                redo
              </button>
            </Tip>
          )}
        </div>

        {/* Rolls that are about how the stages sit together, so no one panel
            could offer them. The ones that are about a single stage live in
            that stage's own header, next to its reset. */}
        <div className={styles.dice}>
          {SCENARIOS.map(s => (
            <Tip key={s.name} text={s.blurb}>
              <button
                className={styles.btn}
                onClick={() =>
                  engine.morphTo(
                    s.roll(engine.controls.get(), Math.random),
                    morphSeconds,
                  )
                }
              >
                {s.label}
              </button>
            </Tip>
          ))}
          {/* The one roll that listens to what it rolled. It plays its way
              through the candidates, so it takes as long as it takes, and the
              dialog it puts up is where it says so and where it is stopped. */}
          <Tip text="roll six boards, play each of them, and keep whichever came nearest the edge of running away — judged off the limiter, which is the only thing that can tell an edge from a board that is merely loud. A dialog says which board it is on while it listens, and stops it there">
            <button
              className={styles.btn}
              onClick={() => {
                setLanded(false)
                void engine
                  .hunt(huntCandidates(engine.controls.get(), Math.random))
                  .then(best => setLanded(best !== null))
              }}
            >
              hunt an edge
            </button>
          </Tip>
        </div>
        {/* What the hunt is doing while it does it, and the only way to call
            it off: eight seconds of the board playing six strangers reads as a
            fault unless something says otherwise. */}
        <HuntDialog landed={landed} onDismiss={dismissLanded} />

        {/* How a board arrives, and how to stop one that has arrived badly.
            Below the rolls because neither one picks a board — they sit out of
            the row that does, at their own width rather than stretched across
            whatever the wrap left over. */}
        <div className={styles.utils}>
          <MorphControl seconds={morphSeconds} onSet={setMorphSeconds} />
          <Tip text="kill a runaway howl: cuts feedback to zero, tames delay feedback, and empties every delay line, buffer and held note. The board keeps its knobs — only the sound in flight goes">
            <button className={styles.btnDanger} onClick={() => engine.panic()}>
              panic
            </button>
          </Tip>
        </div>

        <Presets morphSeconds={morphSeconds} />

        <MidiPanel />

        <ChainMap open={open} onOpen={toggle} seconds={morphSeconds} />
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
