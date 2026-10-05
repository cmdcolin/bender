# Stem recording — handoff

Branch `worktree-agent-adf1c0a0e5b48297a`, commit `3d89d2b`, on top of
`a49333c`. `pnpm typecheck` clean, `pnpm test` 751/751 green across 67 files.

## Done

Feature is complete and shippable. Nothing is half-built.

- `src/dsp/chain.ts` — `Chain.stems` (`Float32Array(MAX_SOURCES * BLOCK)`, mono,
  source-major) and `Chain.capturing`. Written inside the existing source loop
  in `process()` as the same bus difference the meter taps use, with a second
  history buffer `tapPrevR` for the right channel. `panic()` clears both.
- `src/dsp/worklet.ts` — `stemSlabs` (6 × `REC_CHUNK` mono), `recStems`, and a
  new `lay(l, r, n)` that copies the block onto the tape in slab-sized pieces.
  The master recording used to ride inside the scope/peak loop; it does not any
  more. `flushRec` posts `stems: this.stemSlabs` (untransferred) only on a stem
  take.
- `src/engine/messages.ts` — `RecordMsg.stems?`,
  `RecMsg.stems?: Float32Array[]`.
- `src/engine/wav.ts` — `encodeMonoWav(chunks: Float32Array[], sr)` beside
  `encodeWav`; both go through a shared `riff(frames, channels, sr)`.
- `src/engine/engine.ts` — `recStems` store, `stemTake`/`stemLive`, `keepStems`,
  `saveTake` splitting into `download(blob, name)`, `REC_MAX_STEM_S = 120`,
  `STEM_FLOOR = 1e-4`.
- `src/engine/params.ts` — `STEM_FILES` (`toy drums fm chaos noise sampler`),
  parallel to `SOURCE_TAPS`.
- `src/ui/App.tsx` / `App.module.css` — a `<select>` beside the record button,
  disabled while recording; `.pool:disabled` style.
- `src/dsp/testRender.ts` — `renderStems(overrides, seconds, setup?)` returns
  `{ master, stems }`.
- Tests: `src/dsp/stems.test.ts` (6) and two added to `src/engine/wav.test.ts`.
- `docs/USER-GUIDE.md` — a "Stems" subsection under Playback and recording.

## Design decisions

- **Tap point: pre-bus, as the difference each source made to the sum.** Bends,
  pedals, brownout, tape and the limiter all run on the sum; a post-bus stem
  would mean six chain instances. Documented in the guide and in the doc comment
  on `Chain.stems`.
- **Mono.** Five of the six sources write the identical sample to both channels
  (`grep 'io.r' src/dsp/stages/*.ts` — only `noise.ts` decorrelates). The stem
  is `0.5 * (dL + dR)`; the noise loses width, the master keeps it.
- **The mode is UI state, not a board control.** A control rides in the URL, in
  presets, in the undo walk and through a morph — none of which have anything to
  say about which files land in a folder. So no `controls.ts` / `params.ts` /
  `URL_KEY_ORDER` / slider registration, and `docs/features.md` is unchanged.
- **786 kB of stem slabs allocated in the worklet constructor**, idle or not, so
  arming a stem take never allocates on the audio thread.
- **Take cap 120 s for stems** (~184 MB of float held in the tab) vs 600 s for
  master-only. `onRecChunk` picks the cap off `this.stemTake.length`.
- **No zip.** Up to seven `a.click()` downloads in one burst; the guide warns
  about the browser's multiple-download prompt.

## Traps

- `crushBits` / `crushRate` do not exist. The crusher's controls are `bits`,
  `srHz`, `srJitter`, `crushMix` — and `crushMix > 0` is its `when` guard, so a
  bend test that only sets `bendSlot0: 2` changes nothing.
- `ToyChip.when()` returns true when `drumLevel` or `fmLevel` is up even with
  `chipLevel` at 0, so the stage runs and contributes nothing. A stem that were
  "whatever ran this block" rather than "the difference it made" would be wrong
  here; `stems.test.ts` covers exactly that case.
- The toy chip has _more_ low-frequency energy than the kick over a stock demo
  tune, so `lowEnergy` does not separate them. `quiet()` does.
- `REC_CHUNK` (`1 << 15`) is a whole number of `BLOCK`s, which is why `lay()`'s
  while loop runs once per full block. Do not change it to a non-multiple
  without re-reading that loop.

## If you pick it up again

Nothing is required. Optional, in order of value:

1. An engine-level test of `keepStems` / `saveTake` — that a silent source gets
   no file and the names match `STEM_FILES`. Would need a jsdom test with a fake
   `RecMsg`; `src/engine/engine.test.ts` is the place.
2. A stem for the mic, if anyone asks. It is not a `Stage`, so it needs its own
   tap beside `TAP_MIC` in `chain.process()`.
3. Progressive encoding, if the 120 s cap turns out to bite: encode each slab to
   int16 on arrival instead of holding float in `stemTake`, which would cut the
   resident cost in half and let the cap go back up.
