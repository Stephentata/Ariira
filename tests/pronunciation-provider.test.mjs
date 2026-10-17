import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LocalWhisperPronunciationProvider,
  LocalWhisperSTTProvider,
  MockPronunciationProvider,
  TranscriptComparisonPronunciationProvider,
  encodePcm16Wav,
  getWhisperLanguage,
  normalizePronunciationText,
} from '../src/pronunciation-provider.js'

test('encodes captured PCM as a valid mono 16-bit WAV for browser-independent decoding', async () => {
  const wav = encodePcm16Wav(new Float32Array([-1, -0.5, 0, 0.5, 1]), 16_000)
  const buffer = await wav.arrayBuffer()
  const view = new DataView(buffer)
  const readText = (offset, length) => String.fromCharCode(...new Uint8Array(buffer, offset, length))

  assert.equal(wav.type, 'audio/wav')
  assert.equal(readText(0, 4), 'RIFF')
  assert.equal(readText(8, 4), 'WAVE')
  assert.equal(readText(12, 4), 'fmt ')
  assert.equal(readText(36, 4), 'data')
  assert.equal(view.getUint32(24, true), 16_000)
  assert.equal(view.getUint16(22, true), 1)
  assert.equal(view.getUint16(34, true), 16)
  assert.equal(view.getUint32(40, true), 10)
  assert.deepEqual(
    Array.from({ length: 5 }, (_, index) => view.getInt16(44 + index * 2, true)),
    [-32_768, -16_384, 0, 16_383, 32_767],
  )
})

test('rejects empty, non-finite, or invalid-rate PCM recordings', () => {
  assert.throws(() => encodePcm16Wav(new Float32Array(), 16_000), /did not capture any audio/)
  assert.throws(() => encodePcm16Wav(new Float32Array([Number.NaN]), 16_000), /could not be prepared/)
  assert.throws(() => encodePcm16Wav(new Float32Array([0.5]), 0), /could not be prepared/)
})

test('selects the matching local Whisper language for English, French, and Mandarin', () => {
  assert.equal(getWhisperLanguage('en-US'), 'english')
  assert.equal(getWhisperLanguage('fr-FR'), 'french')
  assert.equal(getWhisperLanguage('zh-CN'), 'chinese')
  assert.throws(() => getWhisperLanguage('es-ES'), /does not support "es-ES"/)
  assert.throws(() => getWhisperLanguage(' '), /language is required/)
  assert.throws(() => getWhisperLanguage('constructor'), /does not support "constructor"/)
})

test('normalizes Unicode, whitespace, and punctuation for transcript comparison', () => {
  assert.equal(normalizePronunciationText('  Nǐ hǎo! '), normalizePronunciationText('Nǐhǎo'))
})

test('reports an understood phrase without inventing a pronunciation score', () => {
  const provider = new TranscriptComparisonPronunciationProvider()
  const result = provider.assessTranscript('  你好！ ', '你好', 'zh-CN')

  assert.equal(result.status, 'understood')
  assert.equal(result.confidence, null)
  assert.deepEqual(result.problemWords, [])
  assert.equal(result.toneFeedbackAvailable, false)
  assert.match(result.note, /not a pronunciation score/)
  assert.match(result.toneNote, /Tone feedback is not available/)
  assert.equal('score' in result, false)
})

test('flags a mismatched target item and gives one actionable retry tip', () => {
  const provider = new TranscriptComparisonPronunciationProvider()
  const result = provider.assessTranscript('谢谢', '你好', 'zh-CN')

  assert.equal(result.status, 'try-again')
  assert.deepEqual(result.problemWords, [{ target: '你好', heard: '谢谢' }])
  assert.match(result.tip, /Listen to the model/)
  assert.match(result.note, /can mishear clear speech/)
})

test('highlights only the mismatched word in a multiword reference', () => {
  const provider = new TranscriptComparisonPronunciationProvider()
  const result = provider.assessTranscript('hello word', 'hello world', 'en-US')

  assert.equal(result.status, 'try-again')
  assert.deepEqual(result.problemWords, [{ target: 'world', heard: 'word' }])
})

test('reports unavailable tone feedback for Mandarin without claiming to assess tone', () => {
  const provider = new TranscriptComparisonPronunciationProvider()
  const result = provider.assessTranscript('你好', '你好', 'zh-CN')

  assert.equal(result.toneFeedbackAvailable, false)
  assert.equal(result.toneNote, 'Tone feedback is not available from this check.')
})

test('mock provider returns the predictable pronunciation contract', async () => {
  const provider = new MockPronunciationProvider(async () => ({ text: 'hello', confidence: null }))
  const result = await provider.assess(new Blob(['audio']), 'hello', 'en-US')

  assert.equal(result.status, 'understood')
  assert.equal(result.referenceText, 'hello')
  assert.equal(result.recognizedText, 'hello')
  assert.equal(result.toneFeedbackAvailable, false)
})

test('local pronunciation provider transcribes recorded audio before comparison', async () => {
  let received
  const provider = new LocalWhisperPronunciationProvider({
    transcribe: async (audio, language, onProgress) => {
      received = { audio, language }
      onProgress('Transcribing locally')
      return { text: '你好！', confidence: null }
    },
  })
  const progress = []
  const recording = new Blob(['audio'], { type: 'audio/webm' })
  const result = await provider.assess(recording, '你好', 'zh-CN', (message) => progress.push(message))

  assert.equal(received.audio, recording)
  assert.equal(received.language, 'zh-CN')
  assert.deepEqual(progress, ['Transcribing locally'])
  assert.equal(result.status, 'understood')
})

test('local STT provider sends decoded samples to its worker and returns the transcript', async () => {
  let posted
  let terminated = false
  const worker = {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      posted = message
      queueMicrotask(() => {
        this.onmessage({ data: { id: message.id, type: 'progress', message: 'Model ready' } })
        this.onmessage({ data: { id: message.id, type: 'result', text: '你好' } })
      })
    },
    terminate() {
      terminated = true
    },
  }
  const provider = new LocalWhisperSTTProvider({
    workerFactory: () => worker,
    audioDecoder: async () => new Float32Array([0.1, -0.1]),
  })
  const progress = []
  const result = await provider.transcribe(new Blob(['audio']), 'zh-CN', (message) => progress.push(message))

  assert.equal(posted.language, 'zh-CN')
  assert.equal(posted.sampleRate, 16_000)
  assert.ok(Math.abs(posted.samples[0] - 0.1) < 1e-6)
  assert.ok(Math.abs(posted.samples[1] + 0.1) < 1e-6)
  assert.deepEqual(result, { text: '你好', confidence: null })
  assert.deepEqual(progress, ['Model ready'])
  provider.dispose()
  assert.equal(terminated, true)
})

test('local STT provider reports worker failures and releases pending requests on disposal', async () => {
  const worker = {
    onmessage: null,
    onerror: null,
    postMessage() {},
    terminate() {},
  }
  const provider = new LocalWhisperSTTProvider({
    workerFactory: () => worker,
    audioDecoder: async () => new Float32Array([0.2]),
  })
  const request = provider.transcribe(new Blob(['audio']), 'zh-CN')
  await Promise.resolve()
  provider.dispose()
  await assert.rejects(request, /cancelled/)

  const broken = new LocalWhisperSTTProvider({
    workerFactory: () => ({ postMessage() { throw new Error('worker is unavailable') } }),
    audioDecoder: async () => new Float32Array([0.2]),
  })
  await assert.rejects(broken.transcribe(new Blob(['audio']), 'zh-CN'), /worker is unavailable/)
})

test('rejects missing transcript, target, language, and empty audio explicitly', async () => {
  const compare = new TranscriptComparisonPronunciationProvider()
  assert.throws(() => compare.assessTranscript('', '你好', 'zh-CN'), /recognized speech transcript/)
  assert.throws(() => compare.assessTranscript('你好', ' ', 'zh-CN'), /target phrase/)
  assert.throws(() => compare.assessTranscript('你好', '你好', ''), /language/)
  assert.throws(() => compare.assessTranscript('！', '你好', 'zh-CN'), /recognized speech transcript/)

  const provider = new LocalWhisperPronunciationProvider({
    transcribe: async () => ({ text: '', confidence: null }),
  })
  await assert.rejects(provider.assess(new Blob(['audio']), '你好', 'zh-CN'), /recognized speech transcript/)
  await assert.rejects(
    new LocalWhisperSTTProvider({ audioDecoder: async () => new Float32Array() }).transcribe(new Blob(), 'zh-CN'),
    /could not be prepared/,
  )
})
