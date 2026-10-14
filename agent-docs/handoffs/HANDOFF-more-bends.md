# More bends — handoff

Main at `69faaa4`. Three rounds of bends landed on 2026-10-14 (kit, FM chip,
toy/ring/verb/echo); `git log --oneline 91f7957..69faaa4` lists them. The owner
wants more of them and does not want to arbitrate design calls: pick the wilder
option and record why in the commit and the idea doc.

## Next round, by source

- **FM chip:** `agent-docs/ideas/collections/fm-bends.md`, "What is left,
  ranked": rhythm at full width first, then a knife on the exp table's address,
  then a mono bodge wire. "Compositions to try" lists four setups no preset
  surfaces yet.
- **Kit and ring mod:** `drum-bends.md` and `ring-mod.md` have no numbered
  candidates left. Each needs a fresh survey written the same way before
  building.
- **Sources and pedals with no idea doc:** `chaosOsc`, `monoSynth`/`monoVoice`,
  `pcmKeys`/`pcmRom`, `sampler`, `noise`, `glitchBuf`, `screech`, `shifter`,
  `ensemble`, `comb`, `crusher`, `stompbox`, `tape`, `tapeDelay`. Survey one,
  write `ideas/collections/<stage>-bends.md` ranked by `pnpm knife` /
  `pnpm spectrum`, then build its top few.
- **Bigger, waiting on a call:** `ideas/waiting-on-a-call/knob-automation.md`.

## How the rounds ran

- One agent per stage file, each in its own worktree (`isolation: "worktree"`),
  spawned from the primary checkout.
- Brief each agent with: defaults bit-identical, never regenerate a golden,
  append to `URL_KEY_ORDER` and `DEST`, `pnpm features` after slider edits,
  `pnpm bend-ends` at the end, a test that fails with the bend off, and a named
  cut or preset per bend at its craziest.
- Land one branch at a time. Parallel branches all append at the same places:
  `DEST`/`N_DEST` in `src/dsp/modbus.ts`, `URL_KEY_ORDER`, the lane lists in
  `src/ui/controls/patch.ts`, `src/ui/chain-map.ts`, `src/ui/presets/patch.ts`
  and `table.ts` imports. Keep both sides, renumber the later `DEST` ids, keep
  the lane-name list in id order, and regenerate `docs/features.md` and
  `src/ui/bendEnds.ts` rather than merging them.

## Traps

- Three agents at once push the load average past 70. Full `pnpm test` runs then
  time out at 40 s in `fmEffects`, `tape`, `torture`, `denormal` and
  `presets/*`; rerun those files alone before calling one broken.
  `pnpm bend-ends` needs more than ten minutes under that load.
- `pnpm ab` ran only under load, so the new bends' CPU cost is unmeasured. Rerun
  `pnpm ab main` against `91f7957` on a quiet machine.
- The random dealer slams only what `drivable()` in
  `src/ui/presets/scenarios.ts` passes: no choice controls, and nothing whose
  `needs` is unmet. Selector bends (`drumLoop`, `drumRef`, `fmDacSlot`,
  `fmAlloc`, `fmColdBoot`, `fmAdder`) are reachable only through their named
  cuts and presets.

## Loose ends

- The worktree `.claude/worktrees/agent-ab8c381887f4dff5b` still exists. Its
  commits landed by cherry-pick under new hashes, so `git branch -d` refuses; it
  holds nothing main lacks.
