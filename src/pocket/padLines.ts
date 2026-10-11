const PAD_LINES = 3

/** A bend key's name as one line per control it moves, and any wire or bend it
    solders on as a line of its own, as many as a pad has room for. */
export function padLines(name: string): string[] {
  const moves = name.match(/[^▲▼]+[▲▼]/g)?.map(m => m.trim()) ?? []
  const end = Math.max(name.lastIndexOf('▲'), name.lastIndexOf('▼'))
  const tail = name.slice(end + 1).trim()
  return [...moves, ...(tail === '' ? [] : [tail])].slice(0, PAD_LINES)
}
