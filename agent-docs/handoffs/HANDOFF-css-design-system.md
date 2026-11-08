# CSS and the shared design system: handoff

A 2026-11-08 audit of the CSS in bender and videoskillet, and the design-system
work that followed. The owner has said to keep going on whatever is worth it,
and to ask before anything that changes how one app's main buttons look.

## Where the work is

- bender: `git log --oneline 73203a92^..3bc41aba`
- videoskillet: `c7857332`, `951439c3`, `cfae5de7`, `eb0e9090`, and `5813d88a`
  (oxlint 1.92, so type-aware lint and the pre-commit hook run again; the four
  before it went in with `--no-verify`)
- skillet-shared: `v0.7.0` (`css/base.css`, depth tokens), `v0.7.1` (`--fs-2xs`)

Read these first:

- `docs/DESIGN-SYSTEM.md`: the kinds, tokens and rules as they stand
- `docs/CROSS_REPO_SYNC.md`: markers and `CROSS_REPO_SYNC_SIBLING` for checking
  against a sibling worktree
- `src/ui/button.module.css` and `src/ui/buttonKinds.test.ts`
- `src/ui/components/Dialog.tsx` and `dialog.module.css`
- `src/theme.css`, and `css/base.css` and `src/tokens.css` in
  `~/src/skillet-shared`
- videoskillet `src/ui/ui.module.css`: the `@layer prim` model, and the
  `outline-kind` region inside it

## Checking a CSS change

Every change was checked by diffing the box of every element before and after,
in headless browsers, with the module hash stripped from class names. The
scripts lived in a session scratchpad and are gone; rebuild from:

- bender: `serveDev(port, root)` in `scripts/serve.ts`, `attach` and
  `chromePath` in `scripts/chrome.ts`. `Emulation.setTouchEmulationEnabled`
  makes `(pointer: coarse)` match.
- videoskillet: `startDevServer` in `scripts/devserver.mjs` and `launchFirefox`
  in `scripts/browser.mjs` (headless works, WebGPU included). Probe `/app/`
  collapsed and after pressing "all settings", plus `/`, `/guide/` and `/cam/`.
  `/cam/` picks a random look per load, so its boxes differ run to run.
- `getBoundingClientRect` skips pseudo-elements. A change to `box-sizing` or to
  a `::before`/`::after` needs a separate look at the pseudo-element rules.

## Waiting on the owner

- Sharing bender's `action` with videoskillet's `filled` / `btn`. The two differ
  in type size, ink and padding, so one app's main buttons change.
- Syncing `Dialog.tsx` with videoskillet's. videoskillet's renders the title row
  and close itself; bender's leaves the head to each dialog.

## Next, in rough order

- `--ctl-on-bg` and `--alarm` mean different things in the two apps (see each
  `src/theme.css`). The synced `range-track` and `diagram-core` regions already
  read them. Settle the names before the next shared rule reads either.
- `#55555f`, the off ink, is a literal inside the synced `outline-kind` and
  `range-track` regions: a candidate shared token.
- `buttonKinds.test.ts` only checks rules whose selector is one plain class.
  `ToggleButtonGroup.module.css` `.large > button` restyles a composed kind
  through a descendant selector and passes.

## Reported by the audit, not yet checked or fixed

- `DrumGrid.module.css`: `.cellGhost` and `.under` fight over `box-shadow` on a
  ghost step under the playhead
- `Slider.module.css`: `.modFull` (a span) composes `.action`, whose hover lacks
  `:not(:disabled)`, so the dead label lights; `.list` / `.listOn` compose
  `pick` and patch its height where `selectSm(On)` fits
- `TuneRoll.module.css` `.len` and `StepLanes.module.css` `.len` stay about 20px
  on touch beside 32px chips
- `BusDiagram.module.css` `.ribbon` and `MicPatch.module.css` `.jack` turn the
  focus outline off with only a faint cue left
- `src/pocket/pocket.module.css` `.sheet` uses `64vh`
- `src/site/page-shell.css` (synced) and `home.css` pad both sides with
  `env(safe-area-inset-left)`
- Buttons drawn without a kind: Slider `.action`, SlotRack `.loose` / `.arrow`,
  Shelf `.part`, Pedals `.more` / `.selector`, SavedVoices `.rowBtn`,
  StartOverlay `.start`
- Duplicated looks: DrumKit's case and `:where(.body)` in Keybed; JackCap and
  MicJacks items and Menu's `.item`; KeysDialog's and BendKeys' 44-column grid;
  Recorder `.counter` and PhraseBox `.held` (one LED readout)
- Literal colours outside a case variable: Keys reads `--decal-pink`,
  `--decal-yellow` and `--decal-cyan`, which nothing sets; DrumKit cells,
  MonoKeys, GateCables `.modPlate`, Slider `.defmark`; the accent as an `rgba`
  literal in BodyPad and DrumKit
- videoskillet and the shared sheets: the why-card figure rules repeat in bender
  `src/site/home.css` and videoskillet `site/styles/landing.css`;
  `page-shell.css` overrides `footer.css`; videoskillet defines `--accent` in
  two sheets and keeps two video play overlays

## Unverified

- Nobody has seen any of it on a device. The touch reach of the `quiet` kind was
  measured under Chrome's touch emulation only.
- Parlor's window, Growler's knobs and Glint's header had never shown before
  `c4207d3e`; they now show on a case wider than 560px of content.
