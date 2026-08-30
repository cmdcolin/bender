# Development

```sh
pnpm install
pnpm dev
```

## Testing

`pnpm test` runs the DSP test suite, including a torture test that pins every
feedback path past unity at once and asserts nothing non-finite, and nothing
past the limiter, ever leaves the chain. It also runs the panel in jsdom, where
what's under test is the sentences the panel generates rather than audio — that
a fold counts the rows underneath it correctly, that loading a ROM lands in the
undo history, that a drag anywhere on the window counts as a drag. The engine
reaches for an `AudioContext` on the way up and gets a silent one back; see
`src/ui/testDom.ts`.

## Performance

The worklet gets 2.7 ms to fill 2.7 ms of audio, 375 times a second. Miss the
deadline once and a buffer goes out unfilled, which is an audible click.

- `pnpm bench` renders offline and reports what the chain costs per block, stage
  by stage. A board with everything patched sits near 9% of one core; the board
  as it boots sits near 1%. `pnpm bench stock` renders just that second case.
- `pnpm blocks` reports the distribution of block costs rather than the mean,
  since the mean isn't what causes glitches — a board averaging a tenth of its
  budget can still click if its worst blocks run ten times its median.
- `pnpm cold` reports the first few seconds, before anything has JIT-tiered up —
  the window both of the above render past before they start timing.
- `pnpm soak` plays a bar, then leaves the board ringing out for several minutes
  while it prints what each stage costs. The number to watch is whether any
  column climbs over time: an envelope that decays geometrically can arrive at a
  denormal number instead of zero, and once it does the stage can cost twenty
  times what it did. `denormal.test.ts` sweeps the whole graph for exactly that.
- `pnpm ab <ref>` compares the working tree against a git ref as a paired run on
  the same machine, since two renders of identical code on a shared machine can
  otherwise report a double-digit percentage difference from nothing but
  scheduling noise.

What those numbers mean, and which of them can be trusted, is
[optimizations.md](optimizations.md). How a block actually gets rendered across
the main and audio threads is [dataflow.md](dataflow.md).

## Keeping the generated docs honest

- `pnpm diagram` regenerates the signal path diagram (`img/chain-*.svg`) from
  the same layout code the panel draws with. Run it after any change to
  `src/ui/chain-map.ts`.
- `pnpm figure` regenerates the README's screenshot
  (`docs/img/panel-callout.jpg`): it starts the dev server, opens the app in a
  headless Chrome on a board with the bends, the tape and three patch wires
  turned on, and composes the panel enlarged beside the whole window with the
  panel ringed in red. It asks the page where the panel is rather than carrying
  crop coordinates, so a layout change moves the box on its own. Wants
  `google-chrome` (or `chromium`, or `BENDER_CHROME`) and ImageMagick's `magick`
  on PATH.
- `pnpm features` regenerates [features.md](features.md) from the app's own
  control tables and tooltips. Run it after changing a control, a preset, or a
  ROM — a test fails the build if the committed file falls behind.
- `pnpm knife` sweeps every wire and fault on all five buses and reports which
  ones are actually audible.
- `pnpm spectrum` sweeps the same space and reports what each one _sounds_ like:
  level, spectral centroid, flatness — 0 for a sine, 1 for noise — and where the
  power sat across five bands. Each bus ends with a `reach` line, which is the
  one worth reading: how much of the spectrum that chip's whole bend space
  covers. A row of faults that all land in the same band is a chip whose bends
  differ from each other by less than the panel implies. `pnpm spectrum fm` does
  one chip and `pnpm spectrum cuts` the named cuts and the preset catalog. The
  whole sweep takes a few minutes.

## Releases

`pnpm pat`, `pnpm min` and `pnpm maj` cut a patch, minor or major release.
