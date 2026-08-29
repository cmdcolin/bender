# MIDI

Chrome and Edge give a page raw access to MIDI, and the **midi** panel is where
bender uses it.

## Binding controls

Press **⚟** beside any control, then move a knob — that knob now owns the
control. **auto-map** binds a known controller's knobs by CC number in one step;
**learn in order** does the same for any controller: sweep each knob once, left
to right, and each one takes the next control in line. Both follow the same
order — mixes and levels first, since those are what a set gets played on, then
the rest down the signal path.

A bound knob doesn't grab its control on the first message. It has to sweep
through the value already on screen first. Otherwise loading a preset would snap
every control to wherever the hardware knob happened to be left, which is the
one thing a physical knob can't show you. Until it catches up, the control shows
where the knob is waiting in amber, and one continuous turn counts as a single
step in the undo history, the same as a slider drag does.

**Endless encoders** skip all of that. They report relative turns rather than an
absolute position, so there's nothing to disagree with the screen and nothing to
get stranded — a click moves a control by one CC step's worth of its travel,
whatever that control is. Two incompatible message formats exist for these in
the wild (the same byte value means opposite directions on different devices),
and nothing can tell them apart from a single message. bender picks up the
format from a knob's first message and keeps it; if a bound knob slams to one
end and sticks, that's the sign it needs the other format. The **↻** icon on a
binding's row is what tells you a control is bound to an encoder at all.

**Light the rings** sends every bound control's current value back out to the
hardware, so a knob's LED ring matches what's on screen — which matters most for
an encoder, since it has no other way to show where its control actually is.

## Playing

Notes play the toy chip's keyboard, with A3 landing where the ROM has it — the
chip counts semitones from 220 Hz, so a controller's middle C arrives three
semitones higher than you'd expect. Played notes strike and light the same
on-screen keys your hand does.

There are two keybeds on the panel once the FM chip is up in the mix, and the
picker beside **notes play the keys** says which of them the wire plays: the
toy, the FM chip, **both** — one key, two synthesisers — or **split**, which
cuts the keybed in half with the toy below the split point and the FM chip from
it up. Set the split by pressing **split at …** and then playing the key to cut
at; that key sets the split rather than sounding. Moving the picker mid-note
lets go of whatever the wire is holding, so nothing is left stuck on a bed the
controller has stopped playing. The sustain pedal holds notes and releases them,
and either spelling of "all notes off" clears the board. Velocity comes through
too: the toy's own keys are switches and always strike at full velocity, but a
MIDI note or the trigger patch can arrive at any level.

**Pads play the kit.** Channel 10 is where General MIDI puts percussion, so a
pad bank sending there needs no setup — the standard GM map folds onto bender's
voices automatically (sticks to the tom, shakers and closed hats to the hat,
anything that rings on to the open hat or the cymbal, wood and cowbells to the
bell). A pad bank that sends on its own channel or its own notes needs **learn
pads**: hit a pad for each voice down the kit, and what you hit overrides the
standard map wherever the two disagree. Getting one voice on the wrong pad
doesn't mean relearning the lot — press **⚟** on just that row and hit the pad
you meant. A pad fires the same trigger line the sequencer does, so it plays
with the pattern stopped, and its velocity falls into one of the kit's two step
weights, plain or accented, with a soft enough hit landing below both as a ghost
note — something the grid itself has no way to write. Drums have no release, so
the note-off a pad sends on the way up is ignored.

**Clock** lets the drum machine follow an incoming MIDI clock. It does this by
writing the tempo control directly, so the slider tracks the room rather than
fighting it — and so everything hanging off that control comes along. Put the
toy on the kit's tempo with **Kit sync**, and the toy's tune follows your
sequencer too, with no second wire and nothing else switched on: the sync counts
the tune off the tempo control, and the clock input writes the tempo control.

What arrives is a tempo, not a downbeat. bender ignores clock start, and the
kit's step counter runs off the tempo control rather than off the pulses, so the
wire buys the right speed and never the right bar. The tempo control steps in
whole bpm besides, so a room at 128.5 is followed at 129 and walks a beat away
from it every couple of minutes. Start both machines together and they hold for
a phrase; nothing here holds them together for a song.

## Sending

Three switches sit together in the panel's toggle row, and all three are what
bender puts _on_ the wire rather than takes off it. Each starts off. The first
is **light the rings**, above; the other two are the clock and the notes.

**Send the clock** puts MIDI clock out at 24 pulses per quarter note, with start
and stop riding the drum machine's own run switch. The pulses are counted off
the steps the kit reports clocking — a step is a sixteenth, so each one is worth
six pulses — rather than off a timer running alongside it. That is deliberate: a
timer would send a clean clock the instrument itself is not playing to, whereas
counting the kit's steps means everything that drags the kit drags what is
following it. Pull the tempo control, starve the rail, bend the clock line, and
the machine downstream goes with you.

Counting steps costs granularity, and it is worth being honest about how much.
The kit reports its step count about every 16 ms and a sixteenth is far longer
than that, so a step's six pulses leave together in a burst rather than evenly
spaced. Anything that averages a clock over a beat — which is most things,
bender's own clock input included — reads the right tempo off it. Anything that
advances on single pulses gets them in sixes.

**Send the notes** mirrors what the two chips are sounding as note-on and
note-off, the toy on channel 1 and the FM chip on channel 2. That is the whole
board and not just your hands: the ROM's tune, the backing under it, the
arpeggio, and any note the kit's trigger lines struck all go out alongside
anything played on the keys. Pitches leave in MIDI's numbering, so the chip's
zero note goes out as 57 — the A3 the ROM counts up from. Notes leave at one
fixed velocity, since the chips report what is sounding and never how hard it
was struck. Switching the toggle off releases whatever is still held, so nothing
is left ringing on the far end.
