---
name: box-key-registry-test
description:
  One test over every stage drawing that each knob opens from exactly one box,
  and only its own group's knobs, as videoskillet's schematicKeys.test.ts does.
metadata:
  category: ready
  area: diagrams, tests
  first_move:
    copy videoskillet schematicKeys.test.ts and point it at drawingFor.tsx and
    toyBoxKeys.ts
  order: 4
---

# Check every drawing's box keys in one test

- bender checks box key coverage one drawing at a time, in
  `toyDrumDiagram.dom.test.tsx` and `toyDie.dom.test.tsx`.
- videoskillet's `src/ui/schematicKeys.test.ts` checks every drawing and fails
  when a knob opens from no box, from two boxes, or from another group's box.
- bender's inputs: the `DRAWINGS` table in `src/ui/drawingFor.tsx`,
  `PATH_DRAWINGS` in `src/ui/Section.tsx`, `NODE_KEYS`/`VOICE_BOXES` in
  `src/ui/toyBoxKeys.ts`, and each drawing's own `OPENS`.
- Exporting each drawing's `OPENS` may be the cheapest way in.
