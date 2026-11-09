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
- Hard techno at 150 after DJ Valentimes' ZL2-PCD-7: the kick at
  `drumTune: 0.91`, `drumSweep: 6`, `drumSwoopCap: 10`, its rumble only the kick
  thrown into Wraith at sixteenths, everything through Ember ("this is pretty
  sick so far").
- Creepy stabs over hard techno at 152 (after DJ Valentimes' D.A.): Parlor's
  choir at a quarter to half its ROM clock, its bus faults re-rolled every bar,
  ducked by the kick ("weird creepy stabs like that rule"). Keep them sparse,
  one every several bars, with little delay: "sparse is key for that sound",
  "too much delay now", "even less delay too".
- Glint bent hard as the lead over that kit: a slow G#, A, D riff in quarter
  notes on the bass patch, `fmSign: ÷4`, `fmFeedback` 4 to 8, `fmDrive: 18`,
  `fmGroundLoop: 0.35`, `fmSelfBus: 3 bits`, its wave faults and noise blob
  re-rolled every bar, with the kit's hats, toms, ghosts and kick doubles
  rewritten every bar around a steady four on the floor ("this is good hell ya
  that is the noisy insanity we need"). The same riff unbent sounded "not very
  good".
- Several layers of noise at once over the groove, each machine re-rolling its
  own faults every bar: Plinky's and Glint's chip settings, Parlor's bus faults
  at a quarter to half its ROM clock ("kinda sweet lol", "several layers doing
  some fun noise. i like it").
- In a noise set, sounds over melodies: "dont need true melodies just crazy
  sounds like that are fine".
- A noise moment that echoes out: thrown into Wraith at dotted eighths on its
  last bar, feedback held as the input closes.
- Voices on the mic jacks: a chant into Growler and onto Glint's bus, screams on
  the drum trigger line. Sheet and bottle smacks in rooms of their own, rare
  ("make that even more infrequent").
- Growler's acid loud and near self-oscillation, not buried under the layers.
- The toy chip's pin bends (crosstalk, scan, loop wires, PWM, envelope cap,
  short, ghosts, bank and divider lines) as tuned in `toyChip.ts`: "these are
  all amazing ... keep all". Leave those constants alone unasked.

- In hard techno, three parts: the kick, one low line and one lead. Plinky,
  Parlor, a melodic bass and Glint all at once were "fighting for lead" and
  "still too complex"; it settled as the kick at 160 with offbeat hats and
  Glint's evil riff (G#, A, D) taken three octaves down by `fmSign: ÷8`, ducked
  hard to the kick (`fmDuck: 0.85`), with Growler out.

## Dislikes

- Power-supply bends: batteries, starve, brownout, sag.
- Glint's own output on its bus (`fmSelfBus`) and its ground loop over a
  groove: each note smears and repeats, which reads as "too much delay" and
  "not sure we have control over glint".
- Howler's preset lead in hard techno: osc 2 at 8′, hard-synced and swept,
  tearing over the groove ("kinda fun but not bass enough ... annoying"). Both
  oscillators at 32′ with sync off made it a melodic bass instead.
- Parlor as more than a rare stab in hard techno, above all its e.piano in
  sixteenth broken chords: "pretty chill", then "goddamnit the parlor is not
  good here".
- Two kick-outs in a row, or one of four bars, in a hard section: "the beat
  sounds kind of like a breakdown". A brake throw and a slowed, smeared
  whisper read as "a somewhat silly effect".
- Pitch that moves: chorus wobble, tape wow, varispeed glides ("got a little off
  tune").
- Glitch-buffer stutters and drum retriggers ("not my fav setting").
- Contact crackle and noise layers.
- Hiss that swells and fades with the music.
- A kick pitched up: `drumSweep: 2.2` with `drumTankCouple: 0.35` was
  "interesting for a little but not better".
- The kit's networks rung into drones (`drumRing: 0.93`) as a breakdown.
- Random settings cycling across the whole board, and so many changes at once
  that no one change can be judged. One machine re-rolling its own faults as a
  layer is a like.
- Chiptune: a bright toy melody over a kick and snare grid.
- Plinky's lullaby ROM (Twinkle Twinkle) under a beat: "legitimately silly bad",
  said repeatedly. A demo, preset or board sets `chipLevel: 0` or picks a tune
  on purpose, and the toy's demo songs start only when asked for. The jams in
  `src/jam/jams.json` are what a good demo sounds like.
- Granular: "so digital". Tape delays and circuit glitches over it.
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
- A held lead over the noise: Glint's brass was "kinda weak", Growler's detuned
  saws "interesting but not really my style".
- A plain feedback loop as a noise moment ("pretty much just feedback").
- Lasers, osc 2 dived by the contour on every bass note, at length: "ok not too
  much of that".
- The clap through distortion and the spring, striking the sheet: "breathy",
  "weird resonant overtones".
- Under a locked-in melody, bends that invent notes of their own, such as
  `pcmRunOn` running a voice on through the ROM ("random melodies that distract
  from melancholy"). They "could apply in another scenario", where no melody is
  being held.

## Working with Colin

- Mouse first; no keyboard shortcuts.
- Heavy test runs go to `scripts/ada.sh`, off the machine playing audio.
