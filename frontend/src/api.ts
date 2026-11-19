export type Rating = 'distracted' | 'okay' | 'focused' | 'flow'
export type Period = 'day' | 'week' | 'month' | 'year'

export const RATINGS: { id: Rating; label: string; color: string; emoji: string }[] = [
  { id: 'distracted', label: 'Distracted', color: '#94a3b8', emoji: '😵' },
  { id: 'okay', label: 'Okay', color: '#38bdf8', emoji: '🙂' },
  { id: 'focused', label: 'Highly focused', color: '#6366f1', emoji: '🎯' },
  { id: 'flow', label: 'Flow', color: '#f59e0b', emoji: '🔥' },
]

export interface Category { id: number; name: string; color: string; archived: boolean }
export interface Task { id: number; category_id: number; name: string; done: boolean }
export interface Block {
  id: number
  category_id: number | null
  task_id: number | null
  planned_minutes: number
  actual_seconds: number
  started_at: string
  ended_at: string
  rating: Rating
  break_taken: boolean
  break_seconds: number
  note: string | null
}
export interface Goal { id: number; category_id: number | null; target_minutes: number; effective_from: string }
export interface Settings {
  default_start_minutes: number
  min_block_minutes: number
  max_block_minutes: number
  focused_step: number
  flow_step: number
  break_minutes: number
}
export interface Suggestion { next_minutes: number; take_break: boolean; break_minutes: number; message: string }

export interface Metric { current: number; previous: number; delta: number; delta_pct: number | null }
export interface Summary {
  range: { start: string; end: string }
  previous_range: { start: string; end: string }
  metrics: Record<
    | 'total_minutes' | 'block_count' | 'avg_block_minutes' | 'flow_rate' | 'avg_rating'
    | 'longest_block_minutes' | 'breaks_skipped' | 'active_days' | 'goal_days' | 'goal_days_met',
    Metric
  >
}
export interface SeriesPoint { label: string; current: number; previous: number }
export interface BreakdownRow { id: number | null; name: string; color: string; current: number; previous: number; category?: string | null }
export interface Breakdown { categories: BreakdownRow[]; tasks: BreakdownRow[] }
export interface RatingRow { rating: Rating; current: number; previous: number }
export interface ProgressionRow { time: string; planned_minutes: number; actual_minutes: number; rating: Rating }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let msg = res.statusText
    try { msg = (await res.json()).detail ?? msg } catch { /* ignore */ }
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

const body = (data: unknown) => JSON.stringify(data)
const qs = (p: Record<string, string | number | null | undefined>) => {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v !== null && v !== undefined && v !== '') u.set(k, String(v))
  const s = u.toString()
  return s ? `?${s}` : ''
}

export const api = {
  categories: () => req<Category[]>('/categories'),
  addCategory: (c: Partial<Category>) => req<Category>('/categories', { method: 'POST', body: body(c) }),
  updateCategory: (id: number, c: Partial<Category>) => req<Category>(`/categories/${id}`, { method: 'PUT', body: body(c) }),
  deleteCategory: (id: number) => req<void>(`/categories/${id}`, { method: 'DELETE' }),

  tasks: (category_id?: number) => req<Task[]>(`/tasks${qs({ category_id })}`),
  addTask: (t: { category_id: number; name: string }) => req<Task>('/tasks', { method: 'POST', body: body(t) }),
  updateTask: (id: number, t: Partial<Task>) => req<Task>(`/tasks/${id}`, { method: 'PATCH', body: body(t) }),
  deleteTask: (id: number) => req<void>(`/tasks/${id}`, { method: 'DELETE' }),

  blocks: (p: { start?: string; end?: string; category_id?: number | null; limit?: number; offset?: number }) =>
    req<{ items: Block[]; total: number }>(`/sessions${qs(p)}`),
  addBlock: (b: Omit<Block, 'id'>) => req<Block>('/sessions', { method: 'POST', body: body(b) }),
  updateBlock: (id: number, b: Partial<Block>) => req<Block>(`/sessions/${id}`, { method: 'PATCH', body: body(b) }),
  deleteBlock: (id: number) => req<void>(`/sessions/${id}`, { method: 'DELETE' }),
  suggest: (planned_minutes: number, rating: Rating) =>
    req<Suggestion>(`/sessions/suggest${qs({ planned_minutes, rating })}`),

  goals: () => req<Goal[]>('/goals'),
  setGoal: (g: { category_id: number | null; target_minutes: number }) =>
    req<Goal>('/goals', { method: 'POST', body: body(g) }),
  deleteGoal: (id: number) => req<void>(`/goals/${id}`, { method: 'DELETE' }),
  settings: () => req<Settings>('/settings'),
  saveSettings: (s: Settings) => req<Settings>('/settings', { method: 'PUT', body: body(s) }),

  summary: (period: Period, date: string, category_id?: number | null) =>
    req<Summary>(`/stats/summary${qs({ period, date, category_id })}`),
  timeseries: (period: Period, date: string, category_id?: number | null) =>
    req<{ points: SeriesPoint[] }>(`/stats/timeseries${qs({ period, date, category_id })}`),
  breakdown: (period: Period, date: string, category_id?: number | null) =>
    req<Breakdown>(`/stats/breakdown${qs({ period, date, category_id })}`),
  ratings: (period: Period, date: string, category_id?: number | null) =>
    req<RatingRow[]>(`/stats/ratings${qs({ period, date, category_id })}`),
  progression: (date: string, category_id?: number | null) =>
    req<ProgressionRow[]>(`/stats/progression${qs({ date, category_id })}`),
  calendar: (year: number, category_id?: number | null) =>
    req<{ date: string; minutes: number }[]>(`/stats/calendar${qs({ year, category_id })}`),
  streak: () => req<{ current: number; longest: number }>('/stats/streak'),
}

// ---- date helpers (local time) -----------------------------------------
export const pad = (n: number) => String(n).padStart(2, '0')
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** Local naive ISO datetime, matching the server's naive datetimes. */
export const isoLocal = (d: Date) => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
export const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m * 10) / 10}m`)
