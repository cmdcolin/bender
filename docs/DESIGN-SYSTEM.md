# Design system

- **Tokens:** `src/tokens.css` (neutrals, borders, type, shared with
  videoskillet) and `src/theme.css` (bender's accent, control sizes, focus ring)
- **Buttons and dropdowns:** `src/ui/button.module.css`, where every look and
  state a control can take is a class
- **Check:** `pnpm controls` lists every button and select on the panel by
  rendered height; `src/ui/buttonKinds.test.ts` fails on a module that restyles
  a kind it composes

## Sizes

| Token           | Mouse | Touch | Used by                         |
| --------------- | ----- | ----- | ------------------------------- |
| `--ctl-h`       | 22px  | 32px  | action, cap, select, menu items |
| `--ctl-h-sm`    | 18px  | 32px  | chip, pick, selectSm            |
| `--gap-ctl`     | 6px   | 8px   | a row of action-height controls |
| `--gap-ctl-sm`  | 3px   | 6px   | a row of chips or picks         |
| `--radius`      | 3px   | 3px   | controls and panels             |
| `--radius-pill` | 999px | 999px | chips                           |

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
