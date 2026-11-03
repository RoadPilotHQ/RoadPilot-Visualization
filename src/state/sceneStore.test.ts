import { describe, expect, it } from 'vitest'
import { SimulationSource } from '@/sources/simulation/SimulationSource'
import { attachSource, createSceneStore } from './sceneStore'

const idleScheduler = {
  request: () => 1,
  cancel: () => undefined,
}

describe('scene store', () => {
  it('receives frames, status and playback state from an attached source', () => {
    const store = createSceneStore()
    const source = new SimulationSource({ autoPlay: false, scheduler: idleScheduler })
    const detach = attachSource(store, source)
    const state = store.getState()
    expect(state.source?.kind).toBe('simulation')
    expect(state.status.state).toBe('connected')
    expect(state.frame?.sequence).toBe(0)
    expect(state.playback).toEqual({ playing: false, rate: 1, durationS: 60 })

    source.playback.seek(12)
    expect(store.getState().frame?.timestampS).toBe(12)

    source.playback.play()
    expect(store.getState().playback?.playing).toBe(true)
    source.playback.setRate(2)
    expect(store.getState().playback?.rate).toBe(2)

    detach()
    expect(store.getState().status.state).toBe('closed')
    const sequence = store.getState().frame?.sequence
    source.playback.seek(5)
    expect(store.getState().frame?.sequence).toBe(sequence)
  })

  it('does not republish playback state when only the time changes', () => {
    const store = createSceneStore()
    const source = new SimulationSource({ autoPlay: false, scheduler: idleScheduler })
    attachSource(store, source)
    const before = store.getState().playback
    source.playback.seek(3)
    source.playback.seek(4)
    expect(store.getState().playback).toBe(before)
  })

  it('toggles layers and switches views', () => {
    const store = createSceneStore()
    store.getState().toggleLayer('lanes')
    expect(store.getState().layers.lanes).toBe(false)
    expect(store.getState().layers.traffic).toBe(true)
    store.getState().setView('Telemetry')
    expect(store.getState().view).toBe('Telemetry')
  })
})
