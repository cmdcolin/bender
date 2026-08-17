import { createRoot } from 'react-dom/client'
import { engine } from './engine/engine'
import { App } from './ui/App'
import { boardFromLocation } from './ui/share'
import './theme.css'

// Opening someone's link is a request to hear their board, so the ROM runs.
const shared = boardFromLocation()
if (shared) {
  engine.patch(shared)
  engine.setPlaying(true)
}

createRoot(document.getElementById('root')!).render(<App />)
