---
name: taste
description:
  What Colin likes and dislikes in bender's sound and in how an agent makes
  music with it. Read before voicing a preset, a demo scene or a live session.
---

# Taste

Gathered from live sessions, with the words that decided each line. Add to it
when Colin reacts to a sound.

This is taste for making songs, scenes and showcase presets. It does not limit
which bends get built: for the bends themselves "anything can go".

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
- Melancholy as "textured piano and small synth melancholies", "sad listening":
  Parlor's e.piano in 16th-note broken chords on cassette, a soft Growler
  triangle doubling the tune, a quiet ghosted beat.
- C minor and F minor, and their neighbours now and then ("i have felt 'trapped'
  in them my whole life so variety is ok"). One key for a long time ("i can vibe
  in the same key for a long time"), with the melody and the kit riffing inside
  it.
- The comb rung quietly on the tonic under everything (`combHz` at the root,
  `combFb: 0.93`, `combMix: 0.08`): "constant resonant synth … quite good", and
  nice for ambient.
- Drums "a bit more mutant" through the kit's own circuit: `drumKickBias`,
  `drumHissKick`, `drumBankFm`, `drumBits: 6`.
- A bend that goes far commits to it: "better to lean into it if we go that
  far".

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
- Random settings cycling, and so many changes at once that no one change can be
  judged.
- Chiptune: a bright toy melody over a kick and snare grid.
- Epic or cinematic in place of melancholy: strings and choir, long held notes,
  i–VI–III–VII, the harmonic minor's major V, a big room. A sparse arrangement
  reads the same way ("trying to create this false epicness"). Not "funeral".
- Haunting in place of melancholy: the dark clanging ambient piece was "kinda
  nice but just haunting".
- Ambient texture on a fixed cycle ("just sounds like loop").
- Clangs that are neither subtle nor rare, and FM bell clangs ("too silly and
  synthetic").
- A generic pedal move offered as a bend: fuzz, a filter sweep, tape drive ("a
  generic pedal, not a bend that i wanted").
- A bend that swamps the melody and then retreats after a few seconds.
- Under a locked-in melody, bends that invent notes of their own, such as
  `pcmRunOn` running a voice on through the ROM ("random melodies that distract
  from melancholy"). They "could apply in another scenario", where no melody is
  being held.

## Working with Colin

- Mouse first; no keyboard shortcuts.
- Heavy test runs go to `scripts/ada.sh`, off the machine playing audio.
