import { createRoot } from 'react-dom/client'
import { engine } from './engine/engine'
import { App } from './ui/App'
import { boardFromLocation } from './ui/share'
import './theme.css'

// A url that names a board sets the board up, and stops there. It used to press
// play as well, back when a link was only ever made by pressing share; the
// address bar now mirrors the board at all times, so that rule had come to mean
// every reload of your own session broke into the demo song.
const shared = boardFromLocation()
if (shared) engine.patch(shared)

createRoot(document.getElementById('root')!).render(<App />)
