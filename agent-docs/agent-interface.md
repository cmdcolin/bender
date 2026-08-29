# Driving the board from a program

Notes toward letting an agent play bender. The conclusion is that the transport
— WebMCP, MIDI, a URL, Puppeteer — is the least consequential choice here, and
that two small pieces of the engine are worth exposing before picking one.

## What the board already is

The control record is a named, float-valued parameter namespace. `controls.ts`
holds 331 physical-unit numbers in one flat record, and every part of the app —
UI, presets, randomize, DSP — reads the same names. Max/MSP calls this a
`pattrstorage`: named params, saved snapshots, interpolated recall between them.
bender has all three.

The hash is that namespace over a wire. `#set=chipStarve:0.8,dlyFb:0.6` is an
address and a float, which is OSC with a different cable. `share.ts` kept the
long form so a person could program the board from the address bar; the same
property makes the board programmable by anything else.

Sequences are parameters, not events. The melody is 32 semitone integers per
lane across three lanes, with `-128` for a rest and `-127` for a hold; a drum
row is a 16-bit mask and a length. So "play these notes in this order" is one
write of about 35 integers, and the counter that reads them runs on the audio
thread. Nothing outside the worklet has to keep time, which is why round-trip
jitter from a driving program does not matter for sequenced material.

Motion already has a machine. `travel(target, seconds)` builds a `Glide` and
walks the board to it at frame rate, chaining correctly off a morph in flight.
Max spells this `line~`: one control-rate message describing a ramp, performed
underneath at rate.

## What is missing

**The engine has no imperative surface.** `patch()`, `travel()` and the meter
live inside the module graph and nothing outside can reach them. The hash is not
a substitute: `useBoardUrl` reads a hash as a _whole board_ — everything the
link omits snaps to stock, deliberately, because a link names a board rather
than an edit — and the writer that mirrors the board back is debounced at 250ms
and owns the bar. A program driving the hash is therefore loading patches, not
turning knobs, and is fighting a mirror while it does.

**Events cannot land on a musical clock.** The memory is 32 steps and one loop.
A fill at bar 8, a chorus that differs from a verse, a bend punched in on the
downbeat — none is expressible as board state, and all of them are timing
critical. Max schedules against a global transport with `timepoint`; bender has
`armStep`/`armed` and two `Transport` flags and no way to say "at the top of the
next loop."

**Semitone integers are a poor notation for a model.** Writing `tuneStep7: -14`
with two sentinel values produces bad melodies. `notes.ts` already has
`semitoneName()` going one way; the parse direction does not exist.

## Plan

1. **A note codec.** `"C4 . E4 ~ G4 . . B3"` to the 32 ints and back, and
   `"x..x..x."` per drum voice to a mask. Forty lines, unit-testable with no
   browser, and worth more to the quality of what a program writes than any
   transport decision. `notes.ts` has half of it.

2. **`queue(board, { atLoop })`.** Land a board at a musical moment rather than
   on arrival, resolved against the counter the worklet already runs. Pattern
   chaining is what every groovebox does, so this earns its keep for people at
   the panel whether or not anything automates the app.

3. **An imperative facade**, behind a flag so the public page does not carry it
   unconditionally: `get`, `patch`, `glide`, `queue`, `meter`. Puppeteer reaches
   it through `page.evaluate` today with no flags and no origin trial, and it is
   the same object any later adapter wraps. Note that `set()` calls `stopHunt()`
   and `commitStep()` — a sweep wants `patch` for motion and `writeBoard` for
   landmarks, or it shreds the undo stack.

4. **A generated param manifest** — key, range, unit, default, one-line meaning
   — emitted from the tables `scripts/features.ts` already walks for
   `docs/features.md`. Whatever drives the board needs this, and today it has to
   infer it by reading `controls.ts`.

5. **Ears, if any of it is to close a loop.** `dsp/testRender.ts` renders a
   board offline at 48k with measurements to assert on, in Node, with no
   AudioContext and no gesture gate. A program that proposes a patch, renders
   half a second, measures it and iterates needs no browser and no protocol at
   all — the siblings of that script are already in `scripts/`.

## Why not WebMCP, for now

Chrome shipped `navigator.modelContext` behind a flag in 146 and opened an
origin trial in 149; Edge has a preview. The API is a W3C Community Group draft
and has moved twice already — `provideContext()` removed, the getter relocated
to `document.modelContext` with the old name deprecated as an alias. Anything
written against it now gets rewritten.

Two things bite this app in particular. A tool call is a discrete RPC, so a
three-second sweep is no more expressible there than through a URL — it still
needs the ramp underneath, which is step 3. And a fresh AudioContext stays
suspended until the page sees a gesture (`autostart` in `engine.ts`); Puppeteer
can synthesize a real click, an agent's tool call probably cannot.

The one prize WebMCP holds is letting _someone else's_ agent drive the page
without us shipping anything to them. Real, narrow, and still there in a year —
by which time the adapter is forty lines over the facade in step 3.

## Why not MIDI as the primary interface

MIDI is the right surface for the hardware it was built for. `midi.ts` maps a CC
through each slider's own curve, with soft takeover, endless-encoder handling
and learn-in-order; 128 steps sits below the resolution of a hand on a 20mm pot,
so nothing is lost on the way to a knob.

A program is not a hand. Seven bits cannot say 0.8137, 128 controller numbers
across 16 channels cannot name 331 params, and the binding map is user-specific
and stored per browser — so a program addressing CC 74 is addressing whatever
that knob happens to own today rather than `chipStarve`. Soft takeover then
fights it outright: a bound control ignores absolute CC until the value sweeps
past what is on screen, so the first messages land as silence that reads like a
bug.

Nobody in the Max world sends MIDI to their own patch from a script; they open a
UDP port and send OSC, which is the hash we already have. MIDI's one genuine win
is out-of-process control with no CDP, via a virtual port — and a WebSocket buys
that with floats and every parameter name.

Worth having anyway, as a feature for people rather than an interface: MIDI file
import and export for the roll. `quantize.ts` already carries the note lengths,
clock ratios and swing feels, and `asTuneStep` already folds a note the memory
cannot file.
