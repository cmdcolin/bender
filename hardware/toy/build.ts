import { generate } from './generate.ts'

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const files = generate()
for (const [name, data] of Object.entries(files)) {
  const path = join(root, name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}
console.log(`${Object.keys(files).length} files`)
