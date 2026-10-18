---
name: map-editing
description:
  Ranked ways to edit the board from the signal-path map instead of the drawers
  - drag a door to reorder or take off, draw the feedback wire, and separate the
  toy's tune from hand notes on its gate line.
---

# Editing the board from the map

Ranked proposals, none decided. The map already has "+ add a stage" and "− take
off a stage" menus; these take the rest of the edits there.

## 1. Drag a door to reorder

- **Today:** bend and pedal order are set by dragging boxes in the Signal order
  door (`SlotRack`, `PedalRack`, `move` in `src/ui/reorder.ts`). The map shows
  that order but cannot change it.
- **Idea:** drag a door along the chain. A drop on a gap inserts there, and a
  drop off the map takes the stage off through the menu's `takeOff`.
- **Cost:** the map is one scaled SVG, so doors are about 20px on a phone. Put
  the handles on the phone shelf's chips instead.

## 2. Draw the feedback wire

- **Today:** the map draws the wire; `FeedbackLoops` edits it.
- **Idea:** drag from a stage's output dot to an earlier stage to make or
  retarget a loop; drag the wire off to cut it.
- **Needs:** item 1's drag handling first.

## 3. Hands off the toy's gate line

- **Today:** a hand-played toy note rides the gate line (`keyStruck` with
  `keyHeld`), so every jumpered machine plays it, and so do the kit, sampler,
  ring mod, echo and mod bus wherever they read `trig.key`. The jumper reads
  "follows toy" / "own keys only".
- **Idea:** a per-destination "hands also strike" switch, defaulting to today's
  behaviour, so the toy's tune and arp can reach a machine without the toy's
  keys doing so. Then fold `letterKeys` and `midi.keyRoute` into one "hands go
  to" router.
- **Cost:** turning hand notes off the line changes how saved boards sound, so
  the default has to stay as shipped.
