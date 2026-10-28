import { LANGUAGES } from './language-options.js'

const voiceNameHints = Object.freeze({
  ar: { male: ['Hamed', 'Maged', 'Omar'], female: ['Amira', 'Laila', 'Mariam'] },
  cs: { male: ['Jakub', 'Male'], female: ['Zuzana', 'Female'] },
  da: { male: ['Jeppe', 'Male'], female: ['Sara', 'Female'] },
  de: { male: ['Stefan', 'Male'], female: ['Anna', 'Female'] },
  el: { male: ['Nikos', 'Male'], female: ['Melina', 'Female'] },
  en: { male: ['Daniel', 'David', 'Alex', 'Guy'], female: ['Samantha', 'Victoria', 'Zira', 'Jenny'] },
  es: { male: ['Pablo', 'Jorge', 'Male'], female: ['Monica', 'Paulina', 'Female'] },
  fi: { male: ['Mikko', 'Male'], female: ['Satu', 'Female'] },
  fr: { male: ['Thomas', 'Daniel', 'Male'], female: ['Amelie', 'Audrey', 'Female'] },
  he: { male: ['Asaf', 'Male'], female: ['Carmit', 'Female'] },
  hi: { male: ['Hemant', 'Male'], female: ['Kalpana', 'Female'] },
  hu: { male: ['Tamas', 'Male'], female: ['Katalin', 'Female'] },
  id: { male: ['Ardi', 'Male'], female: ['Damayanti', 'Female'] },
  it: { male: ['Luca', 'Male'], female: ['Alice', 'Female'] },
  ja: { male: ['Keita', 'Otoya', 'Male'], female: ['Kyoko', 'O-Ren', 'Female'] },
  ko: { male: ['InJoon', 'Male'], female: ['Yuna', 'Female'] },
  ms: { male: ['Male'], female: ['Female'] },
  nl: { male: ['Xander', 'Male'], female: ['Claire', 'Female'] },
  no: { male: ['Finn', 'Male'], female: ['Nora', 'Female'] },
  pl: { male: ['Adam', 'Male'], female: ['Ewa', 'Female'] },
  pt: { male: ['Daniel', 'Male'], female: ['Joana', 'Female'] },
  ro: { male: ['Andrei', 'Male'], female: ['Ioana', 'Female'] },
  ru: { male: ['Yuri', 'Male'], female: ['Milena', 'Female'] },
  sv: { male: ['Albin', 'Male'], female: ['Klara', 'Female'] },
  sw: { male: ['Male'], female: ['Female'] },
  th: { male: ['Pattara', 'Male'], female: ['Premwadee', 'Female'] },
  tr: { male: ['Tolga', 'Male'], female: ['Seda', 'Female'] },
  uk: { male: ['Ostap', 'Male'], female: ['Polina', 'Female'] },
  vi: { male: ['An', 'Male'], female: ['Linh', 'Female'] },
  zh: { male: ['Yunxi', 'Kangkang', 'Male'], female: ['Xiaoxiao', 'Yaoyao', 'Female'] },
})

const tutorNotes = Object.freeze({
  zh: 'Use Simplified Chinese characters, show pinyin with tone marks, and give one brief tone tip when teaching a phrase.',
})

export const LANGUAGES_WITH_VOICE = Object.freeze(LANGUAGES.map((language) => ({
  ...language,
  voiceNameHints: voiceNameHints[language.code] ?? { male: ['Male'], female: ['Female'] },
  tutorNotes: tutorNotes[language.code] ?? '',
})))

export function getLanguageVoiceMetadata(code) {
  return LANGUAGES_WITH_VOICE.find((language) => language.code === code) ?? null
}
