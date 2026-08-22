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
on-screen keys your hand does. The sustain pedal holds notes and releases them,
and either spelling of "all notes off" clears the board. Velocity comes through
too: the toy's own keys are switches and always strike at full velocity, but a
MIDI note or the trigger patch can arrive at any level.

**Pads play the kit.** Channel 10 is where General MIDI puts percussion, so a
pad bank sending there needs no setup — the standard GM map folds onto bender's
six voices automatically (sticks to the tom, metal to the hat, wood and cowbells
to the bell). A pad bank that sends on its own channel or its own notes needs
**learn pads**: hit a pad for each voice down the kit, and what you hit
overrides the standard map wherever the two disagree. Getting one voice on the
wrong pad doesn't mean relearning all six — press **⚟** on just that row and hit
the pad you meant. A pad fires the same trigger line the sequencer does, so it
plays with the pattern stopped, and its velocity falls into one of the kit's two
step weights, plain or accented, with a soft enough hit landing below both as a
ghost note — something the grid itself has no way to write. Drums have no
release, so the note-off a pad sends on the way up is ignored.

**Clock** lets the drum machine follow an incoming MIDI clock. It does this by
writing the tempo control directly, so the slider tracks the room rather than
fighting it.
