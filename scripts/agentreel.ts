import { attach, chromePath, sleep, until, APP_READY } from './chrome.ts'
import { serveDev } from './serve.ts'

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import {
  existsSync,
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
// Usage: node scripts/agentreel.ts [--out=DIR] [--model=sonnet] [--task=FILE]
//        [--seconds=N] [--display=:99] [--keep]
//   needs Xvfb, xterm, xdotool, ffmpeg, pw-cli, pw-record, google-chrome and a
//   logged-in `claude` on PATH.
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
const FPS = 24

const TASK = `This browser tab is bender, a circuit-bent synth with a scripting API on window.bender. Work only in that browser tab. Evaluate bender.help in the page first.

Make a dark techno groove with a rolling bassline, start it playing, then bend it with the circuit bends until it starts to fall apart. Tell me what bender.listen hears at the end.

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
await sleep(3000)

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
const rec = spawnKid('ffmpeg', [
  '-y',
  '-v',
  'error',
  '-f',
  'x11grab',
  '-framerate',
  String(FPS),
  '-video_size',
  `${WIDTH}x${HEIGHT}`,
  '-draw_mouse',
  '0',
  '-i',
  display,
  '-c:v',
  'libx264',
  '-preset',
  'ultrafast',
  '-crf',
  '18',
  '-pix_fmt',
  'yuv420p',
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

const sizeOf = () => (existsSync(termLog) ? statSync(termLog).size : 0)
const deadline = Date.now() + capSecs * 1000
let last = sizeOf()
let quietSince = Date.now()
let landed = false
while (Date.now() < deadline && !landed) {
  await sleep(2000)
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
