import { useEffect } from 'react'
import { engine } from '../engine/engine'
import { boardFrom, boardFromLocation, boardUrl } from './share'

// The address bar as a mirror of the board: every control that is off stock is
// in the url's hash at all times, so a reload keeps the board and copying out of the
// bar is as good as pressing share. This hook owns the address bar — nothing
// else writes it.
//
// Which of the two forms it writes is share.ts's business, and it is decided
// from what the bar already says — so a board typed out by hand stays typed out
// by hand while the writes go on underneath it.
//
// It listens to the engine rather than taking the board as a prop, because
// whoever held that prop would re-render on every control that moved — and a
// slider drag and a morph each move controls every frame, which is the whole
// panel redrawn to write a string nobody reads until the gesture ends.
//
// Trailing-debounced, and replaceState rather than pushState: browsers
// rate-limit the history API, and one board is not thirty steps of back button.
export function useBoardUrl() {
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>
    // What the bar already says, so a load only writes when the board does not
    // already encode to it — a link that arrived in the old query form still
    // gets rewritten as a hash, because that is a different string.
    let last = window.location.href
    const write = () => {
      clearTimeout(id)
      id = setTimeout(() => {
        // A board that encodes to what the bar already says is not a write:
        // the pad is off the link, so moving it must not touch the history.
        const url = boardUrl(engine.controls.get())
        if (url === last) return
        last = url
        history.replaceState(null, '', url)
      }, 250)
    }
    // A hash someone pasted or stepped back onto is a board arriving, and the
    // address bar is no longer a place a page load happens: changing it fires
    // this and nothing else. Without it the tab keeps the board it had and the
    // next write paints over what was pasted. replaceState does not fire the
    // event, so our own writes cannot come back round.
    const read = () => {
      // The whole board the hash names, not a patch over the one already here:
      // a link says stock about every control it does not list, and merging
      // left the tab holding a board neither url describes.
      //
      // A hash naming nothing is the stock board rather than nothing to do: a
      // stock board writes no param at all, so stepping back off a link lands
      // on a bare url — and that url loaded fresh opens stock. Reading it as
      // "leave the board alone" made the same address mean two boards.
      engine.patch(boardFrom(boardFromLocation() ?? {}, engine.controls.get()))
    }

    write()
    const off = engine.controls.subscribe(write)
    window.addEventListener('hashchange', read)
    return () => {
      off()
      clearTimeout(id)
      window.removeEventListener('hashchange', read)
    }
  }, [])
}
