import en from './en.js'
import sw from './sw.js'

let language = typeof window !== 'undefined' && window.localStorage?.getItem('kms.lang') === 'sw' ? 'sw' : 'en'
export function getLanguage() { return language }
export function setLanguage(next) {
  language = next === 'sw' ? 'sw' : 'en'
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('kms.lang', language)
  }
}
export function t(key, values = {}) {
  const template = (language === 'sw' ? sw[key]?.text : null) ?? en[key] ?? key
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''))
}
