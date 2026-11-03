import { attach, chromePath, sleep, until, APP_READY } from './chrome.ts'
import { serveDev } from './serve.ts'

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  readdirSync,
  readFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Records a real Claude session driving the real app in a real Chrome, with
// the app's sound and both windows in frame.
//
// Usage: pnpm agentreel [--out=DIR] [--model=sonnet] [--task=FILE]
//        [--seconds=N] [--display=:99] [--keep]
//   needs Xvfb, xterm, xdotool, ffmpeg, pw-cli, pw-record, google-chrome and a
//   logged-in `claude` on PATH. pnpm runs it in a systemd scope with a high
//   CPU weight, since other agents' builds starve Chrome and the grab.
//
// Xvfb is its own root window, so the grab holds only the two clients. Chrome
// plays into a null PipeWire sink of its own, which keeps the rest of the
// machine's sound out of the clip. chrome-devtools-mcp attaches to the Chrome
// started here, so the session's clicks land in the framed window.

const args = process.argv.slice(2)
const flag = (name: string, fallback: string) =>
  args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback

const outDir = flag('out', 'clips')
const model = flag('model', 'sonnet')
const freeDisplay = () => {
  const taken = (n: number) =>
    existsSync(`/tmp/.X11-unix/X${n}`) || existsSync(`/tmp/.X${n}-lock`)
  return `:${Array.from({ length: 80 }, (_, i) => 120 + i).find(n => !taken(n))}`
}
const display = flag('display', freeDisplay())
const capSecs = Number(flag('seconds', '300'))
const taskFile = flag('task', '')
const keep = args.includes('--keep')

const MCP = 'chrome-devtools-mcp@1.8.0'
const SINK = `agentreel-${process.pid}`
const PORT = 5212
const CDP_PORT = 9400 + (process.pid % 500)
const WIDTH = 1920
const HEIGHT = 1080
const CHROME_W = 1300
const TERM_W = WIDTH - CHROME_W
const FPS = 30

const TASK = `This browser tab is bender, a circuit-bent synth with a scripting API on window.bender. Work only in that browser tab. Evaluate bender.help in the page first.

Make a dark techno groove with a rolling bassline and start it playing. The kick and the bassline hold the tempo for the whole session: put Clatter and Growler on the bench supply (drumSupply and monoSupply), and leave the kit's tempo, the clock bends, ground bounce and the kit's event steps alone. Then bend everything riding on the groove, harder and harder: the chips' circuit bends, the effects, faults on the bus. Finish by pulling the bends back to the clean groove, and tell me what bender.listen hears then.

Keep every reply to a line or two.`

const die = (msg: string): never => {
  console.error(`agentreel: ${msg}`)
  process.exit(1)
}

for (const bin of [
  'Xvfb',
  'xterm',
  'xdotool',
  'ffmpeg',
  'pw-cli',
  'pw-record',
  'claude',
]) {
  if (spawnSync('which', [bin]).status !== 0) die(`${bin} is not on PATH`)
}

const task =
  taskFile === ''
    ? TASK
    : (await import('node:fs')).readFileSync(taskFile, 'utf8')

const tmp = mkdtempSync(join(tmpdir(), 'agentreel-'))
mkdirSync(outDir, { recursive: true })
const mp4 = resolve(outDir, 'agent-drive.mp4')
const callsJson = resolve(outDir, 'agent-drive.calls.json')
const poster = resolve(outDir, 'agent-drive-poster.jpg')
const grab = join(tmp, 'grab.mkv')
const wav = join(tmp, 'audio.wav')
const termLog = join(tmp, 'terminal.log')

const kids: ChildProcess[] = []
const spawnKid = (
  cmd: string,
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
) => {
  const kid = spawn(cmd, argv, { stdio: 'ignore', env })
  kids.push(kid)
  return kid
}

spawnSync('pw-cli', [
  'create-node',
  'adapter',
  `{ factory.name=support.null-audio-sink node.name=${SINK} media.class=Audio/Sink object.linger=true audio.position=[FL FR] }`,
])
const sinkId = spawnSync('pw-cli', ['ls', 'Node'])
  .stdout.toString()
  .split(/\n(?=\s*id \d+, type)/)
  .find(block => block.includes(`node.name = "${SINK}"`))
  ?.match(/id (\d+),/)?.[1]
console.log(`agentreel: null sink ${SINK} (${sinkId ?? 'no id'})`)

const served = await serveDev(PORT)

const cleanUp = () => {
  for (const kid of kids.toReversed()) {
    try {
      kid.kill()
    } catch {
      // already exited
    }
  }
  if (sinkId !== undefined) spawnSync('pw-cli', ['destroy', sinkId])
}
process.on('exit', cleanUp)
process.on('SIGINT', () => {
  cleanUp()
  process.exit(130)
})

spawnKid('Xvfb', [
  display,
  '-screen',
  '0',
  `${WIDTH}x${HEIGHT}x24`,
  '-nolisten',
  'tcp',
])
await sleep(2000)

spawnKid(
  chromePath(),
  [
    `--user-data-dir=${join(tmp, 'chrome')}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--test-type',
    '--ozone-platform=x11',
    '--autoplay-policy=no-user-gesture-required',
    '--window-position=0,0',
    `--window-size=${CHROME_W},${HEIGHT}`,
    `--remote-debugging-port=${CDP_PORT}`,
    served.url,
  ],
  { ...process.env, DISPLAY: display, PULSE_SINK: SINK },
)

const page = await attach(CDP_PORT)
await until(page, APP_READY, 60_000)
await page.send('Page.enable')
await page.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__contexts = []; { const Base = window.AudioContext; window.AudioContext = class extends Base { constructor(o) { super(o); window.__contexts.push(this) } } }`,
})
await page.send('Runtime.evaluate', { expression: 'window.stale = true' })
await page.send('Page.reload')
await until(page, `!window.stale && ${APP_READY}`, 60_000)
await sleep(3000)

await page.send('Runtime.evaluate', {
  expression: `window.__agentCalls = []; for (const name of ['set', 'load', 'reset', 'undo', 'redo', 'tune', 'drums', 'line', 'play', 'stop']) { const real = window.bender[name]; window.bender[name] = function (...a) { const glide = name === 'set' && typeof a[0] === 'string' ? a[2] : a[1]; const result = real.apply(this, a); const tempo = window.bender.board().controls.find(r => r.startsWith('drumBpm ='))?.match(/= ([\\d.]+)/)?.[1]; window.__agentCalls.push({ at: performance.now(), name, glide: typeof glide === 'number' ? glide : 0, bpm: tempo === undefined ? 0 : Number(tempo) }); return result } }`,
})

const mcpConfig = join(tmp, 'mcp.json')
writeFileSync(
  mcpConfig,
  JSON.stringify({
    mcpServers: {
      chrome: {
        command: 'npx',
        args: ['-y', MCP, '--browserUrl', `http://127.0.0.1:${CDP_PORT}`],
      },
    },
  }),
)
console.log('agentreel: warming the mcp server')
spawnSync('npx', ['-y', MCP, '--help'], { stdio: 'ignore' })

console.log('agentreel: recording')
const recStart = Date.now()
const renderNode = existsSync('/dev/dri')
  ? readdirSync('/dev/dri')
      .filter(name => name.startsWith('renderD'))
      .map(name => `/dev/dri/${name}`)
      .find(
        node =>
          spawnSync('ffmpeg', [
            ...['-v', 'error', '-vaapi_device', node],
            ...['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=30', '-t', '0.2'],
            ...['-vf', 'format=nv12,hwupload', '-c:v', 'h264_vaapi'],
            ...['-f', 'null', '-'],
          ]).status === 0,
      )
  : undefined
const encodeGrab =
  renderNode === undefined
    ? [
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
      ]
    : [
        '-vf',
        'hwupload,scale_vaapi=format=nv12',
        '-c:v',
        'h264_vaapi',
        '-qp',
        '18',
      ]
console.log(
  `agentreel: grab encodes on ${renderNode === undefined ? 'the CPU' : renderNode}`,
)
const rec = spawnKid('ffmpeg', [
  ...['-y', '-v', 'error'],
  ...(renderNode === undefined ? [] : ['-vaapi_device', renderNode]),
  ...['-f', 'x11grab', '-framerate', String(FPS)],
  ...['-video_size', `${WIDTH}x${HEIGHT}`, '-draw_mouse', '0', '-i', display],
  ...encodeGrab,
  grab,
])
const audio = spawnKid('pw-record', [
  '--target',
  SINK,
  '-P',
  'stream.capture.sink=true',
  '--rate',
  '48000',
  '--channels',
  '2',
  wav,
])

const childEnv: NodeJS.ProcessEnv = { ...process.env, DISPLAY: display }
for (const name of Object.keys(childEnv)) {
  if (/^CLAUDE(CODE|_CODE|_EFFORT|_PID)/.test(name)) delete childEnv[name]
}

spawnKid(
  'xterm',
  [
    '-geometry',
    `60x50+${CHROME_W}+0`,
    '-fa',
    'DejaVu Sans Mono',
    '-fs',
    '11',
    '-bg',
    '#16161a',
    '-fg',
    '#d8d8dc',
    '-tn',
    'xterm-256color',
    '-l',
    '-lf',
    termLog,
    '-e',
    'claude',
    task,
    '--model',
    model,
    '--mcp-config',
    mcpConfig,
    '--strict-mcp-config',
    '--permission-mode',
    'bypassPermissions',
    '--disallowedTools',
    'Bash,Edit,Write,Read,Glob,Grep,NotebookEdit,WebFetch,WebSearch,Task',
  ],
  childEnv,
)

await sleep(2500)
const xdo = (...a: string[]) =>
  spawnSync('xdotool', a, { env: { ...process.env, DISPLAY: display } })
const termId = xdo('search', '--class', 'xterm')
  .stdout.toString()
  .trim()
  .split('\n')
  .at(-1)
if (termId === undefined || termId === '') {
  console.warn('agentreel: no xterm window to place')
} else {
  xdo('windowsize', termId, String(TERM_W), String(HEIGHT))
  xdo('windowmove', termId, String(CHROME_W), '0')
}

await page.send('Runtime.evaluate', {
  expression: `window.__frameGaps = []; { let last = performance.now(); const tick = now => { window.__frameGaps.push(now - last); last = now; requestAnimationFrame(tick) }; requestAnimationFrame(tick) }`,
})
const procTicks = () => {
  const byName = new Map<string, number>()
  for (const pid of readdirSync('/proc').filter(d => /^\d+$/.test(d))) {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      const name = cmd.startsWith('Xvfb')
        ? 'Xvfb'
        : cmd.startsWith('ffmpeg') && cmd.includes(display)
          ? 'ffmpeg'
          : cmd.startsWith('xterm')
            ? 'xterm'
            : cmd.startsWith('claude') && cmd.includes(mcpConfig)
              ? 'claude'
              : cmd.includes(MCP)
                ? 'mcp'
                : cmd.includes(tmp)
                  ? cmd.includes('--type=gpu')
                    ? 'chrome-gpu'
                    : cmd.includes('--type=renderer')
                      ? 'chrome-renderer'
                      : 'chrome-other'
                  : ''
      if (name !== '') {
        const f = readFileSync(`/proc/${pid}/stat`, 'utf8')
          .replace(/^.*\) /s, '')
          .split(' ')
        byName.set(
          name,
          (byName.get(name) ?? 0) + Number(f[11]) + Number(f[12]),
        )
      }
    } catch {
      // gone
    }
  }
  return byName
}
let ticksBefore = procTicks()
let probeAt = Date.now()
const probe = async () => {
  const gaps =
    (
      await page.send<{ result: { value?: number[] } }>('Runtime.evaluate', {
        expression: `window.__frameGaps.splice(0)`,
        returnByValue: true,
      })
    ).result.value ?? []
  const underruns = (
    await page.send<{ result: { value?: string } }>('Runtime.evaluate', {
      expression: `(() => { const s = window.__contexts?.[0]?.playbackStats; return s ? s.underrunEvents + ' underruns ' + Math.round(s.underrunDuration * 1000) + 'ms' : 'no playbackStats' })()`,
      returnByValue: true,
    })
  ).result.value
  const sorted = gaps.toSorted((a, b) => a - b)
  const ticks = procTicks()
  const secs = (Date.now() - probeAt) / 1000
  const cpu = [...ticks]
    .map(
      ([k, v]) => `${k} ${Math.round((v - (ticksBefore.get(k) ?? 0)) / secs)}%`,
    )
    .join(', ')
  ticksBefore = ticks
  probeAt = Date.now()
  console.log(
    `agentreel debug t=${Math.round((Date.now() - recStart) / 1000)}s raf ${(gaps.length / secs).toFixed(1)}fps p95 ${sorted[Math.floor(sorted.length * 0.95)]?.toFixed(0)}ms max ${sorted.at(-1)?.toFixed(0)}ms | ${underruns} | load ${readFileSync('/proc/loadavg', 'utf8').split(' ')[0]} | ${cpu}`,
  )
}

const sizeOf = () => (existsSync(termLog) ? statSync(termLog).size : 0)
const deadline = Date.now() + capSecs * 1000
let last = sizeOf()
let quietSince = Date.now()
let landed = false
while (Date.now() < deadline && !landed) {
  await sleep(2000)
  if (Date.now() - probeAt > 5000)
    await probe().catch((e: unknown) =>
      console.log(`agentreel debug probe failed: ${String(e)}`),
    )
  const now = sizeOf()
  if (now !== last) {
    last = now
    quietSince = Date.now()
  }
  landed = Date.now() - recStart > 45_000 && Date.now() - quietSince > 15_000
}
console.log(
  landed
    ? 'agentreel: the session went quiet'
    : `agentreel: no landing inside ${capSecs}s`,
)
await sleep(3000)

const pageCalls = await page
  .send<{
    result: {
      value?: {
        now: number
        calls: { at: number; name: string; glide: number; bpm: number }[]
      }
    }
  }>('Runtime.evaluate', {
    expression: `({ now: performance.now(), calls: window.__agentCalls })`,
    returnByValue: true,
  })
  .then(r => r.result.value)
  .catch(() => undefined)
const pageNowInTake = (Date.now() - recStart) / 1000
const calls = (pageCalls?.calls ?? []).map(c => ({
  ...c,
  at: Number(
    (pageNowInTake - (pageCalls?.now ?? 0) / 1000 + c.at / 1000).toFixed(3),
  ),
}))
writeFileSync(callsJson, JSON.stringify(calls, null, 1))
console.log(`agentreel: ${calls.length} bender calls in ${callsJson}`)

const grabExit = new Promise(done => rec.once('exit', done))
rec.kill('SIGINT')
audio.kill('SIGINT')
await Promise.race([grabExit, sleep(120_000)])
await sleep(500)

const loud = spawnSync(
  'ffmpeg',
  ['-i', wav, '-af', 'volumedetect', '-f', 'null', '-'],
  {
    encoding: 'utf8',
  },
).stderr.match(/(mean|max)_volume: (-?[\d.]+) dB/g)
console.log(`agentreel: audio levels ${loud?.join(', ') ?? 'unreadable'}`)

const frameTimes = spawnSync(
  'ffprobe',
  [
    '-v',
    'error',
    '-select_streams',
    'v',
    '-show_entries',
    'frame=pts_time',
    '-of',
    'csv=p=0',
    grab,
  ],
  { encoding: 'utf8' },
)
  .stdout.split('\n')
  .filter(line => line !== '')
  .map(Number)
const lostFrames = frameTimes
  .slice(1)
  .map((t, i) => Math.round((t - (frameTimes[i] ?? t)) * FPS) - 1)
  .filter(lost => lost > 0)
const lostTotal = lostFrames.reduce((a, b) => a + b, 0)
console.log(
  lostTotal === 0
    ? `agentreel: the grab kept all ${frameTimes.length} frames`
    : `agentreel: the grab lost ${lostTotal} of ${frameTimes.length + lostTotal} frames in ${lostFrames.length} gaps, the longest ${Math.max(...lostFrames)}; a busy machine makes a choppy take`,
)

const pcm = spawnSync(
  'ffmpeg',
  ['-v', 'error', '-i', wav, '-ac', '1', '-f', 's16le', '-'],
  { maxBuffer: 1 << 30 },
).stdout
const dropouts: number[] = []
let zeroFrom = -1
let heard = false
for (let i = 0; i < pcm.length / 2; i++) {
  const silent = pcm.readInt16LE(i * 2) === 0
  if (!silent) {
    if (heard && zeroFrom >= 0 && i - zeroFrom >= 96)
      dropouts.push(i - zeroFrom)
    heard = true
    zeroFrom = -1
  } else if (zeroFrom < 0) {
    zeroFrom = i
  }
}
console.log(
  `agentreel: ${dropouts.length} audio dropouts, ${Math.round(dropouts.reduce((a, b) => a + b, 0) / 48)}ms of silence inside the take`,
)

console.log('agentreel: encoding')
const encode = spawnSync('ffmpeg', [
  '-y',
  '-v',
  'error',
  '-i',
  grab,
  '-i',
  wav,
  '-map',
  '0:v',
  '-map',
  '1:a',
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '26',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-b:a',
  '160k',
  '-shortest',
  '-movflags',
  '+faststart',
  mp4,
])
if (encode.status !== 0)
  die(`the encode failed: ${encode.stderr?.toString().slice(-2000)}`)

const posterAt = Math.max(1, ((Date.now() - recStart) / 1000) * 0.6).toFixed(1)
spawnSync('ffmpeg', [
  '-y',
  '-v',
  'error',
  '-ss',
  posterAt,
  '-i',
  mp4,
  '-frames:v',
  '1',
  '-q:v',
  '4',
  poster,
])

cleanUp()
await served.stop()
if (!keep) rmSync(tmp, { recursive: true, force: true })
console.log(`agentreel: ${mp4} (${(statSync(mp4).size / 1e6).toFixed(0)}MB)`)
console.log(`agentreel: ${poster}`)
if (keep) console.log(`agentreel: kept ${tmp}`)
process.exit(landed ? 0 : 1)
