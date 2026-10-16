import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from 'react'

import { DEFAULT_CONTROLS } from '../controls'
import { POOLS, detailsUrl } from '../engine/archive'
import { engine } from '../engine/engine'
import { pocketUrl } from '../site/paths'
import { versionLabel } from '../version'
import { AboutDialog } from './AboutDialog'
import { Account } from './Account'
import styles from './App.module.css'
import { BendKeys, LettersSwitch } from './BendKeys'
import { BodyPad } from './BodyPad'
import { ChainMap } from './ChainMap'
import { GROUPS } from './controls'
import { useBoardValue, useStoreValue } from './ControlsContext'
import { Dice } from './Dice'
import { DoorsDialog } from './DoorsDialog'
import { useDrumKeys } from './drumKeys'
import { DrumKit } from './DrumKit'
import { FmKeys } from './FmKeys'
import { HuntDialog } from './HuntDialog'
import { isTyping } from './isTyping'
import { Keys } from './Keys'
import { Menu } from './Menu'
import { menuItem } from './menuItems'
import { MidiMenuItem, MidiPanel } from './MidiPanel'
import { MonoKeys } from './MonoKeys'
import {
  loadMorph,
  MORPH_LABELS,
  MORPH_SECONDS,
  saveMorph,
  type MorphSeconds,
} from './morph'
import { PcmKeys } from './PcmKeys'
import { Presets } from './PresetRow'
import { mutate, presetNameFor } from './presets'
import { SampleReel } from './SampleReel'
import { SavedVoices } from './SavedVoices'
import { Scope } from './Scope'
import { OpenGroup, PathHint } from './Section'
import { boardFrom, boardFromUrl, boardHash } from './share'
import { StartOverlay } from './StartOverlay'
import { Cassette, ReelDeck } from './StudioArt'
import { Tip } from './Tip'
import { useBoardUrl } from './useBoardUrl'
import { useCurrentSession } from './useCurrentSession'
import { useSavedVoices } from './useSavedVoices'
import { suggestVoiceName, type SavedVoice } from './voiceModel'
import { WhySignInDialog } from './WhySignInDialog'

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
//
// A drift travels too, and this stays the duration picker through it: the leg
// is the drift's own length rather than the one this names, stopping it here
// keeps the board for fifteen seconds and no longer, and the picker is the only
// place the next roll's duration is set — so a drift must not take it away for
// as long as it runs. Drift's own button is what stops a drift.
const MUTATE_HELP =
  'Keeps this board and nudges every control a little way off where it sits. The tempo stays put and the timed things land back on the grid — shift for a wild nudge, alt for a gentle one.'

// Beside mutate, because that is what it is: the same nudge, gentle, on a
// timer, forever. Nothing else on the board plays itself.
const DRIFT_HELP =
  'Lets the board nudge itself somewhere near where it stands, every fifteen seconds, forever. None of it lands in the walk, so one undo puts back the board you set drifting.'

// Save sits in the row of verbs, among the other things you do to the board on
// screen. Beside the nameplate, `saved` holds the list and the avatar holds the
// account.
const SAVE_HELP =
  'Keeps the board on screen as a voice, under the name the saved menu is offering. ctrl+S does the same. Saving again under that name overwrites that voice.'

// The same button with nobody signed in. It stays live, and a press opens the
// card that says what an account is for.
const SAVE_SIGNED_OUT_HELP =
  'Keeps the board on screen under a name, on your account. Press it to read what an account is for; the board you are looking at is saved as soon as you sign in.'

function MorphControl(props: {
  seconds: MorphSeconds
  drifting: boolean
  onSet: (s: MorphSeconds) => void
}) {
  const progress = useSyncExternalStore(
    engine.morphProgress.subscribe,
    engine.morphProgress.get,
  )
  if (progress !== null && !props.drifting) {
    return (
      <Tip
        text={`Travelling over ${props.seconds}s. Press to stop here and keep the half-way board — grabbing a slider does the same.`}
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
          ? `Presets, random, mutate and reset travel to the new board over ${props.seconds}s instead of cutting to it.`
          : 'Presets, random, mutate and reset land in one frame. Pick a duration and they travel there instead — which is where the sounds between two presets live.'
      }
    >
      <select
        className={styles.morph}
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

// The board as the address bar spells it, which is what a voice holds.
const boardQuery = () => boardHash(window.location.hash, engine.controls.get())

const copyLink = (query: string) => {
  const { origin, pathname } = window.location
  return navigator.clipboard
    .writeText(`${origin}${pathname}#${query}`)
    .then(() => true)
    .catch(() => false)
}

export function App(props: { openedFromLink?: boolean; openedBare?: boolean }) {
  const running = useStoreValue(engine.running)
  const micOn = useStoreValue(engine.micOn)
  // The switch runs whichever tune the chip is on, and the melody memory is one
  // of them — writing the roll puts the chip on yours, so a button that says
  // demo song from then on is naming something it is not playing.
  const recording = useStoreValue(engine.recording)
  // A phone has no space bar and no number row, so the way in is the buttons
  // and the keys themselves. Naming shortcuts nobody can press is a paragraph
  // of the first thing anyone reads spent on somebody else's machine.
  const recSeconds = useStoreValue(engine.recSeconds)
  const recStems = useStoreValue(engine.recStems)
  const recError = useStoreValue(engine.recError)
  const recNote = useStoreValue(engine.recNote)
  const sampleName = useStoreValue(engine.sampleName)
  const archiveStep = useStoreValue(engine.archiveStep)
  const archiveSource = useStoreValue(engine.archiveSource)
  const fmUp = useBoardValue(c => c.fmLevel > 0)
  const pcmUp = useBoardValue(c => c.pcmLevel > 0)
  const monoUp = useBoardValue(c => c.monoLevel > 0)
  const [dragging, setDragging] = useState(false)
  const [pool, setPool] = useState(0)
  const tapeRunning = useBoardValue(c => c.sampleLevel > 0)
  // Which stage's controls the panel is showing. The map is the way in — every
  // group has a door on it, the stages along the path and the rest of the board
  // drawn where it sits — so one stage is open at a time and the rest of the
  // panel stays the map.
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
  // Up once, for a board that arrived from a link: closing it, by either
  // door, is the last anyone hears of it — pressing play from the row below
  // afterwards is a second gesture and gets no overlay to answer to.
  const [showStart, setShowStart] = useState(!!props.openedFromLink)
  const [showDoors, setShowDoors] = useState(!!props.openedBare)
  const [showAbout, setShowAbout] = useState(false)
  // Why an account, and the name of the save waiting on the answer. `null` is
  // shut, and `{ pending: null }` is the card opened from the menu with no save
  // behind it.
  const [why, setWhy] = useState<{ pending: string | null } | null>(null)
  const [showOptions, setShowOptions] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showMidi, setShowMidi] = useState(false)
  const [menuBtn, setMenuBtn] = useState<HTMLButtonElement | null>(null)

  const lib = useSavedVoices()
  const libUid = lib.user?.uid ?? null
  const signedIn = lib.status === 'ready'

  // What the name box offers: the preset the board is standing on, or the voice
  // last saved or recalled, counted up once that name is taken.
  const suggestName = () =>
    suggestVoiceName(
      lib.voices,
      lib.lastName ?? presetNameFor(engine.controls.get()) ?? 'my voice',
    )

  // Recall morphs, the way pressing a preset chip does. An open lands the whole
  // board at once by putting it on the address bar — useBoardUrl hears the
  // hashchange and applies it, which is exactly what arriving on a link does.
  const recall = (voice: SavedVoice) => {
    const patch = boardFromUrl('', `#${voice.query}`)
    if (patch !== null)
      engine.morphTo(boardFrom(patch, engine.controls.get()), morphSeconds)
    lib.markRecalled(voice.name)
  }
  const openVoice = (voice: SavedVoice) => {
    window.location.hash = voice.query
    lib.markRecalled(voice.name)
  }

  useEffect(() => engine.autostart(), [])
  useBoardUrl()
  useCurrentSession(libUid)
  useDrumKeys()

  // Space is the run/stop line over both machines, wherever the focus is; the
  // keypress itself is the gesture that takes the audio context live.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey)
        return
      // A select included: space is the only way a keyboard opens one, and the
      // panel picks a morph duration, a row length and half its choices that
      // way. A focused button is not — space over one is still the run line,
      // which is the point of running it over the whole window.
      if (isTyping(e.target)) return
      e.preventDefault()
      engine.toggleRun()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // A save with nobody signed in opens the why-sign-in card. useSavedVoices
  // holds the board, so signing in from the card saves what was on screen when
  // the key went down.
  const askSave = () => {
    const name = suggestName()
    if (lib.saveVoice(name, boardQuery()) === 'needs-auth')
      setWhy({ pending: name })
  }

  // Read at keypress time rather than closed over when the listener went on,
  // so the handler goes on the window once and still saves the board and the
  // library as they are now.
  const save = useRef(() => {})
  // oxlint-disable-next-line react/refs -- the keydown listener reads the latest save handler through this ref
  save.current = askSave

  // Save, on the key every application that saves anything puts it on. The
  // board is not a document and the browser's own dialog would offer to write
  // the page to disk, so the default goes either way.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() !== 's' ||
        !(e.ctrlKey || e.metaKey) ||
        e.shiftKey
      )
        return
      e.preventDefault()
      save.current()
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
    // The whole window takes the drop, because the hint says anywhere and a
    // dragover nobody cancels is a drop the browser takes itself — which on the
    // panel, half the width of the app, meant navigating away from the board.
    // Dragleave fires on the way into a child as well, so the flag only clears
    // for a pointer that has left the app entirely.
    <div
      className={styles.app}
      onDragOver={e => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={e => {
        if (
          !e.currentTarget.contains(
            e.relatedTarget instanceof Node ? e.relatedTarget : null,
          )
        )
          setDragging(false)
      }}
      onDrop={onDrop}
    >
      <main className={styles.left}>
        {/* Wrapped so the narrow layout can send it to the end: a trace with
            nothing on it is the first screen of a phone otherwise. */}
        <div className={styles.scope}>
          <Scope />
        </div>
        <div className={styles.shelf}>
          <Keys />
          <DrumKit />
        </div>
        {/* The FM, home and mono keyboards show only while their levels
            are above zero. */}
        {(fmUp || pcmUp || monoUp) && (
          <div className={styles.shelf}>
            {fmUp && <FmKeys />}
            {pcmUp && <PcmKeys />}
            {monoUp && <MonoKeys />}
          </div>
        )}
        <BodyPad onOpen={setOpen} />
        <div className={styles.studio}>
          <section className={styles.box} aria-label="recorder">
            <span className={styles.label}>recorder</span>
            <div className={styles.artRow}>
              <Cassette running={recording} />
              <div className={styles.controls}>
                <div className={styles.ioRow}>
                  <span
                    className={recording ? styles.counterOn : styles.counter}
                    role="timer"
                    aria-label="take time"
                  >
                    {clock(recSeconds)}
                  </span>
                  <Tip
                    text={
                      recStems
                        ? 'Records the output and every source that had something on it — stopping saves the lot.'
                        : 'Records the output to a wav file — stopping saves it.'
                    }
                  >
                    <button
                      className={recording ? styles.recBtnOn : styles.ioBtn}
                      onClick={() =>
                        recording
                          ? engine.stopRecording()
                          : engine.startRecording()
                      }
                    >
                      {recording
                        ? `■ stop & save ${clock(recSeconds)}`
                        : recStems
                          ? '● record stems'
                          : '● record wav'}
                    </button>
                  </Tip>
                  <button
                    className={showOptions ? styles.ioBtnToggled : styles.ioBtn}
                    aria-expanded={showOptions}
                    onClick={() => setShowOptions(o => !o)}
                  >
                    options
                  </button>
                </div>
                {recError && (
                  <p className={styles.recError} role="alert">
                    the take was not saved: {recError}
                  </p>
                )}
                {recNote && (
                  <p className={styles.rolling} role="status">
                    {recNote}
                  </p>
                )}
                {showOptions && (
                  <div className={styles.ioRow}>
                    <Tip text="Saves the last 30 seconds you heard as a wav, even if you were not recording.">
                      <button
                        className={styles.ioBtn}
                        onClick={() => engine.keepLast('wav')}
                      >
                        save the last 30 s
                      </button>
                    </Tip>
                    <Tip text="Puts the last 30 seconds you heard on the sampler's tape, to play back through the board.">
                      <button
                        className={styles.ioBtn}
                        onClick={() => engine.keepLast('reel')}
                      >
                        last 30 s → sampler
                      </button>
                    </Tip>
                    <Tip text="Also saves each machine on its own, dry, one wav each — what you drag into a DAW. Locked while a take runs.">
                      <button
                        className={
                          recStems ? styles.ioBtnToggled : styles.ioBtn
                        }
                        aria-pressed={recStems}
                        disabled={recording}
                        onClick={() => engine.recStems.set(!recStems)}
                      >
                        one wav per machine
                      </button>
                    </Tip>
                  </div>
                )}
              </div>
            </div>
          </section>
          <section className={styles.box} aria-label="sampler">
            <span className={styles.label}>sampler</span>
            <div className={styles.artRow}>
              <ReelDeck
                name={sampleName || null}
                running={tapeRunning && !!sampleName}
                hot={dragging}
              />
              <div className={styles.controls}>
                <div className={styles.ioRow}>
                  {(!sampleName || dragging) && (
                    <span className={dragging ? styles.dropHot : styles.drop}>
                      drop an audio file anywhere
                    </span>
                  )}
                  <Tip text="Starts or stops the tape. A one-shot starts again from the front.">
                    <button
                      className={
                        tapeRunning ? styles.ioBtnToggled : styles.ioBtn
                      }
                      aria-pressed={tapeRunning}
                      disabled={!sampleName}
                      onClick={() => {
                        const c = engine.controls.get()
                        if (tapeRunning) {
                          engine.set('sampleLevel', 0)
                          return
                        }
                        engine.set('sampleLevel', 0.7)
                        if (c.sampleMode === 1)
                          engine.seekSample(Math.min(c.loopIn, c.loopOut))
                      }}
                    >
                      {tapeRunning ? '■ stop' : '▶ play'}
                    </button>
                  </Tip>
                  <Tip text="Pulls a random tape off archive.org and puts it on the sampler. The shelf beside it picks what kind.">
                    <button
                      className={styles.ioBtn}
                      onClick={() =>
                        archiveStep
                          ? engine.cancelRoll()
                          : engine.rollSample(POOLS[pool]!)
                      }
                    >
                      {archiveStep ? '✕ cancel' : '⚄ load a tape'}
                    </button>
                  </Tip>
                  <Tip text={POOLS[pool]!.blurb}>
                    <select
                      className={styles.pool}
                      aria-label="the shelf the tape comes from"
                      value={pool}
                      onChange={e => setPool(Number(e.target.value))}
                    >
                      {POOLS.map((p, i) => (
                        <option key={p.label} value={i}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </Tip>
                  <button
                    className={micOn ? styles.ioBtnOn : styles.ioBtn}
                    onClick={() => engine.enableMic()}
                  >
                    {micOn ? '● mic' : 'mic'}
                  </button>
                </div>
              </div>
            </div>
            <SampleReel>
              {!archiveStep && archiveSource && (
                <a
                  className={styles.credit}
                  href={detailsUrl(archiveSource.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  archive.org/{archiveSource.id}
                </a>
              )}
            </SampleReel>
            {archiveStep && <p className={styles.rolling}>{archiveStep}</p>}
          </section>
        </div>
        <BendKeys morphSeconds={morphSeconds} />
        {!running && (
          <p className={styles.hint}>
            <b className={styles.warn}>
              click anywhere to power on — loud, harsh noise ahead, start with
              your volume low.
            </b>
          </p>
        )}
      </main>

      <aside className={styles.panel} aria-label="the board">
        {/* Pinned to the top of the panel while the rest of it scrolls: panic
            and undo are the two ways out of a board gone wrong, and both used
            to leave the screen the moment a stage was opened under the map. */}
        <div className={styles.chrome}>
          {/* The nameplate, and beside it how a board arrives and how to stop one
            that has arrived badly. Neither of those picks a board, so they stay
            out of the rows that do — and a duration picker is not worth a line
            of the panel's height on its own. */}
          <div className={styles.head}>
            {/* The nameplate is the way in to what this is: a link to the source
              and the docs has nowhere else to live on a panel made of stages,
              and the build it names is the first thing a bug report is asked
              for. */}
            <Tip text="What this is, where the docs and the source are, and which build you are on.">
              <button
                className={styles.nameplate}
                onClick={() => setShowAbout(true)}
              >
                <span className={styles.brand}>bender</span>
                <span className={styles.version}>{versionLabel}</span>
              </button>
            </Tip>
            <MorphControl
              seconds={morphSeconds}
              drifting={drifting}
              onSet={setMorphSeconds}
            />
            {/* About the board as a whole rather than any one stage of it. */}
            <MidiPanel
              open={showMidi}
              onToggle={() => setShowMidi(o => !o)}
              onClose={() => setShowMidi(false)}
            />
            {/* Beside the MIDI drawer for the same reason it is: a fact about
              the session rather than a verb over the board. */}
            <SavedVoices
              voices={lib.voices}
              suggestName={suggestName}
              onSave={name => lib.saveVoice(name, boardQuery())}
              onRecall={recall}
              onOpen={openVoice}
              onDelete={lib.deleteVoice}
              onCopyLink={voice => copyLink(voice.query)}
              flash={lib.flash}
              status={lib.status}
              error={lib.error}
            />
            {/* The account, beside the library. The two shared one button,
                whose label alternated between `saved` and `sign in`. */}
            <Account
              user={lib.user}
              status={lib.status}
              onSignIn={lib.signIn}
              onSignOut={lib.signOut}
            />
            <Tip text="About this build, and where the docs and source are.">
              <button
                ref={setMenuBtn}
                className={styles.menuBtn}
                aria-label="menu"
                aria-expanded={showMenu}
                onClick={() => setShowMenu(o => !o)}
              >
                ☰
              </button>
            </Tip>
            {showMenu && (
              <Menu
                anchor={menuBtn}
                toggle={menuBtn}
                role="menu"
                onClose={() => setShowMenu(false)}
              >
                {/* Only with nobody signed in; a signed-in reader has the
                    answer already. */}
                {signedIn || (
                  <button
                    role="menuitem"
                    className={menuItem(false)}
                    onClick={() => {
                      setShowMenu(false)
                      setWhy({ pending: null })
                    }}
                  >
                    why sign in?
                  </button>
                )}
                <button
                  role="menuitem"
                  className={menuItem(false)}
                  onClick={() => {
                    setShowMenu(false)
                    setShowAbout(true)
                  }}
                >
                  about
                </button>
                <button
                  role="menuitem"
                  className={menuItem(false)}
                  onClick={() => {
                    window.location.href = `${pocketUrl}${window.location.hash}`
                  }}
                >
                  phone version
                </button>
                <MidiMenuItem
                  className={menuItem(false)}
                  onPick={() => {
                    setShowMenu(false)
                    setShowMidi(true)
                  }}
                />
              </Menu>
            )}
          </div>

          <div className={styles.actions}>
            <Dice seconds={morphSeconds} onLanded={setLanded} />
            <Tip text={MUTATE_HELP}>
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
                  : DRIFT_HELP
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
                <span className={styles.holdsWidest}>
                  {drifting || (
                    <span className={styles.widest} aria-hidden>
                      drifting…
                    </span>
                  )}
                  <span>{drifting ? 'drifting…' : 'drift'}</span>
                </span>
              </button>
            </Tip>
            {drifting && (
              <Tip text="Stop drifting and go back to where it was ten seconds ago.">
                <button
                  className={styles.btn}
                  onClick={() => engine.driftBack(10, morphSeconds)}
                >
                  ⟲ 10s
                </button>
              </Tip>
            )}
            <Tip text="Back to the board the toy ships with. It lands in the walk, so undo brings back whatever you were on.">
              <button
                className={styles.btnQuiet}
                onClick={() =>
                  engine.morphTo({ ...DEFAULT_CONTROLS }, morphSeconds)
                }
              >
                reset
              </button>
            </Tip>
            {/* Between the verbs that change the board and the two that step
              back through it. The label holds the width of its own ✓, so the
              row keeps still as a save lands. */}
            <Tip text={signedIn ? SAVE_HELP : SAVE_SIGNED_OUT_HELP}>
              <button
                className={
                  lib.flash?.kind === 'failed' ? styles.btnBad : styles.btn
                }
                onClick={askSave}
              >
                <span className={styles.holdsWidest}>
                  <span className={styles.widest} aria-hidden>
                    saved ✓
                  </span>
                  <span>
                    {lib.flash?.kind === 'saved'
                      ? 'saved ✓'
                      : lib.flash?.kind === 'failed'
                        ? 'save ✕'
                        : 'save'}
                  </span>
                </span>
              </button>
            </Tip>
            {/* Beside reset, because what undo has in common with it is what a
              hand reaching for either one wants: out of here. */}
            <Tip text="Steps back through the boards you have been through (ctrl+z).">
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
              <Tip text="Steps forward again (ctrl+shift+z).">
                <button
                  className={styles.btn}
                  onClick={() => engine.redo(morphSeconds)}
                >
                  redo
                </button>
              </Tip>
            )}
          </div>
        </div>

        {/* What the hunt is doing while it does it, and the only way to call
            it off: eight seconds of the board playing six strangers reads as a
            fault unless something says otherwise. */}
        <HuntDialog landed={landed} onDismiss={dismissLanded} />

        {/* A link opens a board nobody has heard yet, with the two run
            buttons buried in the row below — this is what says where to
            press and starts both machines together, eased up rather than
            landing at whatever level the board was left. */}
        {showStart && <StartOverlay onClose={() => setShowStart(false)} />}

        {showDoors && <DoorsDialog onClose={() => setShowDoors(false)} />}

        {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}

        {/* Closing on the way to the popup leaves the Google window clear.
            The save the card was holding lands on the save button below. */}
        {why && (
          <WhySignInDialog
            pendingName={why.pending}
            onClose={() => {
              setWhy(null)
              lib.dropPending()
            }}
            onSignIn={() => {
              setWhy(null)
              lib.signIn()
            }}
            onCopyLink={() => copyLink(boardQuery())}
          />
        )}

        <div className={styles.lettersRow}>
          <span className={styles.rowLabel}>letters</span>
          <LettersSwitch />
        </div>
        <Presets morphSeconds={morphSeconds} folded />
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
      </aside>
    </div>
  )
}
