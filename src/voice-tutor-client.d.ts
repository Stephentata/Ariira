export function getOrCreateVoiceUserId(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  cryptoApi?: Crypto,
): string

export function requestVoiceTutorResponse(
  payload: Record<string, unknown>,
  options?: {
    fetcher?: typeof fetch
    storage?: Pick<Storage, 'getItem' | 'setItem'>
    cryptoApi?: Crypto
    signal?: AbortSignal
    onText?: (fullText: string, token: string) => void
  },
): Promise<string>

export function requestVoiceTranscription(
  audioBlob: Blob,
  language: string,
  options?: {
    fetcher?: typeof fetch
    storage?: Pick<Storage, 'getItem' | 'setItem'>
    cryptoApi?: Crypto
    signal?: AbortSignal
  },
): Promise<string>
