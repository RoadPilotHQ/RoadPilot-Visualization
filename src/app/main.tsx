import React from 'react'
import ReactDOM from 'react-dom/client'
import { SimulationSource } from '@/sources/simulation/SimulationSource'
import { attachSource, sceneStore } from '@/state/sceneStore'
import { App } from '@/ui/App'
import '@/theme/styles.css'

// Composition root: the only place where a concrete data source is chosen.
// Phase 1 uses the deterministic simulation. Replay and live sources plug in here later.
attachSource(sceneStore, new SimulationSource())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
