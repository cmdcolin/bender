import { useEffect } from 'react'
import { engine } from '../engine/engine'
import { boardUrl } from './share'

// The address bar as a mirror of the board: every control that is off stock is
// in the url at all times, so a reload keeps the board and copying out of the
// bar is as good as pressing share. This hook owns the address bar — nothing
// else writes it.
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
    let last = ''
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
    write()
    const off = engine.controls.subscribe(write)
    return () => {
      off()
      clearTimeout(id)
    }
  }, [])
}
