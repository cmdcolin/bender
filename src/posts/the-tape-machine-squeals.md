---
title: The whole board printed to tape, and a tape that squeals
date: 2026-08-21
summary:
  A tape machine at the end of the chain records the instrument itself, and
  sticky shed makes the tape grab the head and squeal with no screech sample
  anywhere.
image: /blog/shed-oxide.webp
imageAlt:
  The tape machine's controls at 3¾ ips, with squeal, hiss, wow, flutter,
  dropouts and print-through all turned up.
look: '#set=chipLevel:0.7,chipStarve:0.2,tapeMix:1,tapeSpeed:0,tapeDrive:10,tapeBias:0.55,tapeHiss:0.8,tapeWow:0.8,tapeFlutter:0.7,tapeDrop:0.6,tapePrint:0.7,tapeAzimuth:0.35,tapeSqueal:0.45'
---

A tape delay wobbles its echoes and leaves the instrument alone. The tape
machine in bender's first release records the instrument itself. It sits after
the brownout, at the end of the chain, so the whole board is printed to tape.

## The machine

The record head applies pre-emphasis, saturation and de-emphasis. The tape lays
hiss on the medium, so the playback head colours the hiss along with the
programme. Playback adds gap loss, head bump, dropouts, print-through and
azimuth error. **Speed** moves the machine as one part, shifting the gap corner,
the bump frequency, the hiss level, the wow rate and the spool-wrap time
together. The
[found tape](/bender/app/#set=chipLevel:0.7,revDecayS:1.6,revMix:0.18,tapeMix:1,tapeDrive:4,tapeHiss:0.55,tapeWow:0.3)
preset prints the toy clean at 7½ ips, and
[pinned](/bender/app/#set=chipLevel:0.8,drumLevel:0.5,drumBpm:96,delayMs:180,dlyMix:0.25,tapeMix:1,tapeSpeed:2,tapeDrive:15,tapeBias:-0.85,tapeHiss:0.4,tapeWow:0.15,tapeFlutter:0.2)
underbiases and slams it so the machine is the distortion.

## The squeal

Version 0.7.0 added **Squeal**, for sticky shed. The binder in an old tape has
broken down, so the tape grabs the head, stretches, lets go and grabs again.
Friction falls as the span starts to move, which makes the damping negative
while the tape is nearly still and positive once it is running. A resonator
wired that way needs no excitation. It takes off on its own and settles into a
limit cycle, and that limit cycle is the squeal. bender has no screech sample.

Speed sets the note, because a faster tape pulls the span tighter. Tape tension
drifts, and it decides whether the squeal starts at all, so the Squeal knob sets
how often the machine squeals as well as how loudly. A quarter of the way up it
squeals in waves, and all the way up it bites too hard for tension to stop it.
The squeal gets out twice: into the room, and onto the head along with the rest
of the transport, so everything already recorded wobbles at the squeal's rate.
The
[shed oxide](/bender/app/#set=chipLevel:0.7,chipStarve:0.2,tapeMix:1,tapeSpeed:0,tapeDrive:10,tapeBias:0.55,tapeHiss:0.8,tapeWow:0.8,tapeFlutter:0.7,tapeDrop:0.6,tapePrint:0.7,tapeAzimuth:0.35,tapeSqueal:0.45)
preset runs slow, soft tape with the squeal coming and going.

## Oxide sheds in patches

A dropout is a hole in the oxide, and a hole sits on one track. The first
version held the dropout on the transport and applied it to both heads, so every
dropout arrived on both channels at once. The same release moved it onto each
head with a noise stream of its own, so each head owns its hiss and its own shed
oxide.
