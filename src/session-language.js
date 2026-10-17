export function validateSessionLanguage(selectedLanguageCode, profileLanguageCode, lessonLanguageCode) {
  if (!selectedLanguageCode || selectedLanguageCode !== profileLanguageCode) {
    throw new Error('Session blocked: the selected learning language does not match your saved profile. Update Languages in Settings, then retry.')
  }
  if (lessonLanguageCode && lessonLanguageCode !== selectedLanguageCode) {
    throw new Error('Session blocked: this lesson is not written for your selected learning language. Choose a matching lesson or update Languages in Settings.')
  }
  return true
}
