// Pushes HEAD if origin lacks it, then blocks until CI finishes on that commit.
// Usage: node scripts/wait-for-ci.mjs [--job <name>]
// With --job, waits for that job only (the release gate waits for `check` and
// leaves the build and deploy to finish on their own). Exits 1 on a red run.
// CI_WAIT_MINUTES bounds the wait (default 45).

import { execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const POLL_MS = 15_000
const APPEAR_MS = 5 * 60_000
const WAIT_MS = Number(process.env.CI_WAIT_MINUTES ?? 45) * 60_000

const jobFlag = process.argv.indexOf('--job')
const job = jobFlag === -1 ? undefined : process.argv[jobFlag + 1]

const out = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim()
const api = path => JSON.parse(out('gh', ['api', path]))

function fail(problem) {
  console.error(`CI is not green: ${problem}`)
  process.exit(1)
}

const sha = out('git', ['rev-parse', 'HEAD'])
const short = sha.slice(0, 7)

if (!out('git', ['branch', '-r', '--contains', sha])) {
  console.log(`Pushing ${short} so CI can see it`)
  execFileSync('git', ['push', '--follow-tags'], { stdio: 'inherit' })
}

const latest = () =>
  api(`repos/:owner/:repo/actions/runs?head_sha=${sha}`).workflow_runs[0]

const progress = run => {
  if (!job) return run
  const found = api(`repos/:owner/:repo/actions/runs/${run.id}/jobs`).jobs.find(
    j => j.name === job,
  )
  return found ?? { ...run, status: 'queued', conclusion: null }
}

const started = Date.now()
let announced

for (;;) {
  const run = latest()
  const state = run && progress(run)

  if (run && announced !== run.id) {
    console.log(`Waiting for ${job ?? run.name} on ${short}: ${run.html_url}`)
    announced = run.id
  }

  if (state?.status === 'completed') {
    if (state.conclusion !== 'success') {
      fail(`${job ?? run.name} ${state.conclusion}: ${run.html_url}`)
    }
    console.log(`${job ?? run.name} is green on ${short}`)
    break
  }

  const waited = Date.now() - started
  if (!run && waited > APPEAR_MS) {
    fail(`no run appeared for ${short} in ${APPEAR_MS / 60_000} minutes`)
  }
  if (waited > WAIT_MS) {
    fail(`still ${state?.status} after ${WAIT_MS / 60_000} minutes`)
  }
  await sleep(POLL_MS)
}
