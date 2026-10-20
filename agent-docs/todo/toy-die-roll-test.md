---
name: toy-die-roll-test
description:
  toyDie.dom.test.tsx "an open box rolls its own rows from inside its card"
  fails when run alone, and passes after the tests before it in the file.
metadata:
  category: ready
  area: tests
  first_move: pnpm test src/ui/toyDie.dom.test.tsx -t 'rolls its own rows'
  order: 10
---

# Order-dependent toy die roll test

- `pnpm test src/ui/toyDie.dom.test.tsx -t 'rolls its own rows'` fails on main.
  The full file passes most runs.
- The test compares two whole boards. A knob an earlier test sets probably
  decides where the roll lands.
- Reset the engine board at the test's start, or compare only the open box's
  keys.
