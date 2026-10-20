# MIDI

Chrome and Edge give a page raw access to MIDI, and bender uses it in the
**midi** panel.

## Binding controls

Press **⚟** beside any control, then move a knob to bind that knob to the
control. **auto-map** binds a known controller's knobs by CC number in one step.
**learn in order** binds any controller: sweep each knob once, left to right,
and each knob binds to the next control in line. Both bind in the same order:
mixes and levels first, since a set gets played on those, then the rest down the
signal path.

A bound knob takes over its control only after it sweeps through the value
already on screen. Without that, loading a preset would snap every control to
wherever the hardware knob was left, and a physical knob cannot show where it
was left. Until the knob catches up, the control shows in amber where the knob
is waiting, and one continuous turn counts as a single step in the undo history,
the same as a slider drag does.

**Endless encoders** skip all of that. They report relative turns, so no
position can disagree with the screen or get stranded, and a click moves a
control by one CC step's worth of its travel, whatever that control is. Two
incompatible message formats exist for these in the wild (the same byte value
means opposite directions on different devices), and a single message cannot
tell them apart. bender picks up the format from a knob's first message and
keeps it. If a bound knob slams to one end and sticks, it needs the other
format. The **↻** icon on a binding's row marks a control bound to an encoder.

**Light the rings** sends every bound control's current value back out to the
hardware, so a knob's LED ring matches the screen. This matters most for an
encoder, which has no other way to show where its control is.

## Playing

Notes play the toy chip's keyboard, with A3 where the ROM has it. The chip
counts semitones from 220 Hz, so a controller's middle C arrives three semitones
higher than you'd expect. Played notes strike and light the same on-screen keys
your hand does.

There are two keybeds on the panel once Glint is up in the mix. The picker
beside **notes play the keys** sets which keybed the wire plays:

- the toy
- Glint
- **both**: one key, two synthesisers
- **split**: the toy below the split point and Glint from it up. Press **split
  at …**, then play the key to cut at. That key sets the split and makes no
  sound.

When you move the picker mid-note, the app releases whatever the wire is
holding, so no note is left stuck on a bed the controller has stopped playing.
The sustain pedal holds notes and releases them, and either spelling of "all
notes off" clears the board. A MIDI note or the trigger patch can arrive at any
velocity, while the toy's own keys are switches and always strike at full
velocity.

**Pads play the kit.** Channel 10 is where General MIDI puts percussion, so a
pad bank sending there needs no setup. The standard GM map folds onto bender's
voices automatically (sticks to the tom, shakers and closed hats to the hat,
anything that rings on to the open hat or the cymbal, wood and cowbells to the
bell).

A pad bank that sends on its own channel or its own notes needs **learn pads**:
hit a pad for each voice down the kit, and what you hit overrides the standard
map wherever the two disagree. To fix one voice on the wrong pad, press **⚟** on
just that row and hit the pad you meant.

A pad fires the same trigger line the sequencer does, so it plays with the
pattern stopped. Its velocity falls into one of the kit's two step weights,
plain or accented, and a soft enough hit lands below both as a ghost note, which
the grid cannot write. Drums have no release, so the note-off a pad sends on the
way up is ignored.

**Pads play effects.** Under the kit's pads, the **throws** list has a **⚟** for
each of the six throws (spin, dive, brake, crash, drop, crush) and each of the
sixteen bend keys, by letter. Press it and hit a pad: the throw holds while the
pad is down and the board returns when you let go, the same as a key on the bend
board. A pad on a bend key keeps the letter through a redeal, so it plays
whatever that letter holds now. A throw pad takes priority over the kit and the
keybed, one pad holds one throw, and all notes off releases whatever a pad is
holding.

**Any control can be an effect pad.** Pick a control in the **effects** row, set
the value the pad should push it to, press **⚟** and hit a pad. While the pad is
down the control sits at that value; on release it returns to where the board
has it. A pad holds one target, so binding it to an effect frees it from a
throw.

**Clock** lets the drum machine follow an incoming MIDI clock. The clock input
writes the tempo control directly, so the slider tracks the incoming clock and
everything driven by that control follows. With **Kit sync** on, the toy's tune
follows your sequencer too, with no second wire and nothing else switched on:
the sync counts the tune off the tempo control, and the clock input writes the
tempo control.

bender takes a tempo from the clock and ignores clock start. The kit's step
counter runs off the tempo control instead of the pulses, so the clock sets the
speed and has no effect on which bar the kit is in. The tempo control steps in
whole bpm, so a clock at 128.5 is followed at 129 and the kit drifts a beat away
from the source every couple of minutes. Two machines started together stay
aligned for a phrase and drift apart over a song.

## Sending

Three switches in the panel's toggle row send data from bender to the hardware.
All three start off: **light the rings** (above), **send the clock** and **send
the notes**.

**Send the clock** puts MIDI clock out at 24 pulses per quarter note, with start
and stop following the drum machine's run switch. bender counts pulses from the
steps the kit reports clocking, not from a separate timer; a step is a
sixteenth, so each step is worth six pulses. A separate timer would send a clean
clock that the instrument itself is not playing to. Counting steps means
everything that drags the kit drags the clock it sends: pull the tempo control,
starve the rail or bend the clock line, and the machine downstream follows.

Counting steps limits the clock's granularity. The kit reports its step count
about every 16 ms and a sixteenth is far longer than that, so a step's six
pulses leave together in a burst and are not evenly spaced. Anything that
averages a clock over a beat, which includes most receivers and bender's own
clock input, reads the right tempo. Anything that advances on single pulses gets
them in sixes.

**Send the notes** mirrors what the two chips are sounding as note-on and
note-off, the toy on channel 1 and Glint on channel 2. The notes cover the whole
board: the ROM's tune, the backing under it, the arpeggio, and any note the
kit's trigger lines struck go out alongside anything played on the keys. Pitches
leave in MIDI's numbering, so the chip's zero note goes out as 57, the A3 the
ROM counts up from. Notes leave at one fixed velocity, because the chips report
what is sounding and not how hard it was struck. Switching the toggle off
releases whatever is still held, so no note keeps ringing on the far end.
