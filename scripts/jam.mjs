// Rebuild the jam of the day page from what the bucket holds, then publish it.
// Usage: node scripts/jam.mjs [file.wav|file.mp3 ...]   (via pnpm jam)
// Each file is trimmed to 3:30 with a fade, encoded as mp3 and uploaded with
// its waveform peaks as a .json beside it. The page draws the bars from them.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'

const BUCKET = 'myloveydove.com'
const PREFIX = 'jam-of-the-day/'
const PROFILE = 'colin'
const DISTRIBUTION = 'E18JD5XP4HQPUW'
const EMAIL = 'colin.diesh@gmail.com'
const SECONDS = 210
const FADE = 5
const BARS = 120
const RATE = 8000

const aws = (...args) =>
  execFileSync('aws', [...args, '--profile', PROFILE], {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  })

const upload = (path, key, type) =>
  aws(
    's3',
    'cp',
    path,
    `s3://${BUCKET}/${PREFIX}${key}`,
    '--content-type',
    type,
    '--only-show-errors',
  )

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

for (const file of process.argv.slice(2)) {
  const stem = basename(file, extname(file))
  const mp3 = join(work, `${stem}.mp3`)
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
  const json = join(work, `${stem}.json`)
  writeFileSync(json, JSON.stringify(peaks(mp3)))
  upload(mp3, `${stem}.mp3`, 'audio/mpeg')
  upload(json, `${stem}.json`, 'application/json')
}

const names = JSON.parse(
  aws(
    's3api',
    'list-objects-v2',
    '--bucket',
    BUCKET,
    '--prefix',
    PREFIX,
    '--query',
    'Contents[].Key',
    '--output',
    'json',
  ),
)
  .filter(key => key.endsWith('.mp3'))
  .map(key => key.slice(PREFIX.length, -'.mp3'.length))

const dateOf = name =>
  name
    .match(/(\d{4})(\d{2})(\d{2})/)
    ?.slice(1)
    .join('-')
const title = name => dateOf(name) ?? name
const order = name => dateOf(name) ?? ''

names.sort((a, b) => order(b).localeCompare(order(a)) || a.localeCompare(b))

const jams = names.map(name => {
  const json = join(work, `get-${name}.json`)
  aws(
    's3',
    'cp',
    `s3://${BUCKET}/${PREFIX}${name}.json`,
    json,
    '--only-show-errors',
  )
  return { name, peaks: JSON.parse(readFileSync(json, 'utf8')) }
})

const bars = values =>
  values.map(v => `<i style="height:${Math.max(4, v)}%"></i>`).join('')

const items = jams
  .map(
    ({ name, peaks }) => `<li data-src="${name}.mp3">
<button class="play" type="button" aria-label="Play ${title(name)}">▶</button>
<div class="body"><strong>${title(name)}</strong>
<div class="wave">${bars(peaks)}</div></div>
</li>`,
  )
  .join('\n')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Jam of the Day</title>
<style>
:root{--bg:#111;--fg:#eee;--dim:#555;--hot:#f60;--link:#8cf}
@media (prefers-color-scheme:light){:root{--bg:#fff;--fg:#111;--dim:#bbb;--hot:#e50;--link:#06c}}
body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:0 auto;padding:1rem 16px;background:var(--bg);color:var(--fg)}
a{color:var(--link)}
ul{padding:0}
li{display:flex;gap:12px;align-items:center;margin:1.5rem 0;list-style:none}
.body{flex:1;min-width:0}
.play{flex:none;width:44px;height:44px;border-radius:50%;border:0;background:var(--hot);color:#fff;font-size:18px;cursor:pointer}
.wave{display:flex;align-items:center;gap:1px;height:56px;margin-top:4px;cursor:pointer}
.wave i{flex:1;background:var(--dim);border-radius:1px}
.wave i.done{background:var(--hot)}
</style>
</head>
<body>
<h1>Jam of the Day</h1>
<p>Submit your own jam of the day: <a href="mailto:${EMAIL}?subject=Jam%20of%20the%20day">${EMAIL}</a></p>
<ul>
${items}
</ul>
<script>
const audio = new Audio()
let current = null
const show = (li, fraction) => {
  const bars = li.querySelectorAll('.wave i')
  bars.forEach((bar, i) => bar.classList.toggle('done', i < fraction * bars.length))
}
const mark = () => document.querySelectorAll('li').forEach(li => {
  li.querySelector('.play').textContent = li === current && !audio.paused ? '❚❚' : '▶'
})
const load = li => {
  if (current === li) return
  if (current) show(current, 0)
  current = li
  audio.src = li.dataset.src
}
document.querySelectorAll('li').forEach(li => {
  li.querySelector('.play').onclick = () => {
    load(li)
    audio.paused ? audio.play() : audio.pause()
  }
  li.querySelector('.wave').onclick = e => {
    const box = e.currentTarget.getBoundingClientRect()
    const fraction = (e.clientX - box.left) / box.width
    load(li)
    const seek = () => { audio.currentTime = fraction * audio.duration; audio.play() }
    audio.readyState ? seek() : audio.addEventListener('loadedmetadata', seek, { once: true })
  }
})
audio.ontimeupdate = () => current && show(current, audio.currentTime / audio.duration)
audio.onplay = audio.onpause = mark
audio.onended = () => { show(current, 0); mark() }
</script>
</body>
</html>
`

const page = join(work, 'index.html')
writeFileSync(page, html)
upload(page, 'index.html', 'text/html')
aws(
  'cloudfront',
  'create-invalidation',
  '--distribution-id',
  DISTRIBUTION,
  '--paths',
  `/${PREFIX}*`,
)
console.log(`${names.length} jams → https://${BUCKET}/${PREFIX}index.html`)
