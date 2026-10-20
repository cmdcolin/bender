// Add jams of the day: trim each file to 3:30 with a fade, encode it as mp3,
// upload it to the bucket, and record its waveform peaks in src/jam/jams.json.
// The /jam/ page reads that file at build time.
// Usage: node scripts/jam.mjs file.wav|file.mp3 ...   (via pnpm jam)

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'

const BUCKET = 'myloveydove.com'
const PREFIX = 'jam-of-the-day/'
const PROFILE = 'colin'
const MANIFEST = 'src/jam/jams.json'
const SECONDS = 210
const FADE = 5
const BARS = 120
const RATE = 8000

function peaks(mp3) {
  const pcm = execFileSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      '-i',
      mp3,
      '-ac',
      '1',
      '-ar',
      String(RATE),
      '-f',
      's16le',
      '-',
    ],
    { maxBuffer: 1 << 28 },
  )
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1)
  const per = Math.ceil(samples.length / BARS)
  const bars = Array.from({ length: BARS }, (_, i) => {
    let max = 0
    for (let j = i * per; j < Math.min(samples.length, (i + 1) * per); j++)
      max = Math.max(max, Math.abs(samples[j]))
    return max
  })
  const top = Math.max(...bars, 1)
  return bars.map(v => Math.round((v / top) * 100))
}

const work = mkdtempSync(join(tmpdir(), 'jam-'))
const jams = JSON.parse(readFileSync(MANIFEST, 'utf8'))

for (const file of process.argv.slice(2)) {
  const name = basename(file, extname(file))
  const mp3 = join(work, `${name}.mp3`)
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-i',
    file,
    '-t',
    String(SECONDS),
    '-af',
    `afade=t=out:st=${SECONDS - FADE}:d=${FADE}`,
    '-codec:a',
    'libmp3lame',
    '-q:a',
    '2',
    mp3,
  ])
  execFileSync('aws', [
    's3',
    'cp',
    mp3,
    `s3://${BUCKET}/${PREFIX}${name}.mp3`,
    '--content-type',
    'audio/mpeg',
    '--only-show-errors',
    '--profile',
    PROFILE,
  ])
  const entry = { name, peaks: peaks(mp3) }
  const at = jams.findIndex(jam => jam.name === name)
  if (at === -1) jams.push(entry)
  else jams[at] = entry
  console.log(`uploaded ${name}`)
}

writeFileSync(MANIFEST, `${JSON.stringify(jams, null, 2)}\n`)
