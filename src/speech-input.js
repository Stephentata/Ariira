const nativeScripts = {
  ar: /\p{Script=Arabic}/u,
  el: /\p{Script=Greek}/u,
  he: /\p{Script=Hebrew}/u,
  hi: /\p{Script=Devanagari}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
  ko: /\p{Script=Hangul}/u,
  ru: /\p{Script=Cyrillic}/u,
  th: /\p{Script=Thai}/u,
  uk: /\p{Script=Cyrillic}/u,
  zh: /\p{Script=Han}/u,
}

const nativeLanguageMarkers = {
  da: new Set(['jeg', 'du', 'det', 'er', 'en', 'og', 'vil', 'gerne', 'tak']),
  de: new Set(['ich', 'du', 'der', 'die', 'das', 'ist', 'und', 'bitte', 'möchte']),
  en: new Set(['the', 'is', 'are', 'was', 'were', 'i', 'you', 'we', 'they', 'want', 'need', 'please', 'how', 'what', 'where', 'do', 'does', 'my', 'your', 'can', 'could', 'would', 'like']),
  es: new Set(['yo', 'tú', 'el', 'la', 'que', 'es', 'y', 'quiero', 'necesito', 'por', 'favor', 'cómo', 'qué', 'dónde']),
  fi: new Set(['minä', 'sinä', 'on', 'ja', 'että', 'haluan', 'kiitos', 'mitä', 'missä']),
  fr: new Set(['je', 'tu', 'il', 'elle', 'est', 'et', 'le', 'la', 'voudrais', 'veux', 'besoin', 's’il', 'comment', 'merci']),
  id: new Set(['saya', 'anda', 'ini', 'itu', 'dan', 'adalah', 'mau', 'ingin', 'tolong', 'terima', 'kasih']),
  it: new Set(['io', 'tu', 'il', 'la', 'che', 'è', 'e', 'vorrei', 'voglio', 'grazie', 'per', 'favore']),
  ms: new Set(['saya', 'anda', 'ini', 'itu', 'dan', 'adalah', 'mahu', 'tolong', 'terima', 'kasih']),
  nl: new Set(['ik', 'jij', 'het', 'de', 'is', 'en', 'wil', 'graag', 'bedankt']),
  no: new Set(['jeg', 'du', 'det', 'er', 'en', 'og', 'vil', 'gjerne', 'takk']),
  pl: new Set(['ja', 'ty', 'jest', 'i', 'że', 'chcę', 'proszę', 'dziękuję', 'jak']),
  pt: new Set(['eu', 'você', 'o', 'a', 'que', 'é', 'e', 'quero', 'preciso', 'por', 'favor', 'obrigado']),
  ro: new Set(['eu', 'tu', 'este', 'și', 'de', 'vreau', 'mulțumesc', 'te', 'rog']),
  sv: new Set(['jag', 'du', 'det', 'är', 'och', 'vill', 'gärna', 'tack']),
  tr: new Set(['ben', 'sen', 'bu', 've', 'bir', 'istiyorum', 'lütfen', 'teşekkür']),
  vi: new Set(['tôi', 'bạn', 'là', 'và', 'muốn', 'cần', 'xin', 'cảm', 'ơn']),
}

export function isLikelyNativeLanguage(text, nativeCode, targetCode) {
  if (nativeCode === targetCode) return false
  const nativeScript = nativeScripts[nativeCode]
  if (nativeScript) {
    const letters = [...text].filter((character) => /\p{L}/u.test(character))
    return letters.length >= 3 && letters.filter((character) => nativeScript.test(character)).length / letters.length >= 0.55
  }

  const markers = nativeLanguageMarkers[nativeCode]
  const words = text.toLocaleLowerCase().match(/[\p{L}']+/gu) ?? []
  if (!markers || words.length === 0) return false
  const markerCount = words.filter((word) => markers.has(word)).length
  return markerCount >= 2 && markerCount / words.length >= 0.35
}

export function isLowConfidenceSpeech(alternatives) {
  const best = alternatives?.[0]
  if (!best || best.confidence === null || best.confidence < 0.6) return true
  const second = alternatives?.[1]
  if (!second || second.confidence === null || best.confidence - second.confidence > 0.15) return false
  const firstWords = new Set(best.transcript.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
  const secondWords = new Set(second.transcript.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
  if (!firstWords.size || !secondWords.size) return best.transcript !== second.transcript
  const overlap = [...firstWords].filter((word) => secondWords.has(word)).length
  const unionSize = firstWords.size + secondWords.size - overlap
  return overlap / unionSize < 0.65
}

export function parsePracticePhraseOptions(text) {
  return text.split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .map((line) => {
      const [phrase, ...translationParts] = line.split(/\s*[|—–]\s*/)
      return { phrase: phrase?.trim() ?? '', translation: translationParts.join(' — ').trim() }
    })
    .filter((option) => option.phrase && option.translation)
    .slice(0, 3)
}
