import React from 'react'
import ReactDOM from 'react-dom/client'
import { WebSocketFrameSource } from '@/sources/live/WebSocketFrameSource'
import { SimulationSource } from '@/sources/simulation/SimulationSource'
import { attachSource, sceneStore } from '@/state/sceneStore'
import { App } from '@/ui/App'
import '@/theme/styles.css'

// Composition root: live stream is opt-in so ordinary browser launches stay in demo mode.
const source =
  new URLSearchParams(window.location.search).get('source') === 'live'
    ? new WebSocketFrameSource({ url: 'ws://127.0.0.1:17891' })
    : new SimulationSource()
attachSource(sceneStore, source)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
