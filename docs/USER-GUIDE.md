# User guide

How to play bender, once the board is in front of you.

## Playing the keyboard

The on-screen board draws three octaves starting at C3. The sixteen keys under
your typing hand carry their letter printed on them, the way the toys this
models printed note names on their keys. Click a key, or drag across the board
to play a run. `z` and `x` shift the whole board two octaves either way, down to
a bass line well under the toy's own bottom key and up to where the tones run
out of ticks and turn into flat squares.

**Hold** latches every key you touch after it, so it stays on until you press it
again. Alt-click pins down a single key on its own, which is a way to keep a
drone going under both hands while the rest of the board plays normally. Either
way, a second press on a lit key lets it go — and a key that never gets a proper
release (the window losing focus mid-press, a key still down when a controller
unplugs) lets go on its own rather than ringing forever.

Keys light up for whatever is actually playing them: your own hand in the accent
colour, and the toy playing itself — the ROM tune, the auto bass-chord, a note
struck through the trigger patch — in amber. The chip reports what it's actually
sounding, not what was asked for, so a note fades from the light as it fades
from the mix, and a note cut short by a brownout goes dark early. Notes played
past either end of the drawn three octaves put a mark at that end, which is what
the octave switch is for.

**Tone** taps the divider chain at a different pulse width — 1/2, 1/4, 1/8,
1/16. The narrower taps null out different harmonics and thin the sound out, and
nothing corrects for that, exactly as it was on the original chips. A counter
can't strike a pulse narrower than one clock tick, so at the top of the
keyboard's range the narrow settings widen back out toward a plain square.

## The melody memory

**Rec** on the deck, or **record** on the piano roll, arms recording. Once
armed, every key you press — on-screen, on the letter keys, or from a controller
— is written to the step the chip is currently standing on. Arm it even with the
chip silent; the memory still records, since a memory that only worked while the
chip was making noise would be misleading with every light on the panel still
saying it was working.

What you record isn't a separate sequencer. It's the 19th entry on the **Tune**
selector, one past the 18 songs in the ROM bank, and from there the chip treats
it exactly like any other tune: it runs at the rate **Memory rate** sets, the
auto bass-chord plays under it, the clock bend and a brownout affect it the same
way they affect a ROM song, and **Struck by** can have the drum machine clock it
instead of the crystal.

The **piano roll** on the keyboard's panel is that memory drawn out: one row per
pitch, one column per step. Click a cell to place a note, drag to draw a run of
them, click a note again to remove it, and shift-click a step to hold whatever
the previous step played. A held note draws as one bar across the steps it
covers, rather than a note followed by empty cells. Two octaves show at a time,
with arrows to move the window, and the memory keeps its own length — a
four-step phrase you write loops four times against a sixteen-step pattern.

A step is stored as one of 64 codes on six bits: 62 of them are pitches (a
little over five octaves), and the other two are a rest and a hold. The octave
switch (`z`/`x`) can shift the keyboard further than those codes reach, so a
note played at the far ends of its range wraps to the nearest octave that fits,
rather than dropping the note or playing the wrong one. The accompaniment needs
a key to play in, and since a melody you played doesn't name one, it takes your
lowest note as the tonic and checks for a flat third to decide major or minor.

The memory is yours the way the pattern you draw on the drum machine is yours:
nothing about random rolls, mutate or a morph will touch it, it rides in the
shared link along with everything else, and every note you play in — plus every
hold — is its own step in the undo history, so a wrong note is one `ctrl+z`
away.

## Auto bass-chord

Auto bass-chord is the accompaniment section — the thing that made a toy
keyboard sound like a whole bad band on its own. It runs off the melody's own
step clock: bass on the beat, a chord stab on the offbeat, the bass alternating
root and fifth. It reads its chord from the tune currently playing rather than
from a chord button, and it runs on the same divider and the same rail as
everything else, so starving the chip or dragging its clock takes the backing
band down with the tune.

## The drum machine

The kit is a sixteen-step grid rather than a fixed pattern. Six voices —
**kick**, **snare**, **hat**, **clap**, **tom**, **cowbell** — each get a row of
steps you click, with an accent row underneath deciding which hits land harder.
Ten factory patterns sit as buttons above the grid; each one writes into the
same steps, so it's a starting point rather than a mode you're stuck in.

**Swing** holds every offbeat step back and gives the following step less time,
so shuffle costs nothing in tempo. **Tune** and **Decay** move the whole kit at
once. The kit also has its own cheap-DAC quirks — see [Bends](BENDS.md) for what
**Bit depth**, **Ladder** and **Overflow** actually do to it.

Drawing a run of steps is a drag rather than sixteen separate clicks: press a
step and drag across the grid, and every cell the pointer crosses goes the way
the first one did. Each row also has its own length — shift-click a step to make
the row loop back from there, with a badge on the right showing where it ends
(press the badge to give the row all sixteen steps back). A five-step hat
against a sixteen-step kick is polymeter: the two only line back up every eighty
steps, so the pattern takes the better part of a minute to properly repeat.

Alongside the factory patterns is a row of verbs that rewrite the grid without
touching tempo or tone: **Roll** writes an entirely new pattern, **Vary** makes
a couple of small changes to the one you have, **Turnaround** drops a fill over
the end of the bar, **Shift** moves every row one step later (shift-click to
move it back), and **Half**/**Double** stretch or compress the bar. Each of
these is a single step in the undo history, however much it changed.

A row's name is also a button: press it to hear that voice without waiting for
the playhead to reach a step you've written. The kit is playable on the number
row too — `1` is the kick through `6` the cowbell, printed on each row the way
the number is on the on-screen grid. A held key is a single hit, not the
operating system's key repeat.

**Record** arms the kit to write a pattern from what you play: hit a number key,
a row's name, or a pad, and it lands on the nearest step, with each row keeping
its own timing. It needs the kit running to have a step to land on, so arming it
while stopped shows as an outline rather than lit. It's never on when you
arrive, and each hit is its own step in the undo history.

## Playing the FM chip

The board's second synthesiser has no keyboard or sequencer of its own — its key
input is soldered onto the toy keyboard's gate line, so by default it plays
whatever note the toy strikes. **Struck by** can wire a kit voice onto that same
line instead, so a drum hit plays a note.

**Voice** picks one of eight patches, **Brightness** sets how much of the
modulator reaches the carrier, and **Feedback** sets how much of the modulator
feeds back into itself. Under your own hands a note is genuinely held: the key
stays down for as long as you hold it. Everything else that can trigger the chip
— the demo song, a drum hit, a bridged trigger line — only sends an edge, with
nothing saying when to stop, which is what **Note length** is for. Four of the
eight voices (e.piano, bell, bass, marimba) decay on their own regardless of how
long the key is held; the other four wait for it.

**Mod ratio**, **Car ratio** and **Mod decay**, under "inside the patch", shape
the patch further. What actually happens at the register level when you put a
fault on this chip's wires is a much bigger story — see [Bends](BENDS.md).

## The trigger patch

The keyboard and the drum machine share a power rail by accident; the trigger
patch is what you wire between them on purpose.

**Kit fires keys** bridges a drum hit onto the keyboard's gate, so a hit plays a
note. What note is its own setting: the one already standing, the next step of
the ROM tune, a random step, or a tone from the accompaniment's current chord.
The next step is the one to try first — it means one drum hit clocks one step of
the melody, so the whole board, bass and chord stabs included, moves together.

**Keys fire kit** is the wire back: every note the chip plays also fires a drum
voice, whether the pattern is running or not. **The step** option hands it to
the grid instead, so a key fires whatever column the sequencer is sitting on.

Bridge both directions and the two machines play each other — a rattle at the
audio block rate, held in check by the safety tail, which is what a trigger loop
closed on itself has always done.

Every wire in the trigger patch, and the rail the two machines share, can also
be bent — see [Bends](BENDS.md) for the full list.

## Presets and rolls

Click a preset chip to load the whole board. Drag it sideways instead and it
morphs only part of the way there, under your finger rather than on a clock;
drag back and the board retraces to where it stood. None of the random rolls,
**mutate**, or **drift** below ever touch the demo song you picked, the pattern
you wrote, or the output, mic and sample levels — those stay yours.

A roll moves only a handful of controls, not the whole board, and it keeps its
hands off time: any control that counts in beats — delay time, glitch slice,
drum retrigger — lands back on a division of the beat rather than an arbitrary
value, so a roll is still playable with the pattern.

Every stage's own panel has a **roll** and a **reset** for asking one question
at a time — a new spring tank without losing the rest of the board, or that one
stage back to where it booted. The signal path map shows a count of how many
controls you've moved on each stage; pressing that number is the same reset,
without needing the panel open.

Above the presets are rolls that work on the whole board at once: **rewire**
shuffles the bend order and re-patches the wires without retuning anything,
**one bend** clears the slots down to one and rolls it hard, and **wreck it**
pushes everything that can run away — feedback, supply, bit depth — all the way
at once (the safety tail holds all of it). **Slam** drives one to three controls
to an extreme and leaves the rest alone. **On the edge** takes two controls that
fight each other and drives them to opposite extremes. **Let it age** turns all
five ageing controls up together.

**Hunt** is the one roll that listens to what it rolled: it tries six boards,
plays each for a second and a half, and keeps whichever rides closest to the
limiter without burying it — a dialog shows which candidate is currently
playing, and clicking it or pressing escape stops on the one that's playing.
None of the candidates it passed through land in the undo history — the whole
hunt banks a single step, back to the board you were on before it started.

**Drift** is mutate on a timer: roughly every fifteen seconds the board sets off
toward a new nearby setting and mostly gets there before the next leg starts, so
the sound never cuts and never quite arrives anywhere. It's meant to run
unattended — your levels, the song and the pattern stay put, and one `ctrl+z`
restores the board you had before you started drifting.

**Share** copies the current board into the page's URL, so a board travels as a
link you can send.

## Demo songs

The ROM bank holds 18 built-in tunes: four factory demos, eight public-domain
pieces every cheap keyboard of the era shipped (Für Elise, Ode to Joy, Rondo
alla Turca, William Tell, and others), and six slower ones in minor and modal
keys. Once you've played something into the melody memory, it becomes the 19th
entry on the same selector.

## Playback and recording

**play demo song** and **play drums** are independent run switches for the
keyboard's tune and the drum pattern. `space` toggles both at once and restores
whatever was actually running before, rather than starting everything
unconditionally — nothing else on the board presses play on its own, including a
preset, a roll, or a shared link.

**Record wav** is different from the two record buttons above: it captures the
actual audio output as a 16-bit stereo wav file, where the keyboard's **Rec**
and the drum machine's **Record** capture what you played rather than what comes
out of the speakers.

## The link is the board

The address bar carries the whole board at all times — every control off stock,
the drum pattern and the melody — so copying it is the share button and
reloading keeps what you had. There is no server involved: it all rides in the
`#`, which is also why no host has to be taught to serve the app for a url it
has never seen.

It comes out short by default. Here is **bucket brigade**:

```
https://cmdcolin.github.io/bender/#p=AEsvLX4BAMwDAEgApAMBPA
```

That's the board written as bytes. The long form spells the same board out, and
the app both reads and writes it:

```
https://cmdcolin.github.io/bender/#set=chipLevel:0.75,drumLevel:0.45,echoMode:1,echoMs:480,echoFb:0.72,echoToneHz:5000,echoLevel:0.6
```

Four times the characters, which is why the bar carries the short one — the
difference between a link that survives a chat window and one that arrives in
three pieces.

What the long form buys is a board you can program by hand: a control name from
[features.md](features.md), a colon, a number, commas between.

```
#set=chipStarve:0.8,dlyFb:0.6,drumKick:33825
```

Anything you leave out is at stock, anything out of range is pulled back onto
the panel, and a name the app no longer has is dropped. A bar already carrying
`#set=` keeps carrying it, so the board stays readable while you are working
that way rather than turning back to bytes under the cursor — type a bare
`#set=` to switch a tab over. Every preset link in [features.md](features.md) is
written this way.
