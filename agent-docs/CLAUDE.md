# Agent documentation

The top level holds only `TODO.md` and this file. Every other file goes in one
of these folders:

- `reference/` holds settled material: how a subsystem works, and measurements
  with their numbers.
- `ideas/` holds parked proposals, one per file, in a subfolder named for what
  the proposal waits on: `waiting-on-a-call/` for a decision, and
  `collections/` for files that group several small items. Each file has
  `name:` and `description:` frontmatter, and the description is written as the
  hook someone would pick the idea up by. Moving a file between folders changes
  its status. Once a proposal is decided, it leaves `ideas/`: it becomes an ADR
  if the decision deserves a record, and is deleted otherwise.
- `handoffs/` holds the unfinished state of a session. A handoff lists pointers
  to code and docs and repeats none of their content. Delete it once the work
  lands.
- `todo/` holds committed work, one file per item, with `metadata.category`,
  `area`, `first_move` and `order`. `TODO.md` indexes these files and is absent
  while nothing is committed.

Two kinds of record have no folder:

- When an approach was tried and declined, write a sentence with the number
  that decided it at the code that would try it again. There is no folder of
  rejected ideas.
- What a session did and which commits it made are in the git history.

Cite a doc by its path, so that a grep finds every citation when the doc moves.
A doc with a "State as of \<date\>" section should be split into the folders
above.
