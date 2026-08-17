# bender

A toy you break on purpose. A virtual toy keyboard and drum machine run on a
modelled supply rail; you starve the rail, solder a pot onto the die, patch a
microphone into the circuit, and listen to what falls out. Nothing here plays a
"glitch sample" — the reboots, pitch dives and screams emerge from the
mechanisms.

Real-time in the browser, on one AudioWorklet.

## The signal path

```
toy chip + toy drums + chaos osc + noise + mic + sample
   +  ◄————————— feedback return ————————┐
   ▼                                     │
bend slots ×6, reorderable               │
  ring mod · crusher · shaper ·          │
  comb · glitch buffer · screech filter  │
   ▼                                     │
tape delay → spring verb                 │
   ▼                                     │
brownout → dc block → soft clip —————————┤
   ▼                            feedback bus
limiter → out
```

The whole chain runs inside a single worklet `process()`, so the global
feedback loop is tight enough to squeal and every feedback path saturates
in-loop — runaway is a feature, held at the rails by design. A fixed safety
tail (DC block, soft clip, −1 dBFS limiter, NaN watchdog) means no setting can
blow up the output.

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
- **Ground hum** leaks mains fundamental and rectifier buzz in proportion to
  how hard the supply strains; the ripple wobbles the rail.
- **Sub octave** is a flip-flop divider under the shaper that mistracks on
  complex input, like the vintage pedals did.
- Every feedback (delay, comb, screech filter, feedback bus) goes past unity.

Presets morph into place; **random** rolls a preset and jitters it, **mutate**
shakes the current board.

## Run

```
pnpm install
pnpm dev
```

`pnpm test` runs the DSP suite, including a torture test that slams every
param — all feedbacks pinned past unity at once — and asserts nothing
non-finite or past the limiter ever leaves the chain.
