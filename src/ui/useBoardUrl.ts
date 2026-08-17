import { useEffect } from 'react'
import { boardUrl } from './share'
import type { Controls } from '../controls'

// The address bar as a mirror of the board: every control that is off stock is
// in the url at all times, so a reload keeps the board and copying out of the
// bar is as good as pressing share. This hook owns the address bar — nothing
// else writes it.
//
// Trailing-debounced, and replaceState rather than pushState: a slider drag and
// a morph each move controls every frame, browsers rate-limit the history API,
// and one board is not thirty steps of back button.
export function useBoardUrl(controls: Controls) {
  // A string dep, so a render that rebuilds the same board does not restart the
  // debounce — and so the pad, which is off the link, never writes at all.
  const url = boardUrl(controls)
  useEffect(() => {
    const id = setTimeout(() => history.replaceState(null, '', url), 250)
    return () => clearTimeout(id)
  }, [url])
}
