# bender

A virtual toy keyboard and drum machine run on a modelled supply rail; you
starve the rail, solder a pot onto the die, patch a microphone into the circuit,
and listen to what falls out. Nothing here plays a "glitch sample" — the
reboots, pitch dives and screams emerge from the mechanisms.

Real-time in the browser, on one AudioWorklet.

Live: https://cmdcolin.github.io/bender/

## The signal path

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="img/chain-dark.svg">
  <img alt="Sources sum into the mix bus, run through six reorderable bend slots, tape delay, spring verb, brownout and output, then a dc block, soft clip and limiter, with the feedback bus wired from the output back to the mix" src="img/chain-light.svg" width="420">
</picture>

Graphviz draws that from the chain itself — `pnpm diagram` regenerates it from
the same DOT the app emits (`src/ui/chain-dot.ts`). The panel redraws it live as
you play: the bend slots appear in whatever order you patched them, dead stages
grey out, and the feedback wire lands on whichever node **Patched into** picks.
Click a node to open its controls.

The whole chain runs inside a single worklet `process()`, so the global feedback
loop is tight enough to squeal and every feedback path saturates in-loop —
runaway is a feature, held at the rails by design. A fixed safety tail (DC
block, soft clip, −1 dBFS limiter, NaN watchdog) means no setting can blow up
the output.

The bends that matter:

- **Starve** sags the shared toy supply: pitch dives, notes collapse, and past
  the brownout threshold the watchdog reboots the chip — the tune keeps
  restarting.
- **Bend spot + pot** solders a virtual pot onto the die: clock feedback,
  program counter (melody scrambling), DAC bias, or the gate line.
- **Retrigger** hammers the drum machine's trigger line; past ~40 Hz the
  retrigger period becomes the pitch and the kit screams.
- **Mic patch** wires the mic past the mixer, straight onto the chip rail, the
  oscillator's FM input, the delay feedback path, or the ring mod carrier.
- **Patched into** re-solders the feedback return: the source mix, the
  oscillator's FM input, the toy rail (the output browns out its own toy), or
  straight into the tape.
- **Ground hum** leaks mains fundamental and rectifier buzz in proportion to how
  hard the supply strains; the ripple wobbles the rail.
- **Sub octave** is a flip-flop divider under the shaper that mistracks on
  complex input, like the vintage pedals did.
- Every feedback (delay, comb, screech filter, feedback bus) goes past unity.

Presets morph into place; **random** rolls a preset and jitters it, **mutate**
shakes the current board.

The chip's ROM bank holds twelve demo songs — four factory doodles and eight
public-domain tunes every cheap keyboard shipped (Für Elise, Ode to Joy, Rondo
alla Turca, William Tell…), each with its own sequencer rate. Nothing plays by
itself: **play demo song** runs the ROM sequencers, the keys work either way.
**Record** writes the output to a 16-bit stereo wav; stopping saves the take.

## Run

```
pnpm install
pnpm dev
```

`pnpm test` runs the DSP suite, including a torture test that slams every param
— all feedbacks pinned past unity at once — and asserts nothing non-finite or
past the limiter ever leaves the chain.

## Footnote

Initial template with Claude Fable. Follows in footsteps of
https://github.com/cmdcolin/ntsc.js
