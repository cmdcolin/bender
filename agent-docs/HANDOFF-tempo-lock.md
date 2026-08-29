# Handoff: Kit sync (toy keyboard locked to the kit's tempo)

Branch `worktree-agent-a379a3684d806bfbf`, commit `5f768fd`, on top of
`a49333c`. `pnpm typecheck` clean, `pnpm test` 67 files / 750 tests green (743
before), `pnpm features` regenerated, prettier run on every touched file.

## Done

New control `chipSync`, default `0` (off), registered in all four places:

- `src/controls.ts` — `chipSync: 0`, next to `chipClockX`.
- `src/engine/params.ts` — `['chipSync', 'step']`, next to `chipClockX`.
- `src/ui/packed.ts` — **appended** to the end of `URL_KEY_ORDER`, after
  `drumChance`. Nothing inserted or reordered.
- `src/ui/controls/sources.ts` — slider def in the `Toy keyboard` group,
  immediately above `chipClockX`, choices from `SYNC_MODES`.

DSP, all in `src/dsp/stages/toyChip.ts`:

- `SYNC_MODES = ['off', 'sixteenths', 'eighths', 'quarters']` (exported; the
  panel reads it), `SYNC_PER_BEAT = [0, 4, 2, 1]`, and `kitStepHz(bpm, mode)`.
- In `ToyChip.process`, what was
  `const stepHz = this.yours ? tuneRate : rom.stepHz` is now `nominalHz`, and
  `stepHz` is `sync > 0 ? kitStepHz(p[IDX.drumBpm], sync) : nominalHz`.
  Everything below is unchanged, which is the whole trick — see Bends.

Also: the "nothing pulls it back" crystal comment in the per-sample loop and the
arpeggiator comment both now say what a lock does and does not do; the `lock`
action title on `chipClockX` in `sources.ts` points at Kit sync; `quantize.ts`
carries a note above `CLOCK_RATIOS` saying why nothing there changed.

Tests: `src/dsp/stages/sync.test.ts`, 7 tests. Docs: new `## Kit sync` section
in `docs/USER-GUIDE.md` before `## The key lock`, and the arpeggiator section's
last line amended. `agent-docs/TODO.md` line removed.

## Not done

Nothing outstanding from the brief. Possible follow-ups, none started:

- The arpeggiator does **not** lock (see below). If someone wants it to, it
  needs its own ratio, and `chipArpHz` would have to stop meaning Hz.
- MIDI clock (`docs/MIDI.md`) drives `drumBpm`, so a locked toy follows incoming
  MIDI clock for free. Untested, unmentioned in the docs.

## The ratio, and why three of them

`SYNC_PER_BEAT = [0, 4, 2, 1]` — sixteenths, eighths, quarters of the kit's
beat. The kit's own step rate in `toyDrum.ts` is `(drumBpm / 60) * 4 * clock`,
sixteen steps to the bar, so `sixteenths` is exactly one toy step per kit step.

Three rather than one because the ROM bank does not agree with itself: the
songs' `stepHz` in `src/dsp/stages/roms.ts` runs 3.2 to 9 Hz, and at the default
118 bpm the kit's eighth is 3.93 Hz and its sixteenth 7.87 Hz. One fixed ratio
would play half the bank at double or half the speed it was written for.

## The bends still bite — this is the load-bearing part

`stepHz` is the ROM's _nominal_ rate. The per-sample count is
`this.stepClock += (stepHz * timing) / this.sr`, where
`timing = clock * rail.clockFactor` and `clock` has already absorbed
`chipClockX`, the pot on `chipBendSpot === 1`, `chipClipClock` (cap on the
timing pin) and `chipDrift`. Locking replaces `stepHz` only, so all of that is
untouched and goes on dragging a locked toy exactly as far as it dragged a free
one. Pinned by three tests in `sync.test.ts`: the clock knob still doubles and
halves it, a pot on the timing pin still runs it away, and `chipBattery: 0.8`
still drags it under 90% of its locked rate.

Written vs running tempo: `kitStepHz` takes `drumBpm` **as written**. The toy
multiplies by `rail.clockFactor` itself and so does the kit, so a sagging rail
reaches both sides on its own — baking the kit's _running_ rate into the nominal
would apply `clockFactor` twice and the tune would fall behind the pattern as
fast as the batteries went. Test `locked, the toy and the kit go flat together`.

## Reach

Melody, the two stacked memory lanes (`strikeStacks`) and the auto bass-chord
(`oomPah`) all fire from the one step counter, so they lock together. The other
reader of `stepHz` is `envDecay = exp(-(0.8 * stepHz * timing) / sr)`, which is
deliberate: a cheap chip ties decay to its tempo clock, so locked notes get
their length from the kit too.

**The brief's premise about the arpeggiator is wrong.** It does not run off
`stepHz`. Its rate is `arpHz * timing` — its own knob (`chipArpHz`, in Hz) times
the shared divider. So a lock does not put the figure on the kit; what the arp
shares with the tune is every bend, not the tempo. Said so in the code comment,
the panel help and the guide.

## Traps

- `bursts()` from `src/dsp/testRender.ts` counts the step rate exactly if the
  memory alternates note / `REST` (silence between strikes). Counting envelope
  jumps instead — the `restrikes` helper in `arp.test.ts` — silently
  under-counts above ~4 Hz, because the envelope decay is itself tied to the
  step rate. Cost an hour. `sync.test.ts` uses `PULSES` + `bursts`.
- The "renders identically" golden in `sync.test.ts` was captured from the
  pristine tree **before** any edit, by rendering `render({}, 1)` and taking the
  rms of sixteen slices. It cannot be regenerated from the current tree without
  making the test vacuous — if it ever fails, `git stash` the DSP change and
  re-capture, do not just paste in the new numbers.
- `docs/features.md` is generated; `pnpm features` after any slider or help
  string edit, or `scripts/features.test.ts` fails.
