// CROSS_REPO_SYNC_FILE(changelog)
// Reads the CHANGELOG.md that git-cliff writes (cliff.toml) and regroups it as
// one blog post per day, since a busy day ships several releases.

export interface Change {
  scope?: string
  sha: string
  url: string
  text: string
}

export interface Release {
  version: string
  date: string
  groups: Map<string, Change[]>
}

export interface Post {
  date: string
  versions: string[]
  groups: [string, Change[]][]
}

export const SHOWN_GROUPS = [
  'Features',
  'Fixes',
  'Performance',
  'Other Changes',
] as const

const RELEASE = /^## \[([^\]]+)\]\([^)]*\) - (\d{4}-\d{2}-\d{2})$/
const GROUP = /^### (.+)$/
const CHANGE =
  /^- (?:\*\(([^)]+)\)\* )?\[`(\w+)`\]\(([^)]+)\) (?:\[\*\*breaking\*\*\] )?(.+)$/

export function parseChangelog(markdown: string) {
  const releases: Release[] = []
  let release: Release | undefined
  let group: Change[] | undefined
  for (const line of markdown.split('\n')) {
    const head = RELEASE.exec(line)
    if (head) {
      release = { version: head[1]!, date: head[2]!, groups: new Map() }
      releases.push(release)
      group = undefined
      continue
    }
    if (line.startsWith('## ')) {
      release = undefined
      continue
    }
    const title = GROUP.exec(line)
    if (title && release) {
      group = release.groups.get(title[1]!) ?? []
      release.groups.set(title[1]!, group)
      continue
    }
    const change = CHANGE.exec(line)
    if (change && group) {
      group.push({
        scope: change[1],
        sha: change[2]!,
        url: change[3]!,
        text: change[4]!,
      })
    }
  }
  return releases
}

export function postsByDay(
  releases: Release[],
  shown: readonly string[] = SHOWN_GROUPS,
) {
  const posts = new Map<string, Post>()
  for (const release of releases) {
    const post = posts.get(release.date) ?? {
      date: release.date,
      versions: [],
      groups: shown.map(name => [name, []] as [string, Change[]]),
    }
    posts.set(release.date, post)
    post.versions.push(release.version)
    for (const [name, changes] of post.groups)
      changes.push(...(release.groups.get(name) ?? []))
  }
  return [...posts.values()]
    .map(post => ({
      ...post,
      groups: post.groups.filter(([, changes]) => changes.length > 0),
    }))
    .filter(post => post.groups.length > 0)
}

export function versionSpan(versions: string[]) {
  const newest = versions[0]
  const oldest = versions.at(-1)
  return newest === oldest ? `v${newest}` : `v${oldest}–v${newest}`
}

export function longDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
