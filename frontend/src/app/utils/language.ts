export function getCurrentLanguage(): string {
  return navigator.language.replace(/-.*/g, '')
}
