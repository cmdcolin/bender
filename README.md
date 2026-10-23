# bender

virtual web based circuit bender

- App: https://cmdcolin.github.io/bender/app/
- Simple version, laid out for phones: https://cmdcolin.github.io/bender/pocket/
- Home page, and your saved voices once you sign in:
  https://cmdcolin.github.io/bender/

A shared link holds the board in the URL hash. When a link with a hash opens the
home page, the page's script redirects to the app with the hash intact, so an
old link still opens the same board.

## The signal path

You interact with the audio through the signal path diagram, and clicking a
button there opens a settings panel.

Full explanation in [How it works](docs/HOW-IT-WORKS.md).

## Features

- Circuit bend a toy keyboard, drum machine, and basic FM synth
- A three-oscillator ladder-filter mono synth on the same gate line, for bass
  lines and drones, with seven faults on its voice card
- The kit can sample itself: a 12-bit ROM mode with pitch and truncation, the
  lofi drum machine
- Tape delay, reverb, and distortion 'guitar pedals'
- Ensemble pedal: bucket-brigade chorus, string-machine ensemble, dimension and
  flange
- A tube amp pedal with Fender and Marshall tone stacks solved from their
  circuits, a push-pull power stage that sags, and a speaker
- Allows custom piano roll and drum sequences
- Patch bay with LFO and other modulations, wired from the bay or from the
  `+ mod` button on a control
- Tap in the tempo, either delay time, or the modulation rate
- Buttons to easily randomize settings
- Connect MIDI controller (works with Chrome, Firefox Nightly)
- Tape loop: a looping tape with a head that re-records over the loop
- Varispeed deck under the whole board — slow the entire instrument for real,
  tempo and pitch together, with a motor that winds down
- A tape machine that runs open reel, cassette or microcassette, with Dolby B or
  dbx on record and play, and sits at the end of the board, ahead of the pedals
  or ahead of the bends
- A cassette four-track with four tape loops cut to their own lengths behind a
  desk with EQ and an aux send. It can loop the board through itself, wear its
  tape through, or squeal with nothing plugged in
- Shareable URLs

Uses the AudioWorklet API...surprisingly powerful and fast
https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet

See full feature list - [docs/features.md](docs/features.md)

## User interface

You can see from the above screenshot it's all kind of compact and wrapped into
that signal diagram. It is a little tricky but it is better than just having 100
sliders all visible at once.

For super tactile control, get a MIDI controller — I got one just because I made
this! Any will do; mine's an Akai Professional MPK Mini (drum pad, 8 dials,
keys).

## Run

```sh
pnpm install
pnpm dev
```

## Docs

- [User guide](docs/USER-GUIDE.md) — the machines, the trigger patch and bends
- [Bends](docs/BENDS.md) — what each fault does to the circuit, and why
- [How it works](docs/HOW-IT-WORKS.md) — the signal path map and the app's
  architecture
- [Features](docs/features.md) — every control, generated from the app's tables
- [MIDI](docs/MIDI.md) — setting up a controller
- [AI usage](docs/AI-USAGE.md) — playing bender from Claude in Chrome or Claude
  Code through `window.bender`
- [Development](docs/DEVELOPMENT.md) — testing, benchmarking, releases
- [Data flow](docs/dataflow.md) — how a block gets rendered across the two
  threads
- [Optimizations](docs/optimizations.md) — what the code does to fit inside an
  audio callback

## Footnote

Initial template with Claude Fable and extensively vibecoded. Follows in
footsteps of https://github.com/cmdcolin/ntsc.js

## Demos

<!-- generated:demos -->

- Dubby drums
  https://cmdcolin.github.io/bender/app/#p=ACwAJAHIAQYEAAYCwAEAAgCgAQC0AQASDBgBEgEMAQgABAEAAAUABwALAA8CBgCuAQKuAgCMAQAYAJoBAD4CogEBAAECAnoAoIAEAIICAICiBAKAgAQAgoIEBRYBEAFyAAIDQAECAAgCBhCQAwB2AjQBZCcCCaYFAQgC7gkCmAEBoB8AZgDyAgFEBfAkARAAGgAaAAYAFgAdAA4ACgBlABIADgCFAQr2FwYJAAYACBYI

- Dubby
  https://cmdcolin.github.io/bender/app/#p=AAAAJAFSAA4HAgACAQIAqAEAyAEFCAcEAAQACgAMAAQADgAGAAoABwAFAAMACgABAAAAAgEWAMgBAMQCALQBAJgCAMoIBH4AVgHIAQiAZgDwnQEAgAQA8B8HyAEABgCsAQAMABoAFAAWANwCAAQABgICAAIAHAN6AORDAMACAIB9AAIAWADIAQACNQIAbgAOAHcD4iwAgAEBAgFkBNAQA4IBABQBIgBOAbQBAAoBAgDEAQAOABwAqAEADgAsADkADgASABkGzhMAIgEGALQHACwAaACUAgAIAIwBAccBAH4AMgsuCHAAyAEAwAEAlgEBBAAEAAYABgAIAAoADAAOABIAFAAKAAgABAAEAAQABAcUABIAEgASABIAEgASABIAEgASABQAFAAWHBQ

- Glitch voice
  https://cmdcolin.github.io/bender/app/#p=AIwBACQBWgEYEQAlBAICD8gBAWwADAQCAAoFZAPcJApQAAoBAgCMAQA8Awgd_gEKVgIOAqYFCYQFAaINBMgBAGoB8CQBEAAiALkBAAQAEACvAQAWAZMBASQAqAECCgKMAQG8AQAEALABA6Y7CAADeAIKBAoEegBuAoIB

- Aimless stalling lullaby
  https://cmdcolin.github.io/bender/app/#p=AKoBAnYAxAEBjAEACAAEAAYNLBisAQPiEAAKDsSJAQCAAwCABQB4CMgBAbgBFgEBJinyAQE8CEgAZAS6BQmqBwMGAwQByAEDZh8WAQIBVANiCQhYoAEQ6MABAJh_

- Motorboat lullaby
  https://cmdcolin.github.io/bender/app/#set=chipLevel:0.8,distMix:0.85,distSupply:0,distDraw:1,distSpeaker:0.4

- Paperclip on the kit
  https://cmdcolin.github.io/bender/app/#set=chipLevel:0.7,chipAccomp:0.5,chipSupply:2,drumSupply:1,cell2Cap:0.1,cell2Clip:6,drumLevel:0.8,drumKick:32912,drumSnare:2056,drumHat:8738,faultCluster:0.5

- Drift until the header
  https://cmdcolin.github.io/bender/app/#set=srHz:16000,crushMix:1,crushAdc:3,crushDataLine:13,crushDataFault:2

<!-- /generated:demos -->
