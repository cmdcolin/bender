// `demos.json` lists the demos: the landing page shows them as cards and this
// writes them into the README's "Demos" block. `query` is the packed board
// without its `#` or an origin, so a link pasted from a dev server can't
// publish pointing at localhost.
//
// Run: pnpm demos, or `--check` to fail when the README is stale.
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const APP = 'https://cmdcolin.github.io/bender/app/'
const README = 'README.md'

/** @type {{ name: string, says: string, query: string }[]} */
const demos = JSON.parse(readFileSync('demos.json', 'utf8'))

for (const demo of demos) {
  if (!/^(p|set)=/.test(demo.query)) {
    throw new Error(
      `${demo.name}: query must start with p= or set=, got ${demo.query.slice(0, 40)}…`,
    )
  }
}

const open = '<!-- generated:demos -->'
const close = '<!-- /generated:demos -->'
const readme = readFileSync(README, 'utf8')
const from = readme.indexOf(open)
const to = readme.indexOf(close)
if (from === -1 || to === -1)
  throw new Error(`no generated:demos block in ${README}`)

const block = demos
  .map(demo => `- ${demo.name}\n  ${APP}#${demo.query}`)
  .join('\n\n')
const filled = `${readme.slice(0, from + open.length)}\n${block}\n${readme.slice(to)}`

// oxfmt reflows the README, so --check compares against formatted output.
const require = createRequire(import.meta.url)
const oxfmtPkg = require.resolve('oxfmt/package.json')
const OXFMT = join(dirname(oxfmtPkg), require(oxfmtPkg).bin.oxfmt)
const scratch = '.demogen-scratch.md'
writeFileSync(scratch, filled)
let text
try {
  execFileSync(OXFMT, [scratch], { stdio: 'ignore' })
  text = readFileSync(scratch, 'utf8')
} finally {
  rmSync(scratch, { force: true })
}

if (process.argv.includes('--check')) {
  if (readme === text) {
    console.log(`current: ${README}`)
  } else {
    console.error(`stale — run \`pnpm demos\`: ${README}`)
    process.exit(1)
  }
} else {
  writeFileSync(README, text)
  console.log(`${demos.length} demos in ${README}`)
}
