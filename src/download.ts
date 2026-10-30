// Into the downloads folder, through a link nobody sees. The url outlives the
// click by a minute, since a browser may still be reading it.
export function download(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
