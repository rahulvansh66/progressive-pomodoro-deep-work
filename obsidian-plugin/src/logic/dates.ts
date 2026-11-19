/** Calendar-date helpers on YYYY-MM-DD strings (UTC math, so DST never shifts a day). */

export const pad = (n: number) => String(n).padStart(2, '0')

const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

export const addDays = (s: string, n: number) => {
  const d = parse(s)
  d.setUTCDate(d.getUTCDate() + n)
  return fmt(d)
}

/** Monday = 0 … Sunday = 6 */
export const weekday = (s: string) => (parse(s).getUTCDay() + 6) % 7
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000)

/** Local calendar date of a JS Date. */
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** Local wall-clock time of a JS Date, HH:MM:SS. */
export const isoTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
export const today = () => isoDate(new Date())

export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(parse(s)) === s

export const fmtMin = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m * 10) / 10}m`

export const mmss = (sec: number) => {
  const s = Math.abs(Math.floor(sec))
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

export const round1 = (n: number) => Math.round(n * 10) / 10
export const round2 = (n: number) => Math.round(n * 100) / 100
