# Design system

- **Tokens:** `skillet-shared/tokens.css`, shared with videoskillet (neutrals,
  borders, type, spacing, corners, shadows, scrim), and `src/theme.css`
  (bender's accent, control heights, row gaps, card corners)
- **Element defaults:** `skillet-shared/base.css`, shared with videoskillet
  (border-box, reduced motion, control fonts, pointer cursor, focus ring)
- **Buttons and dropdowns:** `src/ui/button.module.css`, where every look and
  state a control can take is a class
- **Dialogs:** `src/ui/components/Dialog.tsx` opens a native `<dialog>` as a
  modal; `src/ui/components/dialog.module.css` holds the card, its head, title,
  close chip, prose line and link
- **Check:** `pnpm controls` lists every button and select on the panel by
  rendered height; `src/ui/buttonKinds.test.ts` fails on a module that restyles
  a kind it composes

## Sizes

| Token           | Mouse | Touch | Used by                         | Defined in |
| --------------- | ----- | ----- | ------------------------------- | ---------- |
| `--ctl-h`       | 22px  | 32px  | action, outline, cap, select    | theme.css  |
| `--ctl-h-sm`    | 18px  | 32px  | chip, pick, selectSm            | theme.css  |
| `--gap-ctl`     | 6px   | 8px   | a row of action-height controls | theme.css  |
| `--gap-ctl-sm`  | 4px   | 6px   | a row of chips or picks         | theme.css  |
| `--ctl-radius`  | 3px   | 3px   | controls and panels             | tokens.css |
| `--pill-radius` | 999px | 999px | chips                           | tokens.css |
| `--card-radius` | 6px   | 6px   | dialogs                         | theme.css  |

## Spacing

`tokens.css` holds one scale for gaps, padding and margins, in px:

| `--space-2xs` | `--space-xs` | `--space-sm` | `--space-md` | `--space-lg` | `--space-xl` | `--space-2xl` |
| ------------- | ------------ | ------------ | ------------ | ------------ | ------------ | ------------- |
| 2px           | 4px          | 6px          | 8px          | 12px         | 16px         | 24px          |

- Pick the nearest step. A 1px hairline, a negative bleed that cancels a
  parent's padding, and an instrument case's drawn geometry stay literal.
- A dialog pads its content by `--space-lg`.

The kinds set `line-height: 1.2` and no vertical padding, so the token alone
sets a control's height whatever font the system supplies.

## Depth

- `--shadow-modal` under a dialog, `--shadow-pop` under a floating card or menu
- `--scrim` behind a modal
- `--caps-track` spaces a dialog or card title
- `--screen` fills a scope, meter or tape window; `--fs-2xs` sets a diagram
  label

## Kinds

- **action:** a filled verb (random, mutate, record wav). Variants: `actionOn`
  (running), `actionQuiet`, `actionPicked`, and the bend board's two-row keys
  `actionKey`, `actionKeyHeld`, `actionKeyFixed`, `actionKeyQuiet`
- **outline:** header chrome in a faint outline at the body size. Variants:
  `outlineOn`, `outlineWaiting`, `outlineDanger`, `outlineIcon`,
  `outlineSelect`, and the split pair `splitMain` / `splitCaret(On)`. `outline`,
  `outlineOn` and `outlineIcon` are shared with videoskillet's `ui.module.css`
  through the `outline-kind` and `outline-states` sync regions
- **chip:** one quiet item among many, pill-shaped (cuts, rolls). Variants:
  `chipOn`, `chipOff`, `chipDanger`; `.square` squares the corners
- **pick:** one of a set where exactly one is on (ROMs, slider choices).
  Variants: `pickOn`, `pickLg(On)` for presets, `pickJoined(On)` for a
  ToggleButtonGroup, `pickEmpty`, `pickRecOn` / `pickRecIdle` for a pattern's
  record switch
- **cap:** a switch on an instrument's case. The case sets `--switch`,
  `--switch-hover`, `--case-edge` and `--cap-lit`. Variants: `capOn`,
  `capSnug(On)` for a glyph, `capJoined(On)`, `capIdle`
- **select / selectSm:** a dropdown at the action or chip height. Variant:
  `selectSmOn`
- **quiet:** a borderless text button (a "look at it in silence", a row's
  shuffle). Variants: `quietDotted` for an underlined word, `quietX` for a ×
  glyph, `quietXDanger` for a × that removes. On touch a pseudo-element
  stretches the target to `--ctl-h` without moving anything
- **field:** a text input at the action height, on the page's black. Variants:
  `fieldSm` at the chip height, `fieldDeck` level with a row of deck keys
- **deck:** a fixed-size tape-deck key, glyph over legend. Variants: `deckOn`,
  `deckRed(On)`, `deckWord(On)`, `deckRow(On)`

## Rules

- Compose a kind or variant and set nothing beyond layout (margin, position,
  width, `font-family`). A module that sets a property the kind sets loses, in
  the dev server and in the production build alike, because `button.module.css`
  comes later in the bundle.
- A new look goes in `button.module.css` as a variant, next to the kind it
  extends.
- Hover looks sit under `@media (hover: hover)`, so a tapped control on a phone
  does not stay lit.
- Colours come from tokens. A literal colour belongs to an instrument's case
  (the toy's plastic, the FM board's green), set as a variable on that case.
- The `:focus-visible` rule in base.css outlines every focused control. A module
  that sets a different focus style must turn that outline off in its rule.
- A keyboard case is the size container named `case`, and its decorations query
  `@container case`. The deck inside it is an unnamed container of its own.
