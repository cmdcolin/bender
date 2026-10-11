// CROSS_REPO_SYNC_FILE(changelog-test)
import { expect, test } from 'vitest'

import { longDate, parseChangelog, postsByDay, versionSpan } from './changelog'

import { readFileSync } from 'node:fs'

const SAMPLE = `# Changelog

## [Unreleased]

### Features
- [\`aaaaaaa\`](https://example.com/a) not out yet

## [1.1.0](https://example.com/compare/v1.0.1...v1.1.0) - 2026-10-11

### Features
- *(ui)* [\`bbbbbbb\`](https://example.com/b) a new page

### Tests
- [\`ccccccc\`](https://example.com/c) a test nobody reads

## [1.0.1](https://example.com/compare/v1.0.0...v1.0.1) - 2026-10-11

### Fixes
- *(dsp)* [\`ddddddd\`](https://example.com/d) [**breaking**] a quieter click

## [1.0.0](https://example.com/releases/tag/v1.0.0) - 2026-10-01

### Chores
- [\`eeeeeee\`](https://example.com/e) bump a dependency
`

test('reads each release with its groups and skips Unreleased', () => {
  const releases = parseChangelog(SAMPLE)
  expect(releases.map(r => r.version)).toEqual(['1.1.0', '1.0.1', '1.0.0'])
  expect(releases[0]!.groups.get('Features')).toEqual([
    {
      scope: 'ui',
      sha: 'bbbbbbb',
      url: 'https://example.com/b',
      text: 'a new page',
    },
  ])
  expect(releases[1]!.groups.get('Fixes')![0]!.text).toBe('a quieter click')
})

test('one post per day, holding only the groups a reader cares about', () => {
  const posts = postsByDay(parseChangelog(SAMPLE))
  expect(posts).toHaveLength(1)
  expect(posts[0]!.versions).toEqual(['1.1.0', '1.0.1'])
  expect(posts[0]!.groups.map(([name]) => name)).toEqual(['Features', 'Fixes'])
})

test('names a day by its version span and its date', () => {
  expect(versionSpan(['1.1.0', '1.0.1'])).toBe('v1.0.1–v1.1.0')
  expect(versionSpan(['1.0.0'])).toBe('v1.0.0')
  expect(longDate('2026-10-01')).toBe('October 1, 2026')
})

test('every release in the real changelog parses', () => {
  const markdown = readFileSync('CHANGELOG.md', 'utf8')
  const releases = parseChangelog(markdown)
  expect(releases).toHaveLength(markdown.match(/^## \[\d/gm)!.length)
  const changes = markdown.match(/^- .*\[`\w+`\]/gm)!.length
  const parsed = releases.flatMap(r => [...r.groups.values()].flat()).length
  expect(parsed).toBe(changes)
})
