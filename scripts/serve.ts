import { build, dev, preview } from 'astro'

import config from '../astro.config'

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// The browser scripts drive Astro in-process rather than spawning its CLI and
// reading the url back out of stdout: `astro dev` detaches into a background
// server when it thinks an agent is at the keyboard, and prints nothing to parse.
// A port already taken moves the server rather than stopping the run.

export type Served = { url: string; stop: () => Promise<void> }

const appAt = (port: number) =>
  `http://localhost:${port}${config.base ?? ''}/app/`

export async function serveDev(port: number, root?: string): Promise<Served> {
  const server = await dev({ root, logLevel: 'warn', server: { port } })
  return { url: appAt(server.address.port), stop: () => server.stop() }
}

// Built inside the project rather than under the system temp directory: Astro
// moves the finished pages into place with a rename, which fails across
// filesystems.
export async function buildAndPreview(
  port: number,
  { minify }: { minify: boolean },
): Promise<Served> {
  mkdirSync('node_modules/.cache', { recursive: true })
  const outDir = mkdtempSync(join('node_modules/.cache', 'bender-build-'))
  await build({ outDir, logLevel: 'error', vite: { build: { minify } } })
  const server = await preview({ outDir, logLevel: 'warn', server: { port } })
  return {
    url: appAt(server.port),
    stop: async () => {
      await server.stop()
      rmSync(outDir, { recursive: true, force: true })
    },
  }
}
