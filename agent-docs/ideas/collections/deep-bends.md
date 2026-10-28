---
name: deep-bends
description:
  Ranked rebuilds of the bend slots as circuits on the board's supply, heat and
  buses — crusher as ADC into R-2R (built), clipper as the toy's LM386 (built),
  comb as a BBD, glitch as a Discman, shifter as a Bode.
---

# Deep bends

The source machines read the shared supply (`ctx.railV`, `ctx.droop`), heat, the
trigger bus and the mic jacks, and the chips have `Bus` knives. Until the
crusher, the bend slots read only `ctx.mod`. Each candidate below rebuilds one
slot as the circuit it imitates, so the board's modelling reaches it. Stock
stays bit-identical: every new control rests off.

**Built:** items 1 and 2; items 3–6 are candidates.

## 1. Crusher → ADC, bus, R-2R DAC (built)

One converter takes both channels in turn onto a 16-wire bus into one R-2R
ladder (`src/dsp/stages/crusher.ts`). Measured with `crushMix: 1` on the
`pnpm faults` board, against the stock crusher at 16 bits (change is the rms
difference over the stock take's rms):

| control                | setting            | change | centroid | flatness |
| ---------------------- | ------------------ | ------ | -------- | -------- |
| Converter SAR          | toy starve 0.5     | 2.05   | 4017 Hz  | 0.48     |
| (stock, same starve)   |                    | 1.05   | 3258 Hz  | 0.33     |
| Converter ADPCM        | D12 to +V          | 1.81   | 2267 Hz  | 0.24     |
| Converter delta        | 12 bits, D15 cut   | 1.92   | 369 Hz   | 0.01     |
| Converter μ-law        | D14 to ground      | 0.88   | 3836 Hz  | 0.44     |
| Ladder mismatch        | 1                  | 1.97   | 4027 Hz  | 0.34     |
| Sample clock toy RC    | 12 kHz, starve 0.5 | —      | 1021 Hz  | 0.14     |
| (crystal, same)        |                    | —      | 2749 Hz  | 0.16     |
| DAC reference the bus  | 3 kHz              | 1.30   | 2820 Hz  | 0.23     |
| Logic XOR with the kit |                    | 1.24   | 5367 Hz  | 0.70     |

`pnpm spectrum crush` sweeps the 16 wires × 5 faults per converter:

| converter     | centroid     | flattest | broadband |
| ------------- | ------------ | -------- | --------- |
| stock and SAR | 1761–6100 Hz | 0.96     | 8         |
| μ-law         | 1761–4079 Hz | 0.54     | 10        |
| ADPCM         | 122–11063 Hz | 0.74     | 3         |
| delta         | 13–1800 Hz   | 0.09     | 0         |

ADPCM reaches widest, and delta is the only converter whose knives push the
board down into its bass.

- SAR equals stock on a full rail: the comparator settles 16 bits per sample
  period at 48 kHz, and `1 − droop` slows it as `((v − 0.2)/0.8)^1.5`. Bits it
  has no time for keep the last conversion's value, and both channels share the
  register.
- ADPCM is IMA with a 505-word block header. A stuck low code wire grows the
  error through each block: on a 330 Hz tone the error in a block's last 60
  words is over three times its first 60.
- On audio words the floating cut is the loudest fault: D15 cut moves the take
  3.59×, D15 to either rail 2.27×. D0–D7 change nothing at stock (−48 dB), so
  the named cuts sit on D13–D15.
- Calls made toward the wilder sound: one muxed bus and one SAR register for
  both channels, so faults cross between them; the RC clock stops dead below the
  toy's `DEAD_V` instead of slowing to a floor; the ladder's MSB rung is always
  short (backwards at zero) rather than random; the mic clock latches once per
  voice cycle with no multiplier, so a sung 200 Hz is a 200 Hz sample rate.
- A separate fault on ADPCM's step table stays unbuilt, because the bus on the
  nibble already gives the accumulating fault.

## 2. Clipper → the toy's LM386 into a speaker (built)

An LM386 on a Supply selector, into a cone (`src/dsp/stages/clipper.ts`). The
amp's supply pin charges from its rail and empties into the speaker; Draw pulls
the rail through `spiking` and `drawing`, a block late. Toy tune, default drive,
fully wet:

| control              | setting     | measured                          |
| -------------------- | ----------- | --------------------------------- |
| Draw, shared cells   | 0.5         | toy −3.2 st, 9 dropouts/s, 96 ms  |
| Draw, shared cells   | 1           | toy −4.7 st, 12 dropouts/s, 75 ms |
| (same, drive 30 dB)  |             | toy −7.7 st, 14 dropouts/s, 64 ms |
| Draw, bench          | 1           | toy 0 st, amp sputters 12/s       |
| Pins 1–8 gain        | 300× / 600× | sings at 2.7 / 1.3 kHz            |
| Bypass pin           | 0.7 / 1     | squeals at 8.5 / 3 kHz            |
| (shared, starve 0.3) | 1           | 1.25 kHz                          |
| (shared, Draw 0.6)   | 0.8         | 64 Hz motorboat growl             |
| Blocking             | 1, 200×     | 28% of the take near silent       |
| Speaker              | 0.5 / 1     | flatness 0.25 / 0.82              |

- Calls made toward the wilder sound: the amp mutes below a quarter of its rail
  and pops back after pin 7 recharges, rather than browning out smoothly; a
  saturated output stage draws more as the rail falls, so the loop runs away
  into a motorboat instead of settling into compression; the amp's bandwidth
  follows its supply, so every squeal dives with the load; a pinned cone
  radiates nothing.
- With current proportional to output alone, the loop found a stable sag at
  every Draw and never motorboated.
- Unbuilt: a trigger-bus tie for blocking, since loud transients already charge
  the cap; the clipper on the map's supply loop.

## 3. Comb → bucket brigade on an RC clock

- `src/dsp/util/bbd.ts`. Pitch is the clock, so sag dives the comb.
- Clock whistle, compander pumping, the loop amp clipping at the rail.
- Kit triggers pluck it.

## 4. Glitch buffer → a Discman with anti-skip RAM

- Spindle motor on the rail, tracking loss and sled skips.
- CIRC error handling as interpolate → hold → mute.
- A `Bus` fault on the anti-skip RAM.
- An mp3-decoder mode: faulted MDCT bins, dropped frames repeating, birdies.

## 5. Shifter → Bode shifter

- Allpass pairs drift with heat, so the unwanted sideband leaks back and beats.
- Quadrature oscillator on the rail.

## 6. Systemic

- Every bend on the supply: each reads `railV` and reports its load, so slot
  order decides who browns out whom.
- Bends in the fault system: each slot with a `Bus` and named cuts, as the
  crusher has.
