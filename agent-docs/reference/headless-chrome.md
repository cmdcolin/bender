---
name: headless-chrome
description:
  Driving the built or dev app in headless Chrome from a script, and the traps
  that make a check pass or fail for the wrong reason. Read before a screenshot,
  a layout probe or a browser check of worklet code.
---

# Headless Chrome

Prefer a jsdom test (`src/ui/testDom.ts`, see `docs/DEVELOPMENT.md`): it lands
in the suite. Use Chrome for what jsdom cannot show: layout, paint, popovers,
pointer capture, the cascade and the audio worklet.

## Serving

- `scripts/serve.ts` (`serveDev`, `buildAndPreview`) serves in-process, with the
  app at `/bender/app/`; `/` is a 404. `scripts/chrome.ts` has `chromePath`,
  `attach`, `until` and `APP_READY`. `scripts/readme-shots.ts`, `guide-shots.ts`
  and `diagram-shots.ts` are working models.
- `astro dev` and `astro preview` background themselves and hold a lock per
  checkout, so a second start prints "already running", and a second checkout's
  preview takes the next free port. Read the port from the start message and
  stop with `astro dev stop` or `astro preview stop` from the checkout that
  started it.
- Build outside `/tmp`: Astro renames across filesystems and fails with EXDEV.
- Vite refuses a `node_modules` symlinked from outside the root, so a worktree
  needs its own `CI=true pnpm install --offline`.

## Driving

- Launch with `--autoplay-policy=no-user-gesture-required`. Without audio the
  worklet posts no meter, and anything reading live state stays at defaults. "No
  meter messages" means the worklet died: read the page's `Log.entryAdded`
  events for the error. Run this check before landing worklet code.
- `#set=key:value,…` puts the board in a state before load, far faster than
  driving sliders.
- A door is an SVG `<a href="#…">`. Click it with a real mouse click at its
  `boundingBox()` centre, or dispatch a click with `cancelable: true`; a plain
  synthetic click follows the href, replaces the hash and resets the board to
  stock.
- To open a stage, set `sessionStorage` `bender.openStage` and reload.
- `window.bender.board()` lists changed controls and the drum rows;
  `await window.bender.listen(3000)` reports peak, limiter, rail, reboots,
  sources and hits, the closest thing to listening.
- Load a tape without archive.org by dispatching `dragover` then `drop` with a
  `DataTransfer` holding a generated WAV on
  `document.querySelector('main').parentElement`; `document.body` sits above
  React's root. The reel draws once a meter posts `sampleSecs`, about 3.5 s.
- Headless Chrome reports `hover: none`. To see hover-only UI, launch with
  `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4`
  and move the pointer with `Input.dispatchMouseEvent`.
- Phone checks: a tall viewport (375×2400, `isMobile`, `hasTouch`) and no
  scrolling before a tap. After `scrollIntoView` under mobile emulation, taps
  land rows away from their target.

## Reading the result

- Screenshot with `page.screenshot({ clip })` around the element's box; an
  element screenshot drops the page background, so light text looks dark.
- jsdom runs no CSS `composes`: a dangling one passed every test and broke only
  the dev server. After moving CSS classes, load the app in Chrome.
- The profile keeps localStorage between runs, and `random` rolls differ per
  run, so compare two builds with a named preset.

## The machine

- Kill Chrome in a `finally`. A script that threw before its kill left Chromes
  playing bender for hours, and the heavy board's p99 block time read 2.49 ms
  where it is about 1 ms. Before a timing run, check `ps aux | grep headless`.
- `/tmp` is a per-user tmpfs with a quota. Stale Chrome profiles fill it and the
  error reads EDQUOT, and Chrome's origin-private file system there fails every
  write, so the recorder reports "the take was not saved". Put a headed
  profile's `--user-data-dir` on the home disk, and run `pnpm guide-shots` with
  `TMPDIR` on the home disk.
