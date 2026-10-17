const STORAGE_KEY = 'ari-safeguard-events'
const ALLOWED_EVENTS = new Set(['distress', 'three-failures', 'safe-word', 'unsafe-redirect'])

export function readSafeguardEvents(storage) {
  const value = storage.getItem(STORAGE_KEY)
  if (value === null) return []
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Saved safeguard event data is damaged.')
  }
  if (!Array.isArray(parsed) || parsed.length > 100 || !parsed.every((event) =>
    event && ALLOWED_EVENTS.has(event.type) && typeof event.at === 'string' && Number.isFinite(Date.parse(event.at)),
  )) throw new Error('Saved safeguard event data is invalid.')
  return parsed
}

export function recordSafeguardEvent(storage, type, now = new Date()) {
  if (!ALLOWED_EVENTS.has(type)) throw new Error('Unknown safeguard event type.')
  const events = [...readSafeguardEvents(storage), { type, at: now.toISOString() }].slice(-100)
  storage.setItem(STORAGE_KEY, JSON.stringify(events))
  return events
}

export const SAFEGUARD_EVENTS_STORAGE_KEY = STORAGE_KEY
