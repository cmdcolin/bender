# Development

```sh
pnpm install
pnpm dev
```

The site is an [Astro](https://astro.build) project with three pages:

- `src/pages/index.astro`: the homepage
- `src/pages/app/index.astro`: the React app, mounted as a client-only island
- `src/pages/pocket/index.astro`: the simple version, laid out for phones, in
  `src/pocket/`, which runs the same engine with a scope, a preset strip and a
  run button in place of the panel

The three pages sit under `/bender/`, the path GitHub Pages serves the repo at,
so the dev server has the app at `http://localhost:4321/bender/app/`.

## Styling

[DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) lists the tokens, the button kinds and the
rules for composing them.

## Testing

- `pnpm test` skips the sixteen files that take fifteen seconds or more of audio
  rendering (`SLOW` in `vitest.config.ts`). Naming one, as in
  `pnpm test src/dsp/tape.test.ts`, runs it.
- `pnpm test:full` runs all of them, as CI does. `pnpm test:changed` runs the
  files that import something changed since `main`.

The suite includes a torture test that pins every feedback path past unity at
once and asserts nothing non-finite, and nothing past the limiter, ever leaves
the chain. The test runs two seconds locally and ten under `test:full`. The
suite also runs the panel in jsdom to test the sentences the panel generates:
that a fold counts the rows underneath it correctly, that loading a ROM adds an
entry to the undo history, that a drag anywhere on the window counts as a drag.
The engine requests an `AudioContext` at startup, and the test setup supplies a
silent one; see `src/ui/testDom.ts`.

## Performance

The worklet gets 2.7 ms to fill 2.7 ms of audio, 375 times a second. Miss the
deadline once and a buffer goes out unfilled, which is an audible click.

- `pnpm bench` renders offline and reports what the chain costs per block, stage
  by stage. A board with everything patched sits near 9% of one core; the board
  as it boots sits near 1%. `pnpm bench stock` renders just that second case.
- `pnpm blocks` reports the distribution of block costs, because glitches come
  from the slowest blocks: a board averaging a tenth of its budget can still
  click if its worst blocks run ten times its median.
- `pnpm cold` reports the first few seconds, before anything has JIT-tiered up —
  the window that `pnpm bench` and `pnpm blocks` render past before they start
  timing.
- `pnpm soak` plays a bar, then leaves the board ringing out for several minutes
  while it prints what each stage costs. Watch for any column that climbs over
  time: an envelope that decays geometrically can reach a denormal number
  instead of zero, and the stage can then cost twenty times what it did.
  `pnpm denormal` sweeps the whole graph for exactly that; it takes minutes, so
  `pnpm test` skips it.
- `pnpm ab <ref>` compares the working tree against a git ref as a paired run on
  the same machine, since two renders of identical code on a shared machine can
  otherwise report a double-digit percentage difference from nothing but
  scheduling noise.

`pnpm bench`, `blocks`, `cold`, `soak` and `ab` render the chain offline in
node, with no panel. The panel has a separate deadline of sixty frames a second,
and eight widgets write to the DOM from the meter without a React render:

- `pnpm panel` builds the app, opens it in a real Chrome with the audio running,
  and reports what the main thread spends per frame and where: javascript,
  style, layout, paint, compositing — plus how many frames went undrawn, and how
  long React held the thread at a stretch. `pnpm panel 12 morph` measures a
  board travelling, `pnpm panel 8 drag` a slider under a hand,
  `pnpm panel 12 hover` a pointer resting on control after control, and
  `pnpm panel 10 open` stage after stage off the map, which is the one that
  costs. Needs Chrome, which it looks for on PATH, then in `/Applications`, then
  at `BENDER_CHROME`.

  The report shows how much time and where in the frame, and cannot attribute it
  to code. Set `BENDER_DUMP` to a path and the script writes the sampled profile
  there; open it in devtools' performance panel, which is how the forced layout
  inside the stage-open commit was found.

  Read the `layout` column. No control on the panel changes the size of
  anything, so layout should sit near zero. Layout that stays high means
  something writes the DOM every frame whether or not it has anything new to
  write. That is how the per-frame write described in
  [optimizations.md](optimizations.md#the-panel-is-not-what-costs-one-write-a-frame-was)
  was found, and it was worth half the main thread.

- `pnpm cpu` runs the built app in Chrome and reports the CPU time of the audio
  worklet thread, the renderer's main thread and compositor, and the GPU
  process. It also reports wakeups a second and the underruns Chrome counted in
  `AudioContext.playbackStats`. `pnpm cpu 20 idle` measures the stock board with
  nothing playing, `stock` the stock board playing, `heavy` the heavy board with
  a tape threaded, and `hidden` the heavy board in a background tab. Linux only,
  since it reads `/proc`.

  Battery power moves every column, so compare two builds in one sitting:
  `BENDER_BUILT=dirA,dirB BENDER_ROUNDS=4` alternates prebuilt sites. The `fps`
  column reads 0 when Chrome is not drawing the page, which happens with the
  display off, and the drawing columns mean nothing in that run.

[optimizations.md](optimizations.md) explains what those numbers mean and which
to trust. [dataflow.md](dataflow.md) shows how a block gets rendered across the
main and audio threads.

## Generated docs and audit sweeps

- `pnpm diagram` regenerates the signal path diagram (`img/chain-*.svg`) from
  the same layout code the panel draws with. Run it after any change to
  `src/ui/chain-map.ts`.
- `pnpm dash` regenerates the screenshot in the why-sign-in card
  (`public/dashboard.jpg`): it starts the dev server, opens the home page in a
  headless Chrome, and calls `showHome` with voices invented in the script, so
  the shot needs no account and contacts only localhost. The dev server exposes
  `showHome` on the page. Needs a Chrome (on PATH, in `/Applications`, or at
  `BENDER_CHROME`) and ImageMagick's `magick`. Regenerate it on Linux, because
  the shot shows live text in `system-ui` and the font the stack resolves to
  sets the box widths.
- `pnpm og` regenerates the share image (`public/og.jpg`) from the landing
  page's pile, using the same Chrome and `magick`; run it after changing
  `src/site/pile.ts`.

- `demos.json` lists the demos. `pnpm demos` writes them into the README, and
  the build fails if that block is stale. `pnpm reel` renders the ones marked
  `showcase` into `public/demos/*.mp3` for the landing page's Demos section,
  offline and through the worklet's board. The build runs it too, so the clips
  stay out of git; it needs `ffmpeg` on PATH.

- The bus drawing in [BENDS.md](BENDS.md#where-the-buses-run) is
  `docs/img/buses.dot`, re-rendered in the same commit as any edit:
  `dot -Tsvg docs/img/buses.dot -o docs/img/buses.svg`. No check compares the
  SVG with the DOT file, for the reasons [dataflow.md](dataflow.md) gives for
  its diagram.
- `pnpm features` regenerates [features.md](features.md) from the app's control
  tables and tooltips. A test fails the build if the committed file falls
  behind, so run it after changing a control, a preset, or a ROM.
- `pnpm knife` sweeps every wire and fault on every bus and reports which ones
  are audible.
- `pnpm spectrum` sweeps the same space and reports what each one _sounds_ like:
  level, spectral centroid, flatness — 0 for a sine, 1 for noise — and where the
  power sat across five bands. Each bus ends with a `reach` line giving how much
  of the spectrum that chip's whole bend space covers. A row of faults that all
  fall in the same band means the chip's bends differ from each other by less
  than the panel implies. A chip that can be more than one machine gets a
  `reach` line per machine — Glint is swept again with its percussion bank on
  and again with an effect running, because the same knife gives a different
  reach in each. `pnpm spectrum fm` does one chip and `pnpm spectrum cuts` the
  named cuts and the preset catalog; the whole sweep takes a few minutes.
- `pnpm audible` checks whether each branch of the kit's summing junction is
  connected at all, which `knife` and `spectrum` cannot. It takes each path out
  — one constant at a time, in a copy of `src` under the system temp dir, so
  nothing writes to the working tree — renders the board with and without it,
  and reports how far the take moved. `pnpm audible kick` does the paths named
  for one voice.

  Of the report's two columns, `rms` is how far the whole take moved, which is
  the number `knife` reports; `peak` is the tallest sample of the difference
  against the tallest sample of the take. A percussive path is small in `rms`
  and large in `peak`, and that asymmetry is expected — the kick's coupling cap
  moves the take's rms by 0.7% and its peak by 8.8%, because a click is three
  milliseconds long and a render is a second. Measured over a whole take, a
  branch that supplies the attack and a branch that is not soldered in look the
  same by `rms`, and that is how the kick's coupling path stayed dead for a long
  time without any test noticing.

  The script reports anything under a thousandth on both columns as a path
  nothing hears, and anything under a fiftieth as one barely there. The second
  tier is the more useful, because a path can be connected, and so pass any test
  that asks whether it does _something_, while contributing too little to be
  what it was built to do. Add an entry whenever you add a branch to the output,
  and fix the `find` string if a rename breaks it; the script reports a
  substitution that matches nothing.

## Releases

`pnpm pat`, `pnpm min` and `pnpm maj` cut a patch, minor or major release.
