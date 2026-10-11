const isAbort = (e: unknown) =>
  e instanceof DOMException && e.name === 'AbortError'

function save(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// A phone saves a take through the share sheet; anything without one
// downloads the file.
export async function deliver(file: File) {
  if ('canShare' in navigator && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
    } catch (e) {
      if (!isAbort(e)) save(file)
    }
  } else {
    save(file)
  }
}

// A link goes out through the share sheet, or onto the clipboard where there
// is none. Resolves to a word for the stage, or '' when the sheet was closed.
export async function shareLink(url: string): Promise<string> {
  if ('share' in navigator) {
    try {
      await navigator.share({ url, title: 'bender' })
      return ''
    } catch (e) {
      if (isAbort(e)) return ''
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'link copied'
  } catch {
    return 'could not copy the link'
  }
}
