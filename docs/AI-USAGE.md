# AI usage

bender publishes `window.bender`, a JavaScript API that a browsing agent calls
to read and change the board, write melodies and drum patterns, and measure the
sound. The app page also carries a `<meta name="ai-instructions">` tag and logs
a console message, and both tell the agent to read `bender.help` first.
`bender.help` documents every call.

## Claude in Chrome

1. Open https://cmdcolin.github.io/bender/app/ in Chrome.
2. Open the Claude side panel and describe a sound.

The extension's JavaScript tool runs code in the page, where `window.bender` is
defined, so this setup needs no install and no configuration. Example requests:

- load the dying toy preset, then starve the rail until the chip reboots
- write an eight-step melody in A minor into the memory, with a
  four-on-the-floor kit under it
- find the controls that make the delay feed back, and raise them over five
  seconds

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
| `bender.summary()`                     | audio state, what is playing, the preset and the undo depth                            |
| `bender.board()`                       | changed controls as `key = value`, the melody and drum pattern as text, and a link     |
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
  tool send real input events. A Chrome started with
  `--autoplay-policy=no-user-gesture-required` needs no click.
- `bender.set` with `seconds` glides on animation frames, and Chrome pauses
  animation frames in a hidden tab. Without `seconds`, `set` posts the new
  values to the audio worklet immediately, in any tab.
- A screenshot shows the panel and the scope. `bender.listen` measures the sound
  from the meters.
- The API covers the controls, presets, sequencers and meters. Sign-in, saved
  voices, recording, the microphone and sample loading have no API calls.

## Testing

`src/ui/agentApi.test.ts` runs the API in jsdom. `pnpm agent` serves the app,
opens it in headless Chrome, starts audio with a synthesized gesture, writes a
tune and a kit, and checks the readings from `bender.listen`, including that the
board goes quiet after `bender.stop()`. The script exits non-zero when a check
fails.
