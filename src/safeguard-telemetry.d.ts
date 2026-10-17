export type SafeguardEventType = 'distress' | 'three-failures' | 'safe-word' | 'unsafe-redirect'
export type SafeguardEvent = { type: SafeguardEventType; at: string }
export function readSafeguardEvents(storage: Storage): SafeguardEvent[]
export function recordSafeguardEvent(storage: Storage, type: SafeguardEventType, now?: Date): SafeguardEvent[]
export const SAFEGUARD_EVENTS_STORAGE_KEY: string
