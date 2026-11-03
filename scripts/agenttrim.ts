import { spawnSync } from 'node:child_process'

// Usage: node scripts/agenttrim.ts <in.mp4> <out.mp4>
//   keeps the prompt, skips the silence until the first sound, and ends a few
//   seconds after the last reply; the groove between plays uncut

const [input, output] = process.argv.slice(2)

const WIDTH = 1920
const HEIGHT = 1080
const CHROME_W = 1300
const TEXT_RATE = 10
const TEXT_STEP = 0.4
const PROMPT_HOLD = 4
const LEAD_IN = 1
const TAIL = 5
const FADE = 1.5
const AUDIO_RATE = 8000
const SOUND_FLOOR = 0.003

const textEvents = (file: string) => {
  const w = Math.round((WIDTH - CHROME_W) / 4)
  const h = HEIGHT / 4
  const raw = spawnSync(
    'ffmpeg',
    [
      ...['-v', 'error', '-i', file],
      ...[
        '-vf',
        `fps=${TEXT_RATE},crop=${WIDTH - CHROME_W}:${HEIGHT}:${CHROME_W}:0,scale=${w}:${h},format=gray`,
      ],
      ...['-f', 'rawvideo', '-'],
    ],
    { maxBuffer: 1 << 30 },
  ).stdout
  const size = w * h
  const frames = Math.floor(raw.length / size)
  return Array.from({ length: frames }, (_, f) => f)
    .slice(1)
    .filter(f => {
      let sum = 0
      for (let i = 0; i < size; i++) {
        sum += Math.abs(
          (raw[f * size + i] ?? 0) - (raw[(f - 1) * size + i] ?? 0),
        )
      }
      return sum / size > TEXT_STEP
    })
    .map(f => f / TEXT_RATE)
}

const firstSound = (file: string) => {
  const pcm = spawnSync(
    'ffmpeg',
    [
      ...['-v', 'error', '-i', file, '-vn', '-ac', '1'],
      ...['-ar', String(AUDIO_RATE), '-f', 's16le', '-'],
    ],
    { maxBuffer: 1 << 30 },
  ).stdout
  const hop = AUDIO_RATE / 100
  const blocks = Math.floor(pcm.length / 2 / hop)
  const loud = Array.from({ length: blocks }, (_, k) => k).find(k => {
    let sum = 0
    for (let i = 0; i < hop; i++) {
      const v = pcm.readInt16LE((k * hop + i) * 2) / 32768
      sum += v * v
    }
    return Math.sqrt(sum / hop) > SOUND_FLOOR
  })
  return loud === undefined ? undefined : loud / 100
}

const durationOf = (file: string) =>
  Number(
    spawnSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        file,
      ],
      { encoding: 'utf8' },
    ).stdout,
  )

if (input === undefined || output === undefined) {
  console.error('usage: node scripts/agenttrim.ts <in.mp4> <out.mp4>')
  process.exit(1)
} else {
  const text = textEvents(input)
  const sound = firstSound(input) ?? 0
  const early = text.filter(t => t < sound)
  const prompt = early.reduce(
    (best, t, i) => {
      const gap = (early[i + 1] ?? sound) - t
      return gap > best.gap ? { t, gap } : best
    },
    { t: text[0] ?? 0, gap: 0 },
  )
  const duration = durationOf(input)
  const start = Math.max(0, prompt.t - 0.3)
  const end = Math.min(duration, (text.at(-1) ?? duration) + TAIL)
  const resume = Math.max(start, sound - LEAD_IN)
  const windows =
    resume <= prompt.t + PROMPT_HOLD
      ? [[start, end]]
      : [
          [start, prompt.t + PROMPT_HOLD],
          [resume, end],
        ]
  const kept = windows.reduce((s, [a = 0, b = 0]) => s + b - a, 0)
  const graph = windows
    .map(([a = 0, b = 0], i) =>
      [
        `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
        `[0:a]atrim=start=${a.toFixed(3)}:end=${b.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`,
      ].join(';'),
    )
    .concat(
      `${windows.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${windows.length}:v=1:a=1[v][cut]`,
      `[cut]afade=t=out:st=${(kept - FADE).toFixed(3)}:d=${FADE}[a]`,
    )
    .join(';')
  const encode = spawnSync(
    'ffmpeg',
    [
      ...['-v', 'error', '-y', '-i', input, '-filter_complex', graph],
      ...['-map', '[v]', '-map', '[a]'],
      ...['-c:v', 'libx264', '-preset', 'slow', '-crf', '26'],
      ...['-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k'],
      ...['-movflags', '+faststart', output],
    ],
    { stdio: 'inherit' },
  )
  console.log(
    `agenttrim: prompt at ${prompt.t.toFixed(1)}s, first sound at ${sound.toFixed(1)}s, last reply at ${(text.at(-1) ?? 0).toFixed(1)}s`,
  )
  console.log(
    `agenttrim: kept ${windows.map(([a = 0, b = 0]) => `${a.toFixed(1)}–${b.toFixed(1)}`).join(', ')}, ${kept.toFixed(1)}s of ${duration.toFixed(1)}s → ${output}`,
  )
  process.exit(encode.status ?? 1)
}
