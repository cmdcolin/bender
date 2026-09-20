// The three helpers everything on the home is built out of.
//
// Everything here builds nodes and sets `textContent`. A voice's name is a
// string somebody typed, and `innerHTML` anywhere in the home would hand it to
// the parser.

// CROSS_REPO_SYNC(home-dom-helpers)
const need = (id: string): HTMLElement => {
  const node = document.getElementById(id)
  if (node === null) throw new Error(`no #${id}`)
  return node
}
// CROSS_REPO_SYNC_END(home-dom-helpers)

// videoskillet keeps `el` in a shared module its home page and its "all
// sessions" page both import (site/scripts/sessionCards.ts). bender has no
// second page needing it, so it lives here.
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className !== undefined) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const needOf = <T extends HTMLElement>(id: string, kind: new () => T): T => {
  const node = need(id)
  if (!(node instanceof kind)) throw new Error(`#${id} is not a ${kind.name}`)
  return node
}

export { el, need, needOf }
