---
name: taste
description: What Colin likes and dislikes in bender's sound and in how an agent makes music with it. Read before voicing a preset, a demo scene or a live session.
---

# Taste

Gathered from live sessions, with the words that decided each line. Add to it
when Colin reacts to a sound.

## Likes

- Avant-garde and noise music. Sounds that make a listener ask how they were
  made: one circuit leaking into another, faults that drift and recover.
- The odd sounds woven into the music, not fired at random: a ring-mod clang
  that tracks the chord root, echoes that answer the lead an octave away, breath
  from the FM noise blob in the lead.
- A strong lead melody held constant through a piece ("that lead was great").
  The Glint clarinet lead over F minor 9ths, and the FM bell motif in C
  Phrygian.
- Syncopation: leads that enter off the beat and tie across the barline, chords
  struck by the kick (`pcmStruck: kick`, "sorta funky").
- Darker material over lounge: the half-time C Phrygian piece with a choir on
  power chords, a sub bass and the bell ("it was good").
- The analog kick at `drumRing: 0.55`, `drumTune: 0.8`, `drumDecay: 1.2`,
  `drumSweep: 1` ("quite good").
- Steady tape hiss, at a fixed level.
- Songs with sections that develop, and a groove leaned into once it works.
- The jazzy lofi sound (minor 9th and major 7th e-piano, clarinet lead) now and
  then, but not as the default: "not all the time". Vary the vibe from piece to
  piece.
- Editing while the music plays, with each change landing on the bar and named
  on screen.

## Dislikes

- Power-supply bends: batteries, starve, brownout, sag.
- Pitch that moves: chorus wobble, tape wow, varispeed glides ("got a little off
  tune").
- Glitch-buffer stutters and drum retriggers ("not my fav setting").
- Contact crackle and noise layers.
- Hiss that swells and fades with the music.
- A kick pitched up: `drumSweep: 2.2` with `drumTankCouple: 0.35` was
  "interesting for a little but not better".
- The kit's networks rung into drones (`drumRing: 0.93`) as a breakdown.
- Random settings cycling, and so many changes at once that no one change can
  be judged.
- Chiptune: a bright toy melody over a kick and snare grid.

## Working with Colin

- Mouse first; no keyboard shortcuts.
- Heavy test runs go to `scripts/ada.sh`, off the machine playing audio.
