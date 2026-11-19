import { t } from '../i18n/index.js'

const money = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function formatMoney(value) {
  if (value === null || value === undefined || !/^-?\d+(\.\d+)?$/.test(String(value))) return t('unavailable')
  return money.format(String(value))
}
export function nairobiDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
export function formatDate(value) {
  if (!value) return t('unavailable')
  return new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
