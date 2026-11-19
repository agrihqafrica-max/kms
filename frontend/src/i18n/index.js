import en from './en.js'
import sw from './sw.js'

let language = 'en'
export function setLanguage(next) { language = next === 'sw' ? 'sw' : 'en' }
export function t(key, values = {}) {
  const template = (language === 'sw' ? sw[key]?.text : null) ?? en[key] ?? key
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''))
}
