import { createRoot } from 'react-dom/client'
import { engine } from './engine/engine'
import { App } from './ui/App'
import { boardFromLocation } from './ui/share'
import './theme.css'

// A url that names a board is a request to hear it, so the ROM runs — someone
// else's link, or your own reload of one. Arriving with a bare url is not, and
// the audio waits for a gesture either way.
const shared = boardFromLocation()
if (shared) {
  engine.patch(shared)
  engine.setPlaying(true)
}

createRoot(document.getElementById('root')!).render(<App />)
