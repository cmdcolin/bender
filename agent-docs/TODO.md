---
name: todo
description:
  Index of the open action items in todo/, grouped by what to do first. Read
  when picking up work, and before filing anything new here.
---

# Todo

One file per item under [todo/](todo/). Each carries its table row in its own
frontmatter: `metadata.category` picks the table, `area` and `first_move` are
the columns, `order` is where it sits. This index has no generator, so add or
remove a row here when you add or remove an entry.

## Ready

| Item                                                                  | Area                 | First move                                                        |
| --------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------- |
| [Fold line for gated rows](todo/fold-line-port.md)                    | diagrams             | read videoskillet diagram.ts shutBy/boxFold and its test          |
| [Box key registry test](todo/box-key-registry-test.md)                | diagrams, tests      | copy videoskillet schematicKeys.test.ts onto drawingFor.tsx       |
| [OpenBox to videoskillet](todo/open-box-to-videoskillet.md)           | diagrams, cross-repo | merge the two BoxRows forks, then share OpenBox                   |
| [Layout helpers](todo/diagram-layout-helpers.md)                      | diagrams             | write spreadRow(widths, span) and port BusDiagram and FmDie       |
| [Patch drawings on shared parts](todo/patch-drawings-shared-parts.md) | diagrams             | swap TriggerPatch's raw svg and press() for Diagram and Pressable |
| [Inert diagram parts](todo/inert-diagram-parts.md)                    | diagrams             | make BusDiagram's tap, inject and feed wires Bends                |
| [Toy die roll test](todo/toy-die-roll-test.md)                        | tests                | run the test alone and reset the board at its start               |
