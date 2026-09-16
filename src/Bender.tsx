import { engine } from './engine/engine'
import { exposeBenderApi } from './ui/agentApi'
import { App } from './ui/App'
import { keepRunState } from './ui/runState'
import { boardFromLocation } from './ui/share'
import './theme.css'

// A url that names a board sets the board up, and stops there. It used to press
// play as well, back when a link was only ever made by pressing share; the
// address bar now mirrors the board at all times, so that rule had come to mean
// every reload of your own session broke into the demo song.
const shared = boardFromLocation()
if (shared) engine.patch(shared)

// What a reload does put back is what this tab was running, which the link
// never carried either way — see runState.
const returning = keepRunState()

exposeBenderApi()

// A board somebody sent is one this tab has not seen: the overlay that says
// where to press goes up for that, and not for your own reload. The hash alone
// cannot tell them apart, because the address bar carries every board — turn
// one knob and reload, and the url is a link by every test but this one.
export default function Bender() {
  return <App openedFromLink={!!shared && !returning} />
}
