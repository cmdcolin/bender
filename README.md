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
  <img alt="Sources sum into the mix bus, run through six reorderable bend slots, the stompbox, tape delay, spring verb, brownout, tape machine and output, then a dc block, soft clip and limiter, with the feedback bus wired from the output back to the mix and a patch wire from the bay LFO onto the screech filter" src="img/chain-light.svg" width="420">
</picture>

Graphviz draws that from the chain itself — `pnpm diagram` regenerates it from
the same DOT the app emits (`src/ui/chain-dot.ts`). The panel redraws it live as
you play: the bend slots appear in whatever order you patched them, dead stages
grey out, the feedback wire lands on whichever node **Patched into** picks, and
patch-bay wires ride over the top, dotted, from what they pick up onto what they
push. Click a node to open its controls.

Six slots, seven bends — you pick which ones are on the board.

The whole chain runs inside a single worklet `process()`, so the global feedback
loop is tight enough to squeal and every feedback path saturates in-loop —
runaway is a feature, held at the rails by design. A fixed safety tail (DC
block, soft clip, −1 dBFS limiter, NaN watchdog) means no setting can blow up
the output.

The keyboard plays four notes at once, the way the toys of the era did. Every
voice shares the one supply but has its own output stage, so a starving chip
doesn't sag in lockstep: each voice detunes and browns out at its own rail
voltage and a chord collapses raggedly, a note at a time. All four mix into a
single small output stage, so a chord leans on its headroom rather than coming
out four times louder — and draws harder on the rail, which is its own way of
browning the chip out.

**Tone** taps the divider chain at a different pulse width — 1/2, 1/4, 1/8,
1/16. Narrow taps null different harmonics and thin out; nothing levels them
back up, exactly as the chips left it. A counter can't strike a pulse narrower
than one clock tick, so the narrow tones widen back toward a square as the note
climbs past the divider's resolution.

**Auto bass-chord** is the accompaniment section, the thing that made a toy
keyboard sound like a whole bad band. It runs off the melody's own step clock —
bass on the step, chord stab on the offbeat, the bass alternating root and
fifth — and it reads its chord off the tune rather than a chord button: a chord
tone moves it, a passing tone leaves it where it stands. Each ROM declares its
key, so the three chords it has (tonic, dominant, subdominant) land in the
song. It runs on the same divider and the same rail as everything else, so the
clock bend drags it, the counter bend scrambles it, and starving the chip takes
the backing band down with the tune.

The bends that matter:

- **Starve** sags the shared toy supply: pitch dives, notes collapse, and past
  the brownout threshold the watchdog reboots the chip — the tune keeps
  restarting.
- **Bend spot + pot** solders a virtual pot onto the die: clock feedback,
  program counter (melody scrambling), DAC bias, or the gate line.
- **Retrigger** hammers the drum machine's trigger line; past ~40 Hz the
  retrigger period becomes the pitch and the kit screams.
- **Mic patch** wires the mic past the mixer, straight onto the chip rail, the
  oscillator's FM input, the delay feedback path, the ring mod carrier, or the
  trigger line of the drum machine or glitch buffer — clap at it and the circuit
  fires.
- **The patch bay** is two wires and a soldering iron. Each picks up the bay's
  LFO, the sag on whichever supply is dying, the output envelope, the mic, an
  axis of the body pad or the feedback bus itself, and pushes it onto a filter
  cutoff, a carrier, a clock, the tape speed, the glitch chance, the feedback
  amount or the stompbox drive. Depth goes negative, so a failing supply can
  drag a pitch either way.
- **The body pad** is the bare contacts every bent toy grows sooner or later:
  touch both and your own resistance is the control. It does nothing until a
  wire in the bay is soldered to it, which is also true of the real thing.
- **Brake + supply drag** treat the tape capstan as a motor with weight.
  Everything already on the tape sags on the way down and spins back up on
  release; wire the motor to the supply and the repeats dive whenever the power
  fails.
- **Freq shifter** moves every partial by the same number of Hz rather than the
  same ratio, so harmonic input comes out inharmonic. Its own feedback makes
  each lap shift again — the barber pole — and parked inside the global loop it
  stops the squeal ever settling on a pitch.
- **Patched into** re-solders the feedback return: the source mix, the
  oscillator's FM input, the toy rail (the output browns out its own toy), or
  straight into the tape.
- **Ground hum** leaks mains fundamental and rectifier buzz in proportion to how
  hard the supply strains; the ripple wobbles the rail.
- **Sub octave** is a flip-flop divider under the shaper that mistracks on
  complex input, like the vintage pedals did.
- **The stompbox** is the dirt box at the front of the board, and each of its
  six circuits clips somewhere different in its own gain stage rather than
  running the same curve through a different formula. The screamer clips inside
  the op-amp's feedback loop, so the dry note walks under it and never quite
  lets go; the rat clips to ground behind an op-amp too slow to keep up, which
  is the fizz; the muff is two clipping stages and a scooped tone stack the
  note has to survive; the germanium one is lopsided, and its bias rides down
  on the signal so it splutters as a note dies and cleans up when you back off;
  the octave rectifies the shape before it clips it, so it comes out an octave
  up on one note and gargling on two; the gate is misbiased to the edge of
  cutoff. **Battery** is how dead the 9V is — the rail falls as the pedal
  works, so notes bloom and collapse, and it shares the board's supply, so
  Starve and Brownout drag the pedal down with everything else. Starve the gate
  circuit far enough and it stops needing an input at all.
- Every feedback (delay, comb, screech filter, feedback bus) goes past unity.

## The tape machine

The tape delay wobbles its echoes; the tape machine records the instrument. It
sits last, after the brownout, so everything upstream is the room and this is
what it went down on.

Signal crosses the record head through a pre-emphasis curve and comes back
through its inverse, so the highs saturate first and transients round off
before anything sounds distorted. Hiss lands on the medium rather than in the
mix — the replay head colours it, the speed sets how loud it is, and it breathes
a little with the signal, the way biased oxide does.

**Speed** moves the machine as one part rather than one knob among ten. The head
gap loses highs at a wavelength, so a slower tape loses them lower; the replay
bump sits at a wavelength too, so it drops with speed; less tape past the head
per second means more hiss and slower wow; and a spool wrap takes longer to come
back round, which sets how far behind the print-through ghost arrives. 3¾ ips is
dark, noisy and unsteady. 15 ips is nearly a wire.

**Bias** runs underbiased-bright-and-crunchy to overbiased-dull-and-squashed,
distortion and top end moving against each other. It carries its own record tilt
rather than leaning on the head gap alone — at 15 ips the gap already sits past
the programme, so a gap-only model inverts the knob at the fast speed.

The failures are the point. **Dropouts** shed highs before they shed level,
which is what separates oxide from a power cut. **Print-through** is the layer
wound underneath bleeding through, a dull ghost one wrap behind.
**Azimuth** lags the right channel and eats its top end, so the take collapses
badly to mono. Wow is capstan eccentricity plus a slow drift that never lets the
pitch settle; flutter is the fast wobble plus the scrape of tape dragging past
the head.

The dry side runs down the same nominal head delay as the wet, so **To tape**
only combs once the transport actually wobbles.

Presets morph into place; **random** rolls a preset and jitters it, **mutate**
shakes the current board.

The chip's ROM bank holds eighteen demo songs, each with its own sequencer rate:
four factory doodles, eight public-domain tunes every cheap keyboard shipped
(Für Elise, Ode to Joy, Rondo alla Turca, William Tell…), and six slow ones in
minor and modal keys — Gymnopédie, Gnossienne, Sakura, Dies Irae, Chopin's
funeral march, Greensleeves — where a starving rail stops being funny. Nothing plays by
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
