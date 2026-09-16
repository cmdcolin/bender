# AI usage

bender publishes `window.bender`, a JavaScript API for the page. A browsing
agent such as Claude in Chrome calls it to read and change the board, write
melodies and drum patterns, and measure the sound. The app page carries a
`<meta name="ai-instructions">` tag and logs a console message, and both tell
the agent to read `bender.help` first. `bender.help` gives an overview and names
four topics, and `bender.guide(topic)` documents the calls in each.

![bender in Chrome with the Claude side panel open on the right. The panel shows the request "This page is bender, a circuit-bent toy keyboard, and it has a scripting API on window.bender. Load the dying toy preset, write a C minor arpeggio into the melody memory with a kick on every beat, play both, and tell me what bender.listen hears", followed by the steps Claude took: capturing the page, clicking, reading page text. On the left, the Toy keyboard section is open with its tune set to yours and the notes of the arpeggio in the piano roll.](img/claude-in-chrome.jpg)

The screenshot shows Claude in Chrome with Sonnet 5 in the side panel, partway
through a request. It has loaded the dying toy preset and is entering a C minor
arpeggio into the melody memory. The bar across the top of the page and the Stop
Claude button show that the extension is controlling the tab.

## Claude in Chrome

1. Install the
   [Claude in Chrome](https://chromewebstore.google.com/detail/fcoeoabgfenejglbffodgkkbkcdhcgfn)
   extension and sign in.
2. Open https://cmdcolin.github.io/bender/app/.
3. Click the Claude icon in the toolbar to open the side panel.
4. Describe a sound, and mention `window.bender` so Claude knows the API exists.

The extension can run JavaScript in the page, where `window.bender` is defined,
so bender needs no setup beyond the extension. Example requests:

- load the dying toy preset, then starve the rail until the chip reboots
- write an eight-step melody in A minor into the memory, with a
  four-on-the-floor kit under it
- find the controls that make the delay feed back, and raise them over five
  seconds

Claude takes one of two routes. In the second eval run described under
[Testing](#testing), where the prompt told Claude to evaluate `bender.help`,
every session read the help and a guide topic with JavaScript, then made its
changes with calls such as `bender.load`, `bender.tune` and `bender.set`. In the
side-panel session in the screenshot, where the request only mentioned
`window.bender`, Claude loaded the preset by clicking its chip and entered the
notes by clicking cells in the piano roll. Both routes change the same controls,
and the clicking route takes many more steps. A request that asks Claude to run
`bender.help` with JavaScript points it at the API route.

## Claude Code

The chrome-devtools-mcp server connects Claude Code to Chrome over the DevTools
protocol, and its `evaluate_script` tool calls `window.bender` in the page:

```sh
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest
```

Then ask Claude Code to open the public URL, or
`http://localhost:4321/bender/app/` while `pnpm dev` runs.

## The API

| Call                                   | Effect                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `bender.guide(topic)`                  | the calls for `read`, `change`, `music` or `sound`                                     |
| `bender.summary()`                     | audio state, what is playing, the preset and the undo depth                            |
| `bender.board()`                       | changed controls as `key = value`, and the melody and drum pattern as text             |
| `bender.find(words)`                   | ranked search over control keys, labels, groups and help text                          |
| `bender.describe(key)`                 | one control's range, unit, choices and help                                            |
| `bender.set(values, seconds?)`         | sets controls and returns `{ applied, adjusted, unknown, failed }`                     |
| `bender.presets(search?)`              | lists presets                                                                          |
| `bender.load(name, seconds?)`          | loads a preset                                                                         |
| `bender.reset(seconds?)`               | restores the defaults                                                                  |
| `bender.undo()`, `bender.redo()`       | steps through the history, which gains one step per call that changes the board        |
| `bender.tune(text)`                    | writes the melody memory from note names, such as `'C4 E4 G4 ~ . C5'`                  |
| `bender.drums(rows)`                   | writes drum rows from step text, such as `{ kick: 'x...x...' }`                        |
| `bender.start()`                       | starts audio, or reports that the page needs a click first                             |
| `bender.play(which?)`, `bender.stop()` | starts and stops the melody and drum sequencers                                        |
| `bender.listen(ms)`                    | peak level, limiter gain reduction, supply rail, reboots, sources, notes and drum hits |
| `bender.link()`                        | a `#set=` URL for the current board                                                    |

## Limitations

- The browser keeps audio suspended until the page receives a click or key
  press. The Claude in Chrome click tool and the chrome-devtools-mcp `click`
  tool send real input events. In our evals, extension clicks in the middle of
  the page sometimes left audio suspended, and the agent clicked again near the
  top of the page. A Chrome started with
  `--autoplay-policy=no-user-gesture-required` needs no click.
- `bender.set` with `seconds` glides on animation frames, and Chrome pauses
  animation frames in a hidden tab. Without `seconds`, `set` posts the new
  values to the audio worklet immediately, in any tab.
- A screenshot shows the panel and the scope. `bender.listen` measures the sound
  from the meters.
- The Claude in Chrome JavaScript tool cuts a returned string at 1000 characters
  and replaces some longer strings with `[BLOCKED: Cookie/query string data]`.
  The help, each guide topic and each result row stay under that length. A link
  to a board with a long melody can exceed it.
- The API covers the controls, presets, sequencers and meters. Sign-in, saved
  voices, recording, the microphone and sample loading have no API calls.

## Testing

`src/ui/agentApi.test.ts` runs the API in jsdom. `pnpm agent` serves the app,
opens it in headless Chrome, starts audio with a synthesized gesture, writes a
tune and a kit, and checks the readings from `bender.listen`, including that the
board goes quiet after `bender.stop()`. The script exits non-zero when a check
fails.

`pnpm agent:eval` builds and serves the site, then runs one `claude -p --chrome`
session per task in `scripts/agent-eval.ts`. Each session opens the app in a tab
of the Chrome that runs the Claude extension. A script injected into the served
page reads `window.bender` in that tab to grade the task, then stops the audio
and blanks the tab. The script prints tool calls, clicks, blocked and truncated
results, cost and time per task. The extension has to be signed in to the same
claude.ai account as `claude`, or `list_connected_browsers` returns an empty
list.

The first eval run passed 1 of 4 tasks. The extension blocked the original
3104-character `bender.help`, so every agent read it in slices, one agent raised
the wrong control, and the grader read the wrong tab in two tasks. After those
fixes the second run passed 4 of 4, with 44 JavaScript calls against 71, in 315
s against 533 s. `agent-docs/agent-interface.md` has the details.
