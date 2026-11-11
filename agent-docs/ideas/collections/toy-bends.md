---
name: toy-bends
description:
  Bends on Plinky's pitch dividers, ranked by how much of the tune they move
  under 120 Hz — divider cascade, divider leak and output on divider are built;
  an envelope comparator on the tempo counter, ROM contention, a tone sequencer
  and an output latch-up are measured and unbuilt.
---

# Bends for Plinky's dividers

Every candidate was built behind a switch in `src/dsp/stages/toyChip.ts` and
rendered for 8 s on Plinky alone, with the backing at 0.8 and kit sync off, on
the arp, für elise and sakura tunes. Every new control rests off, so stock stays
bit-identical, and `pnpm golden check` matches every board it had a take for.

- **Change** is the rms of the difference from the stock take over the stock
  take's rms. A phase shift alone reads about 1.4, so it separates a small
  change from a large one and ranks nothing above that.
- **Under 120 Hz** is `lowEnergy` over rms, the share the owner asked the
  ranking to follow.
- **Level** is the take's rms over the stock take's.

## Ranked

Arp, für elise and sakura in each cell.

| rank | bend                         | setting | change             | under 120 Hz       | level               | centroid              |
| ---- | ---------------------------- | ------- | ------------------ | ------------------ | ------------------- | --------------------- |
|      | (stock)                      |         |                    | 0.41 / 0.37 / 0.36 |                     | 715 / 860 / 925 Hz    |
| 1    | Divider leak                 | 1       | 1.39 / 1.38 / 1.42 | 0.91 / 0.89 / 0.92 | 0.97 / 0.96 / 1.01× | 108 / 141 / 102 Hz    |
|      |                              | 0.75    | 1.36 / 1.38 / 1.36 | 0.85 / 0.78 / 0.86 | 0.93 / 0.95 / 0.94× | 167 / 266 / 154 Hz    |
|      |                              | 0.5     | 1.39 / 1.36 / 1.38 | 0.68 / 0.50 / 0.69 | 0.97 / 0.99 / 0.96× | 367 / 709 / 346 Hz    |
| 2    | Output on divider            | N11     | 1.57 / 1.61 / 1.62 | 0.85 / 0.86 / 0.85 | 1.22 / 1.28 / 1.29× | 182 / 174 / 187 Hz    |
|      |                              | N10     | 1.39 / 1.46 / 1.46 | 0.68 / 0.70 / 0.72 | 0.98 / 1.05 / 1.10× | 425 / 399 / 352 Hz    |
|      |                              | N9      | 1.25 / 1.36 / 1.32 | 0.51 / 0.52 / 0.55 | 0.93 / 0.94 / 0.98× | 636 / 676 / 605 Hz    |
|      |                              | N3      | 1.36 / 1.41 / 1.18 | 0.42 / 0.38 / 0.38 | 0.91 / 0.96 / 0.94× | 754 / 901 / 976 Hz    |
| 3    | Divider cascade              | 0.75    | 0.88 / 1.00 / 1.02 | 0.64 / 0.67 / 0.68 | 0.94 / 0.95 / 0.97× | 445 / 384 / 441 Hz    |
|      |                              | 0.5     | 0.93 / 1.03 / 1.05 | 0.64 / 0.62 / 0.64 | 0.97 / 0.99 / 1.00× | 426 / 444 / 514 Hz    |
|      |                              | 1       | 0.78 / 0.94 / 0.97 | 0.54 / 0.64 / 0.67 | 0.86 / 0.89 / 0.92× | 594 / 446 / 467 Hz    |
| 4    | ROM contention, words ANDed  |         | 1.30 / 1.33 / 1.28 | 0.42 / 0.36 / 0.46 | 0.82 / 0.92 / 0.92× | 789 / 864 / 624 Hz    |
|      | ROM contention, words ORed   |         | 1.38 / 1.46 / 1.56 | 0.34 / 0.34 / 0.38 | 1.00 / 1.08 / 1.05× | 958 / 1056 / 874 Hz   |
| 5    | Envelope comparator on tempo | 1       | 1.06 / 1.10 / 1.14 | 0.39 / 0.34 / 0.34 | 0.40 / 0.47 / 0.54× | 794 / 1161 / 907 Hz   |
| 6    | Note latch leak, to ground   | 0.8     | 1.04 / 0.95 / 0.96 | 0.42 / 0.38 / 0.38 | 1.00 / 1.01 / 0.99× | 692 / 850 / 884 Hz    |
|      | Note latch leak, to +V       | 0.5     | 1.05 / 0.94 / 0.95 | 0.36 / 0.36 / 0.34 | 1.00 / 1.00 / 1.00× | 2466 / 1019 / 3459 Hz |
| 7    | Output latch-up              | 0.5     | 1.08 / 1.06 / 1.10 | 0.42 / 0.48 / 0.48 | 0.43 / 0.42 / 0.48× | 977 / 794 / 871 Hz    |
| 8    | Counter on the tone selector |         | 0.78 / 0.82 / 0.82 | 0.36 / 0.33 / 0.30 | 0.80 / 0.77 / 0.79× | 1068 / 1327 / 1402 Hz |

For comparison on the same boards: **Envelope on divider** at 1 reads 0.59 /
0.55 / 0.56 under 120 Hz, **Divider line** N11 to +V reads 0.87 on all of them,
**Starve** at 0.6 reads 0.33 to 0.36× the level and **Charge pump** at 0.4 puts
the centroid at 3.9 to 5.4 kHz.

Stacked on the sakura board, cascade 0.6 with leak 0.6 and the pin on N11 reads
0.86 under 120 Hz at 0.70× the level, and leak 0.6 with **Clock** at 0.25 reads
0.94, centroid 79 Hz.

## Built

- **Divider cascade** (`chipCascade`): the bass, chord, key and effect dividers
  count the melody divider's output. Each counts with the top bits of the word
  it loaded, from four of the twelve bits at the bottom of the knob to eight at
  the top, so its pitch is the melody's over a whole number. Its preset is
  _undertone backing_.
- **Divider leak** (`chipDivLeak`): the latch cells read high one at a time
  after a load, by a time table seeded per latch, so each note falls in steps to
  the full word at 27.5 Hz. The whole word takes 6 s at the bottom of the knob
  and 12 ms at the top. Its preset is _leaking latches_.
- **Output on divider** (`chipOutDiv`): the output pin pulls one wire of the
  divider word high through a diode, read by each divider as it reloads. On N11
  with the backing up, each divider on the sakura board reloaded with the pin
  high between 0.68 and 0.75 of the time and changed word more than 40 times a
  second. Its preset is _growl under the chord_.

The presets are whole boards because the cascade and the pin need a second
voice. A named cut may only set rows under its own heading, and **Auto
bass-chord** is listed under the keyboard heading.

## Calls made

- The leak went on the divider latch, toward +V. On the note latch the same leak
  walked each note through other notes of the tune and left the bass where it
  was (row 6).
- The leak runs in seconds, off no clock, so **Clock** and a sagging rail change
  how far a note falls before the next strike.
- A cell's time rises with its bit, less a seeded tolerance of up to 0.8 of that
  time, so a note sours by cents first and drops by octaves last, and the notes
  of a chord take different steps.
- A held key under the leak is loaded once, so it sinks to 27.5 Hz and stays.
- The output pin drives the wire through a diode. Bridged both ways, a lone note
  with that bit set loaded a word of 1 and sat at the top of the band. The
  sakura melody alone through N8 read a 12 kHz centroid against 1.2 kHz stock.
  With the pin inverted, a lone melody took one fixed word, the sound **Divider
  line** to +V already gives, and N11 with backing read 0.76 to 0.79 at 0.71 to
  0.77× the level.
- A lone note under **Output on divider** reloads while its own pulse is low, so
  its take matches stock sample for sample, and the bend starts once a second
  voice sounds.
- The cascade reaches the effect voice too, so a siren steps through whole
  divisions of the melody.
- The cascade's knob starts at the top four bits. With the tap half a bit
  shallower the voices sat on the melody's own pitch, and the share under 120 Hz
  read 0.38 / 0.26 / 0.27, under stock.
- The cascade preset sits at 0.6 and the leak preset at 0.75. At those settings
  the power between 30 and 120 Hz is highest (0.44 and 0.84 of the board with
  the kit at 0.25). Further up, the cascade's energy moves under 30 Hz and every
  leaking note reaches the same 27.5 Hz within 12 ms.

## Unbuilt

Each measured candidate has a sentence with its number at the code that would
try it again.

- **Envelope comparator on the tempo counter.** The counter holds while a struck
  note is over a threshold. The counter waits out each note's decay, a held key
  stops the tune and a kit hit on the gate delays it. It measured as a slower,
  quieter tune (row 5). Turned the other way, so the counter runs only while a
  note is loud, the arp tune never stalled and für elise stopped at its first
  gap (0.82 of the take silent). It is the candidate to build next for playing,
  since a key or a kick moves the tune along.
- **ROM contention.** A second song's chip-enable held on, with the two words
  ANDed or ORed, plays one fixed third tune (row 4).
- **Output latch-up.** The output over a threshold for eight samples trips the
  supply. Between 0.47 and 0.55 of the take was silent at 0.5 and 0.70 to 0.75
  at 1, the reboot loop **Starve** makes. The supply panel's **Latch-up** covers
  the jammed die.
- **Counter on the tone selector.** The step counter's low bits pick the pulse
  width (row 8).
- **Counter bits on the octave select** and **the counter's wires on the output
  pin** were not built, because each gives one fixed pattern per lap.
