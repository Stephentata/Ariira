import test from 'node:test'
import assert from 'node:assert/strict'
import {
  readSafeguardEvents,
  recordSafeguardEvent,
  SAFEGUARD_EVENTS_STORAGE_KEY,
} from '../src/safeguard-telemetry.js'

function createStorage(initial = null) {
  const values = new Map(initial === null ? [] : [[SAFEGUARD_EVENTS_STORAGE_KEY, initial]])
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('safeguard telemetry stores only bounded event categories and timestamps', () => {
  const storage = createStorage()
  for (let index = 0; index < 105; index += 1) {
    recordSafeguardEvent(storage, 'three-failures', new Date(index * 1000))
  }
  const events = readSafeguardEvents(storage)
  assert.equal(events.length, 100)
  assert.deepEqual(Object.keys(events[0]).sort(), ['at', 'type'])
  assert.equal(events[0].type, 'three-failures')
})

test('safeguard telemetry rejects malformed saved events and unknown event types', () => {
  const damaged = createStorage('{not json')
  assert.throws(() => readSafeguardEvents(damaged), /damaged/)
  assert.throws(() => recordSafeguardEvent(createStorage(), 'learner-transcript'), /Unknown safeguard event/)
})
