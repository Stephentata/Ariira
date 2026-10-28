export function getVoiceClientIdentity(request) {
  const value = request.headers.get('x-ari-user-id') ?? ''
  return /^[a-f0-9-]{36}$/i.test(value) ? value : null
}

function getDailyQuotaKey(request, id, bucket) {
  const date = new Date().toISOString().slice(0, 10)
  const url = new URL(request.url)
  url.pathname = `/__ari_voice_quota/${bucket}/${date}/${id}`
  url.search = ''
  return new Request(url.toString(), { method: 'GET' })
}

export async function consumeDailyVoiceTurn(request, cache, id, bucket) {
  if (!cache || !id) throw new Error('Daily voice quota storage is unavailable.')
  const key = getDailyQuotaKey(request, id, bucket)
  const response = await cache.match(key)
  const count = response ? Number(await response.text()) : 0
  if (Number.isFinite(count) && count >= 30) return false
  await cache.put(key, new Response(String((Number.isFinite(count) ? count : 0) + 1), {
    headers: { 'Cache-Control': 'public, max-age=86400' },
  }))
  return true
}
