export function initialTheme(storage, prefersDark) {
  const saved = storage.getItem('ari-language-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return prefersDark ? 'dark' : 'light'
}
