import { engine } from './engine/engine.ts'
import { PocketPage } from './pocket/PocketPage.tsx'
import { exposeBenderApi } from './ui/agentApi.ts'
import { keepRunState } from './ui/runState.ts'
import { boardFromLocation } from './ui/share.ts'
import './theme.css'

// The phone page's root. It reads a board off the link and puts back what the
// tab was running, the same as the app does, and draws none of the panel.
const shared = boardFromLocation()
if (shared) engine.patch(shared)
keepRunState()
exposeBenderApi()

export default function Pocket() {
  return <PocketPage />
}
