---
name: board-cases
description:
  A case is a panel the player builds (which machines are on the board, a few
  macro knobs, their own named cuts) and it travels in the link beside the
  board; waits on the design of the picker and the macro editor.
---

# Board cases

The board has 449 controls in 33 groups. A case cuts it down to the machines one
piece of music uses, and it travels in the link beside the board.

- **Pick the machines.** A machine left out of a case leaves the path as well as
  the panel, by the same rule that opens a fold when it hides something you
  changed.
- **Macros.** A macro is a knob that travels a road between two boards. `Glide`
  already computes the road, and Pocket's tune sheet already stands the board
  part way along one. To make one: set the board, mark it, set it again, mark
  it, and name the knob ("wear", "break").
- **Named cuts of your own**, saved into the case.
- **Doors open onto a case.** "Tape table" would hold the four-track, the mic,
  noise, the tape machine, the delays, the verb and two bend slots; "toy bender"
  the toy, the kit and the six slots.
- **Scripts stay declarative.** A case could carry behaviour such as "every 8
  bars, roll a knife", but a script in a shared link is a stranger's code, so a
  case holds data (macros, sides, triggers) and never something to `eval`.
