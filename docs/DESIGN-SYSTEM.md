# Design system

- **Tokens:** `src/tokens.css`, shared with videoskillet (neutrals, borders,
  type, spacing, corners), and `src/theme.css` (bender's accent, control
  heights, row gaps, focus ring)
- **Buttons and dropdowns:** `src/ui/button.module.css`, where every look and
  state a control can take is a class
- **Check:** `pnpm controls` lists every button and select on the panel by
  rendered height; `src/ui/buttonKinds.test.ts` fails on a module that restyles
  a kind it composes

## Sizes

| Token           | Mouse | Touch | Used by                         | Defined in |
| --------------- | ----- | ----- | ------------------------------- | ---------- |
| `--ctl-h`       | 22px  | 32px  | action, cap, select, menu items | theme.css  |
| `--ctl-h-sm`    | 18px  | 32px  | chip, pick, selectSm            | theme.css  |
| `--gap-ctl`     | 6px   | 8px   | a row of action-height controls | theme.css  |
| `--gap-ctl-sm`  | 4px   | 6px   | a row of chips or picks         | theme.css  |
| `--ctl-radius`  | 3px   | 3px   | controls and panels             | tokens.css |
| `--pill-radius` | 999px | 999px | chips                           | tokens.css |

## Spacing

`tokens.css` holds one scale for gaps, padding and margins, in px:

| `--space-2xs` | `--space-xs` | `--space-sm` | `--space-md` | `--space-lg` | `--space-xl` | `--space-2xl` |
| ------------- | ------------ | ------------ | ------------ | ------------ | ------------ | ------------- |
| 2px           | 4px          | 6px          | 8px          | 12px         | 16px         | 24px          |

- Pick the nearest step. A 1px hairline, a negative bleed that cancels a
  parent's padding, and an instrument case's drawn geometry stay literal.
- A dialog pads its content by `--space-lg`.

The kinds set `line-height: 1.2` and no vertical padding, so the token alone
decides a control's height whatever font the system supplies.

## Kinds

- **action:** a filled verb (random, mutate, record wav). Variants: `actionOn`
  (running), `actionHeld` (under a hand), `actionOff`, `actionDanger`,
  `actionLive`, `actionQuiet`, `actionLoud(On)`, `actionWaiting`,
  `actionPicked`, and the split pair `splitMain` / `splitCaret(On)`
- **chip:** one quiet item among many, pill-shaped (cuts, rolls). Variants:
  `chipOn`, `chipQuiet`, `chipOff`, `chipDanger`; `.square` squares the corners
- **pick:** one of a set where exactly one is on (ROMs, slider choices).
  Variants: `pickOn`, `pickLg(On)` for presets, `pickEmpty`, `pickRecOn` /
  `pickRecIdle` for a pattern's record switch
- **cap:** a switch on an instrument's case. The case sets `--switch`,
  `--case-edge` and `--cap-lit`. Variants: `capOn`, `capIdle`
- **select / selectSm:** a dropdown at the action or chip height. Variant:
  `selectSmOn`

## Rules

- Compose a kind or variant and set nothing beyond layout (margin, position,
  width, `font-family`). A module that sets a property the kind sets loses, in
  the dev server and in the production build alike, because `button.module.css`
  lands later in the bundle.
- A new look goes in `button.module.css` as a variant, next to the kind it
  extends.
- Colours come from tokens. A literal colour belongs to an instrument's case
  (the toy's plastic, the FM board's green), set as a variable on that case.
- The `:focus-visible` rule in theme.css outlines every focused control. A
  module with its own focus style turns that outline off in its own rule.
