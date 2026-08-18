// Is this branch actually faster than that ref, or is it the machine?
//
//   pnpm ab main            the everything-on board against main, 12 pairs
//   pnpm ab HEAD~1 20 4 8   against the last commit, 20 s, four keys, 8 pairs
//   pnpm ab HEAD            the control — see below
//
// Why this exists rather than reading two runs of `pnpm blocks`.
//
// bench.ts and blocks.ts take the best pass, on the argument that anything else
// sharing the machine only ever adds time, so the fastest pass is the least
// polluted. That holds inside one process. It does not hold across two, and
// across two is how a before-and-after gets read. Run the *same tree* twice and
// the two minima come out up to 13% apart: the JIT tiers up differently, the
// code lands on different pages, and the fast run is whichever process got
// lucky, not whichever tree is faster.
//
// So this doesn't compare two numbers. It runs the two trees alternately, pair
// by pair, and asks how often the new one won. That question survives a shared
// box, because both sides of a pair meet the same box. `pnpm ab HEAD` measures
// one tree against itself and is the calibration: it should sit near 6 of 12
// with a median ratio of 1.00, and whatever it does report is the floor under
// anything you read here.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ref = process.argv[2] ?? 'main'
const seconds = process.argv[3] ?? '10'
const poly = process.argv[4] ?? '4'
const pairs = Number(process.argv[5] ?? 12)

const here = resolve(import.meta.dirname, '..')
const run = (cmd: string, args: string[], cwd = here) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 24 })

const work = mkdtempSync(join(tmpdir(), 'bender-ab-'))
try {
  // Through a tar file rather than a pipe, so no shell sees the ref.
  const tar = join(work, 'ref.tar')
  run('git', ['archive', '--format=tar', '-o', tar, ref])
  run('tar', ['-xf', tar, '-C', work])
  rmSync(tar)
  // Its source, but *this* measurement code — otherwise the harness is half of
  // what is being compared, and a ref from before blocks.ts existed can't run.
  cpSync(join(here, 'scripts'), join(work, 'scripts'), { recursive: true })
  symlinkSync(join(here, 'node_modules'), join(work, 'node_modules'))

  const p50 = (root: string) => {
    const out = run('npx', [
      'tsx',
      join(root, 'scripts/blocks.ts'),
      seconds,
      poly,
    ])
    const m = out.match(/p\s+50\.0\s+([\d.]+)ms/)
    if (!m) throw new Error(`no p50 in blocks output:\n${out}`)
    return Number(m[1])
  }

  process.stdout.write(`${ref} vs working tree, ${pairs} pairs\n`)
  const ratios: number[] = []
  let wins = 0
  for (let i = 0; i < pairs; i++) {
    // Order swaps each pair: back to back, whichever runs second is measurably
    // cheaper, and a bias that lands on one side every time is a result.
    const flip = i % 2 === 1
    const a = flip ? p50(here) : p50(work)
    const b = flip ? p50(work) : p50(here)
    const [was, now] = flip ? [b, a] : [a, b]
    ratios.push(now / was)
    if (now < was) wins++
    process.stdout.write(
      `  ${(i + 1).toString().padStart(2)}  ${was.toFixed(4)}ms → ${now.toFixed(4)}ms  ${(now / was).toFixed(3)}\n`,
    )
  }

  ratios.sort((x, y) => x - y)
  const mid =
    pairs % 2
      ? ratios[(pairs - 1) / 2]!
      : (ratios[pairs / 2 - 1]! + ratios[pairs / 2]!) / 2

  // How often a fair coin lands this lopsided, both directions. Not a licence to
  // believe a 5% claim off 12 pairs — it only says the sign wasn't a coin.
  let atLeast = 0
  let c = 1
  for (let i = 0; i <= pairs; i++) {
    if (i >= Math.max(wins, pairs - wins)) atLeast += c
    c = (c * (pairs - i)) / (i + 1)
  }
  const p = Math.min(1, (2 * atLeast) / 2 ** pairs)

  console.log(
    `\nworking tree won ${wins} of ${pairs}   sign test p=${p.toFixed(3)}`,
  )
  console.log(
    `median ratio ${mid.toFixed(4)}  (${((1 - mid) * 100).toFixed(1)}% off the block)`,
  )
  if (p > 0.05) {
    console.log(
      'Not separated from the machine. Either it does nothing or the box is too busy.',
    )
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
