---
title: A knife through the chips' buses
date: 2026-08-22
summary:
  Cutting, grounding or bridging a wire between a chip and its ROM changes what
  the chip is told, so the tune comes out wrong the same way every lap.
image: /blog/knife-on-the-bus.webp
imageAlt:
  The toy keyboard's knife-on-the-bus section, with named cuts such as rests
  fill in, half a tune and two songs at once, and data line D2 held to +V.
look: '#set=chipLevel:0.9,chipAccomp:0.7,chipClockX:1.2,chipDataLine:3,chipDataFault:2'
---

The first bends in bender all attacked the analogue side: the supply, the clock
and the output. Version 0.5.0 added a knife on the digital buses. A cut data or
address line leaves the divider, the counter and the envelopes working and
changes what the chip is told. The damage therefore repeats every lap of the
song and plays perfectly in time.

## Address and data

On the toy keyboard, each step of the song is a note code on a six-line data
bus. The low lines are small intervals, and codes 0 and 1 are the two codes that
are not notes. Holding a data line high fills in the song's rests, which is the
[wrong song](/bender/app/#set=chipLevel:0.9,chipAccomp:0.7,chipClockX:1.2,chipDataLine:3,chipDataFault:2)
preset. An address line picks which cell the chip fetches, so a fault there
plays a different part of the ROM correctly. With the top address wire on the
floor, the song folds into its own first half, which is
[half a tune](/bender/app/#set=chipLevel:0.9,chipAccomp:0.5,chipAddrLine:4,chipAddrFault:1,delayMs:260,dlyFb:0.4,dlyMix:0.25).

## Named cuts

A bus fault takes three controls together: which wire, what happened to it, and
how far through the trace the blade went. Most combinations cut a wire you
cannot hear. Version 0.8.0 opened each chip's bus section on a row of the cuts
worth hearing, named for what they do, such as "rests fill in", "the tune in the
bass" and "two songs at once". One press wires the knife and shows which
controls it moved. A test renders every named cut against the same board and
requires a difference, and it caught one cut on the drum bus that came back
bit-identical to no cut at all.

Three of the named cuts go down in pitch. For example, bridging the toy's two
big-interval wires drops the melody an octave, and on the FM chip, soldering the
top two octave bits together lands every voice at the bottom of its range.

## A cut wire floats

A wire can go to ground, go to +V, be bridged to its neighbour, or be cut. A cut
pin first held its last value, and from a cold start that value was zero, so
every cut sounded exactly like a short to ground. Since version 0.16.0 the pin
holds what the bus was carrying when the knife went through and then drifts
after the neighbouring trace. On the FM chip's wave bus, which the chip reads
eight times a sample, that turns the quietest fault on the chip into a full-band
one.

Version 0.16.0 also gave the FM chip a percussion bank. Pressing Rhythm hands
its top two channels to a drum kit in ROM, with a bass drum and two slots wired
to a free-running shift register, the only noise source on the part. The bank is
one byte on the data bus, so the existing knives reach it, and a bend that used
to move a note by an octave now sweeps the hiss from rumble to sand.
