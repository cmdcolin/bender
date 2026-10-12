---
title: Starving the power rail, and a paperclip on the timing pin
date: 2026-08-18
summary:
  The toy keyboard, the drum machine and the FM chip share one battery rail, and
  starving it or clipping the oscillator pin drags pitch, tempo and envelopes
  down together.
image: /blog/starved-rail.webp
imageAlt:
  The toy keyboard's controls, with Starve at 0.85 under the supply section and
  the clock running at 0.60.
look: '#set=chipLevel:0.85,chipClockX:0.6,chipStarve:0.85,delayMs:300,dlyFb:0.5,dlyMix:0.3,brownAmt:0.35'
---

The toy keyboard, the drum machine and the FM chip run off one battery rail, and
bender has modelled that rail from the first release. Version 0.5.0 gave it the
parts that make a starve sound like the real thing: a capacitor, a single
oscillator behind pitch and tempo, and a paperclip that can land on the timing
pin.

## Starve

**Starve** is a resistor to ground on the shared supply. It keeps drawing
current after the chip has gone quiet. A quarter of the way up, the toy runs
flat and dives. At three-quarters it reboots several times a second, because a
watchdog decides the supply has failed and resets the chip. The watchdog's trip
point drifts with heat, so the reboots never land on a beat. The lamp above the
keys reads the rail in volts and shows **reboot** whenever the watchdog fires.
The
[dying toy](/bender/app/#set=chipLevel:0.85,chipClockX:0.6,chipStarve:0.85,delayMs:300,dlyFb:0.5,dlyMix:0.3,brownAmt:0.35)
preset sits there.

## One oscillator

A toy like this has one RC oscillator in it. The note is that oscillator
divided, the sequencer divides it further, and the envelopes count off it. An
early version let the pitch read the rail while the tempo did not, so a starve
dived the pitch and left the tempo marching. Version 0.5.0 put both on the same
rail. At Starve 0.5 the toy now plays 1.25 notes a second against 3.25 on a
fresh board.

## Reservoir

Every power bend used to be resistive, so the rail settled inside 17 ms and a
starve landed as a step. **Reservoir** puts the board's own capacitance behind
the supply. The resting voltage stays the same and only the time to reach it
changes, from 17 ms up to two seconds. The pitch leaves from where it was, slows
as the capacitor and the load find balance, and settles at the bottom. In a
recording of a real bent toy, the pitch spends 4.7 frames falling for every
frame rising. A stock starve gives 1.1, and the capacitor at six tenths of the
knob gives 4.9.

## The paperclip

A CMOS oscillator barely cares what its rail does, so starving the supply
directly tops out at about two-thirds of an octave before the chip stops. A
recording of a real bent toy has single events spanning two octaves, so the
supply cannot be the whole story. **Clip on clock** lands the paperclip on the
oscillator pin, the one high-impedance node on the board, and hangs a found
capacitor on the clock. Dividing the clock has no ceiling, and the knob reaches
four octaves.

Leaving is slow, because the clip charges the capacitor through the contact.
Coming back is instant, because lifting the clip takes it out of the circuit.
That asymmetry is why the bend dives and snaps back on every touch in the
[paperclip](/bender/app/#set=chipLevel:0.85,chipAccomp:0.5,chipStarve:0.3,chipCap:0.6,chipClipHz:3,chipClipClock:0.45,drumLevel:0.25,brownAmt:0.25,humLevel:0.2,faultCluster:0.55)
preset.
