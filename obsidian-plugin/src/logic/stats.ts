/** Period math and aggregation for the dashboard. Port of backend/app/services/stats.py. */
import { RATINGS, type Block, type Category, type Goal, type Period, type Rating } from '../types'
import { addDays, daysBetween, daysInMonth, round1, round2, weekday } from './dates'

const SCORE = Object.fromEntries(RATINGS.map((r) => [r.id, r.score])) as Record<Rating, number>
const UNCATEGORIZED_COLOR = '#94a3b8'

// ---- Period math --------------------------------------------------------
/** Inclusive [start, end] dates of the period containing d. */
export function periodRange(period: Period, d: string): [string, string] {
  const [y, m] = d.split('-').map(Number)
  switch (period) {
    case 'day': return [d, d]
    case 'week': { const s = addDays(d, -weekday(d)); return [s, addDays(s, 6)] }
    case 'month': return [`${d.slice(0, 7)}-01`, `${d.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, '0')}`]
    case 'year': return [`${y}-01-01`, `${y}-12-31`]
  }
}

export function previousRange(period: Period, d: string): [string, string] {
  return periodRange(period, addDays(periodRange(period, d)[0], -1))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function bucketLabels(period: Period): string[] {
  if (period === 'day') return Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)
  if (period === 'week') return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  if (period === 'month') return Array.from({ length: 31 }, (_, i) => String(i + 1))
  return MONTHS
}

export function bucketIndex(period: Period, b: Block): number {
  if (period === 'day') return Number(b.time.slice(0, 2))
  if (period === 'week') return weekday(b.date)
  if (period === 'month') return Number(b.date.slice(8, 10)) - 1
  return Number(b.date.slice(5, 7)) - 1
}

export function bucketCount(period: Period, start: string, end: string): number {
  return ({ day: 24, week: 7, year: 12 } as Record<string, number>)[period] ?? daysBetween(start, end) + 1
}

// ---- Data access --------------------------------------------------------
export function filterBlocks(blocks: Block[], start: string, end: string, category: string | null = null): Block[] {
  return blocks
    .filter((b) => b.date >= start && b.date <= end && (category === null || b.category === category))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Target minutes in force on date d for the given scope (null = overall). */
export function goalFor(goals: Goal[], d: string, category: string | null): number {
  let best: Goal | null = null
  for (const g of goals) {
    if (g.category !== category || g.effectiveFrom > d) continue
    if (!best || g.effectiveFrom > best.effectiveFrom || (g.effectiveFrom === best.effectiveFrom && g.id > best.id)) best = g
  }
  return best ? best.targetMinutes : 0
}

export function minutesByDay(blocks: Block[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const b of blocks) out.set(b.date, (out.get(b.date) ?? 0) + b.actualMinutes)
  return out
}

// ---- Metrics ------------------------------------------------------------
export interface Metrics {
  total_minutes: number
  block_count: number
  avg_block_minutes: number
  flow_rate: number
  avg_rating: number
  longest_block_minutes: number
  breaks_skipped: number
  active_days: number
  goal_days: number
  goal_days_met: number
}
export type MetricKey = keyof Metrics
export interface Metric { current: number; previous: number; delta: number; delta_pct: number | null }

export function computeMetrics(
  blocks: Block[], goals: Goal[], start: string, end: string, category: string | null, today: string,
): Metrics {
  const n = blocks.length
  const totalMin = blocks.reduce((s, b) => s + b.actualMinutes, 0)
  const flow = blocks.filter((b) => b.rating === 'flow').length
  const scoreSum = blocks.reduce((s, b) => s + SCORE[b.rating], 0)

  const perDay = minutesByDay(blocks)
  let goalDays = 0
  let metDays = 0
  const last = end < today ? end : today
  for (let d = start; d <= last; d = addDays(d, 1)) {
    const target = goalFor(goals, d, category)
    if (target > 0) {
      goalDays++
      if ((perDay.get(d) ?? 0) >= target) metDays++
    }
  }

  return {
    total_minutes: round1(totalMin),
    block_count: n,
    avg_block_minutes: n ? round1(totalMin / n) : 0,
    flow_rate: n ? round1((100 * flow) / n) : 0,
    avg_rating: n ? round2(scoreSum / n) : 0,
    longest_block_minutes: round1(Math.max(0, ...blocks.map((b) => b.actualMinutes))),
    breaks_skipped: blocks.filter((b) => b.breakMinutes === 0).length,
    active_days: perDay.size,
    goal_days: goalDays,
    goal_days_met: metDays,
  }
}

export function withDelta(cur: Metrics, prev: Metrics): Record<MetricKey, Metric> {
  const out = {} as Record<MetricKey, Metric>
  for (const k of Object.keys(cur) as MetricKey[]) {
    const v = cur[k]
    const p = prev[k]
    out[k] = { current: v, previous: p, delta: round2(v - p), delta_pct: p ? round1((100 * (v - p)) / p) : null }
  }
  return out
}

export interface Summary {
  period: Period
  range: { start: string; end: string }
  previous_range: { start: string; end: string }
  metrics: Record<MetricKey, Metric>
}

export function summary(
  blocks: Block[], goals: Goal[], period: Period, d: string, category: string | null, today: string,
): Summary {
  const [s, e] = periodRange(period, d)
  const [ps, pe] = previousRange(period, d)
  const cur = computeMetrics(filterBlocks(blocks, s, e, category), goals, s, e, category, today)
  const prev = computeMetrics(filterBlocks(blocks, ps, pe, category), goals, ps, pe, category, today)
  return { period, range: { start: s, end: e }, previous_range: { start: ps, end: pe }, metrics: withDelta(cur, prev) }
}

function series(period: Period, blocks: Block[], size: number): number[] {
  const vals = new Array<number>(size).fill(0)
  for (const b of blocks) {
    const i = bucketIndex(period, b)
    if (i >= 0 && i < size) vals[i] += b.actualMinutes
  }
  return vals.map(round1)
}

export interface SeriesPoint { label: string; current: number; previous: number }

export function timeseries(blocks: Block[], period: Period, d: string, category: string | null): SeriesPoint[] {
  const [s, e] = periodRange(period, d)
  const [ps, pe] = previousRange(period, d)
  const size = Math.max(bucketCount(period, s, e), bucketCount(period, ps, pe))
  const cur = series(period, filterBlocks(blocks, s, e, category), size)
  const prev = series(period, filterBlocks(blocks, ps, pe, category), size)
  const labels = bucketLabels(period).slice(0, size)
  return labels.map((label, i) => ({ label, current: cur[i], previous: prev[i] }))
}

export interface BreakdownRow { id: string; name: string; color: string; current: number; previous: number; category?: string | null }
export interface Breakdown { categories: BreakdownRow[]; tasks: BreakdownRow[] }

export function breakdown(
  blocks: Block[], categories: Category[], period: Period, d: string, category: string | null,
): Breakdown {
  const [s, e] = periodRange(period, d)
  const [ps, pe] = previousRange(period, d)
  const color = (name: string | null) => categories.find((c) => c.name === name)?.color ?? UNCATEGORIZED_COLOR
  const taskCat = new Map<string, string | null>()

  const agg = (bs: Block[]) => {
    const byCat = new Map<string | null, number>()
    const byTask = new Map<string, number>()
    for (const b of bs) {
      byCat.set(b.category, (byCat.get(b.category) ?? 0) + b.actualMinutes)
      if (b.task) {
        byTask.set(b.task, (byTask.get(b.task) ?? 0) + b.actualMinutes)
        if (!taskCat.has(b.task) || b.category) taskCat.set(b.task, b.category)
      }
    }
    return [byCat, byTask] as const
  }

  const [cc, ct] = agg(filterBlocks(blocks, s, e, category))
  const [pc, pt] = agg(filterBlocks(blocks, ps, pe, category))

  const catRows = [...new Set([...cc.keys(), ...pc.keys()])].map((name) => ({
    id: name ?? '',
    name: name ?? 'Uncategorized',
    color: color(name),
    current: round1(cc.get(name) ?? 0),
    previous: round1(pc.get(name) ?? 0),
  }))
  const taskRows = [...new Set([...ct.keys(), ...pt.keys()])].map((name) => ({
    id: name,
    name,
    category: taskCat.get(name) ?? null,
    color: color(taskCat.get(name) ?? null),
    current: round1(ct.get(name) ?? 0),
    previous: round1(pt.get(name) ?? 0),
  }))
  catRows.sort((a, b) => b.current - a.current)
  taskRows.sort((a, b) => b.current - a.current)
  return { categories: catRows, tasks: taskRows.slice(0, 15) }
}

export interface RatingRow { rating: Rating; current: number; previous: number }

export function ratings(blocks: Block[], period: Period, d: string, category: string | null): RatingRow[] {
  const [s, e] = periodRange(period, d)
  const [ps, pe] = previousRange(period, d)
  const count = (bs: Block[]) => {
    const c = Object.fromEntries(RATINGS.map((r) => [r.id, 0])) as Record<Rating, number>
    for (const b of bs) c[b.rating]++
    return c
  }
  const cur = count(filterBlocks(blocks, s, e, category))
  const prev = count(filterBlocks(blocks, ps, pe, category))
  return RATINGS.map((r) => ({ rating: r.id, current: cur[r.id], previous: prev[r.id] }))
}

export interface ProgressionRow { time: string; planned_minutes: number; actual_minutes: number; rating: Rating }

/** Planned length and rating of each block in a day: the "start small, grow" curve. */
export function blockProgression(blocks: Block[], d: string, category: string | null): ProgressionRow[] {
  return filterBlocks(blocks, d, d, category).map((b) => ({
    time: b.time.slice(0, 5),
    planned_minutes: b.plannedMinutes,
    actual_minutes: round1(b.actualMinutes),
    rating: b.rating,
  }))
}

export function dailyMinutes(
  blocks: Block[], start: string, end: string, category: string | null,
): { date: string; minutes: number }[] {
  const perDay = minutesByDay(filterBlocks(blocks, start, end, category))
  const out: { date: string; minutes: number }[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push({ date: d, minutes: round1(perDay.get(d) ?? 0) })
  return out
}

export function calendar(blocks: Block[], year: number, category: string | null) {
  return dailyMinutes(blocks, `${year}-01-01`, `${year}-12-31`, category)
}

/** Consecutive days meeting the overall daily goal (today doesn't break a streak). */
export function streak(blocks: Block[], goals: Goal[], today: string): { current: number; longest: number } {
  const overall = goals.filter((g) => g.category === null)
  if (!overall.length) return { current: 0, longest: 0 }
  const first = overall.reduce((m, g) => (g.effectiveFrom < m ? g.effectiveFrom : m), overall[0].effectiveFrom)
  if (first > today) return { current: 0, longest: 0 }
  const perDay = minutesByDay(filterBlocks(blocks, first, today))

  const met = new Map<string, boolean>()
  let longest = 0
  let run = 0
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const target = goalFor(overall, d, null)
    const ok = target > 0 && (perDay.get(d) ?? 0) >= target
    met.set(d, ok)
    run = ok ? run + 1 : 0
    longest = Math.max(longest, run)
  }

  let current = 0
  let d = today
  if (!met.get(d)) d = addDays(d, -1)
  while (d >= first && met.get(d)) {
    current++
    d = addDays(d, -1)
  }
  return { current, longest }
}
