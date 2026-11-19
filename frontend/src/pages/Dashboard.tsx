import { useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, Pie, PieChart, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  api, fmtMin, isoDate, RATINGS,
  type Breakdown, type Category, type Metric, type Period, type ProgressionRow, type RatingRow,
  type SeriesPoint, type Summary,
} from '../api'

const CUR = '#6366f1'
const PREV = '#94a3b8'
const PERIODS: Period[] = ['day', 'week', 'month', 'year']
const PREV_LABEL: Record<Period, string> = { day: 'yesterday', week: 'last week', month: 'last month', year: 'last year' }

function shift(d: Date, period: Period, dir: number) {
  const n = new Date(d)
  if (period === 'day') n.setDate(n.getDate() + dir)
  else if (period === 'week') n.setDate(n.getDate() + 7 * dir)
  else if (period === 'month') { n.setDate(1); n.setMonth(n.getMonth() + dir) }
  else { n.setDate(1); n.setFullYear(n.getFullYear() + dir) }
  return n
}

function StatCard({ title, m, fmt, period, invert }: {
  title: string; m: Metric | undefined; fmt: (n: number) => string; period: Period; invert?: boolean
}) {
  if (!m) return null
  const up = m.delta > 0
  const good = invert ? !up : up
  const color = m.delta === 0 ? 'text-slate-500' : good ? 'text-emerald-600' : 'text-red-600'
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{fmt(m.current)}</p>
      <p className={`mt-1 text-xs ${color}`}>
        {m.delta === 0 ? '— ' : up ? '▲ ' : '▼ '}
        {m.delta_pct !== null ? `${Math.abs(m.delta_pct)}%` : m.previous === 0 && m.current > 0 ? 'new' : ''}
        <span className="text-slate-500"> vs {PREV_LABEL[period]} ({fmt(m.previous)})</span>
      </p>
    </div>
  )
}

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>('week')
  const [date, setDate] = useState(new Date())
  const [cats, setCats] = useState<Category[]>([])
  const [catId, setCatId] = useState<number | null>(null)
  const [summary, setSummary] = useState<Summary>()
  const [series, setSeries] = useState<SeriesPoint[]>([])
  const [breakdown, setBreakdown] = useState<Breakdown>()
  const [ratings, setRatings] = useState<RatingRow[]>([])
  const [progression, setProgression] = useState<ProgressionRow[]>([])
  const [calendar, setCalendar] = useState<{ date: string; minutes: number }[]>([])
  const [streak, setStreak] = useState({ current: 0, longest: 0 })
  const [error, setError] = useState('')

  const ds = isoDate(date)
  useEffect(() => { api.categories().then(setCats).catch(() => {}); api.streak().then(setStreak).catch(() => {}) }, [])
  useEffect(() => {
    setError('')
    Promise.all([
      api.summary(period, ds, catId), api.timeseries(period, ds, catId), api.breakdown(period, ds, catId),
      api.ratings(period, ds, catId), api.progression(ds, catId), api.calendar(date.getFullYear(), catId),
    ]).then(([s, t, b, r, p, c]) => {
      setSummary(s); setSeries(t.points); setBreakdown(b); setRatings(r); setProgression(p); setCalendar(c)
    }).catch((e) => setError(e.message))
  }, [period, ds, catId, date])

  const m = summary?.metrics
  const rangeLabel = summary
    ? summary.range.start === summary.range.end ? summary.range.start : `${summary.range.start} → ${summary.range.end}`
    : ''
  const prevLabel = summary
    ? summary.previous_range.start === summary.previous_range.end
      ? summary.previous_range.start : `${summary.previous_range.start} → ${summary.previous_range.end}`
    : ''
  const isCurrent = ds === isoDate(new Date())

  const ratingData = ratings.map((r) => ({ ...r, name: RATINGS.find((x) => x.id === r.rating)?.label ?? r.rating }))
  const goalPct = m && m.goal_days.current ? Math.round((100 * m.goal_days_met.current) / m.goal_days.current) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
          {PERIODS.map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm capitalize ${period === p ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button className="btn-ghost" onClick={() => setDate(shift(date, period, -1))}>◀</button>
          <button className="btn-ghost" disabled={isCurrent && period === 'day'} onClick={() => setDate(new Date())}>Today</button>
          <button className="btn-ghost" onClick={() => setDate(shift(date, period, 1))}>▶</button>
        </div>
        <select className="input" value={catId ?? ''} onChange={(e) => setCatId(e.target.value ? +e.target.value : null)}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="text-sm text-slate-500">
          <b className="text-slate-800 dark:text-slate-200">{rangeLabel}</b> compared with {prevLabel}
        </div>
      </div>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard title="Focus time" m={m?.total_minutes} fmt={fmtMin} period={period} />
        <StatCard title="Blocks" m={m?.block_count} fmt={(n) => String(n)} period={period} />
        <StatCard title="Avg block" m={m?.avg_block_minutes} fmt={fmtMin} period={period} />
        <StatCard title="Longest block" m={m?.longest_block_minutes} fmt={fmtMin} period={period} />
        <StatCard title="Flow rate" m={m?.flow_rate} fmt={(n) => `${n}%`} period={period} />
        <StatCard title="Avg focus (1–4)" m={m?.avg_rating} fmt={(n) => n.toFixed(2)} period={period} />
        <StatCard title="Active days" m={m?.active_days} fmt={(n) => String(n)} period={period} />
        <StatCard title="Goal days met" m={m?.goal_days_met} fmt={(n) => String(n)} period={period} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Daily goal</p>
          {goalPct === null ? (
            <p className="mt-2 text-sm text-slate-500">No goal set — add one on the Manage page.</p>
          ) : (
            <>
              <p className="mt-1 text-2xl font-semibold">{m!.goal_days_met.current}/{m!.goal_days.current} days</p>
              <div className="mt-2 h-2 rounded bg-slate-200 dark:bg-slate-800">
                <div className="h-2 rounded bg-emerald-500" style={{ width: `${goalPct}%` }} />
              </div>
            </>
          )}
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Goal streak</p>
          <p className="mt-1 text-2xl font-semibold">🔥 {streak.current} <span className="text-sm font-normal text-slate-500">days</span></p>
          <p className="text-xs text-slate-500">Longest: {streak.longest} days</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Breaks skipped</p>
          <p className="mt-1 text-2xl font-semibold">{m?.breaks_skipped.current ?? 0}</p>
          <p className="text-xs text-slate-500">{PREV_LABEL[period]}: {m?.breaks_skipped.previous ?? 0}</p>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-2 font-medium">Focus minutes — this {period} vs {PREV_LABEL[period]}</h3>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={series}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="label" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Legend />
            <Bar dataKey="current" name="Current" fill={CUR} radius={[4, 4, 0, 0]} />
            <Line dataKey="previous" name="Previous" stroke={PREV} strokeWidth={2} dot={false} strokeDasharray="5 4" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="card">
          <h3 className="mb-2 font-medium">By category</h3>
          {breakdown && breakdown.categories.some((c) => c.current > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={breakdown.categories.filter((c) => c.current > 0)} dataKey="current" nameKey="name" innerRadius={55} outerRadius={90}>
                  {breakdown.categories.filter((c) => c.current > 0).map((c, i) => <Cell key={i} fill={c.color} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtMin(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="py-16 text-center text-sm text-slate-500">No data in this period.</p>}
        </div>
        <div className="card">
          <h3 className="mb-2 font-medium">Category comparison</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={breakdown?.categories ?? []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v) => fmtMin(Number(v))} />
              <Legend />
              <Bar dataKey="current" name="Current" fill={CUR} radius={[4, 4, 0, 0]} />
              <Bar dataKey="previous" name="Previous" fill={PREV} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="mb-2 font-medium">Focus ratings</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ratingData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Legend />
              <Bar dataKey="current" name="Current" fill={CUR} radius={[4, 4, 0, 0]} />
              <Bar dataKey="previous" name="Previous" fill={PREV} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="mb-2 font-medium">Top tasks</h3>
          {breakdown && breakdown.tasks.length ? (
            <ul className="space-y-2 text-sm">
              {breakdown.tasks.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 truncate">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
                    {t.name}
                  </span>
                  <span className="tabular-nums text-slate-500">{fmtMin(t.current)} <span className="text-xs">(prev {fmtMin(t.previous)})</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="py-16 text-center text-sm text-slate-500">No task data in this period.</p>}
        </div>
      </div>

      <div className="card">
        <h3 className="mb-1 font-medium">Block progression — {ds}</h3>
        <p className="mb-2 text-xs text-slate-500">Planned length per block through the day: start small, grow into flow.</p>
        {progression.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={progression}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="time" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v, n) => [`${v} min`, n]} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.rating ?? ''}`} />
              <Line dataKey="planned_minutes" name="Planned" stroke={CUR} strokeWidth={2}
                dot={(p: { cx?: number; cy?: number; payload?: ProgressionRow; index?: number }) => (
                  <circle key={p.index} cx={p.cx} cy={p.cy} r={6} fill={RATINGS.find((r) => r.id === p.payload?.rating)?.color ?? CUR} />
                )} />
              <Line dataKey="actual_minutes" name="Actual" stroke={PREV} strokeDasharray="5 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <p className="py-10 text-center text-sm text-slate-500">No blocks on this day. Use ◀ ▶ to browse.</p>}
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
          {RATINGS.map((r) => <span key={r.id} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />{r.label}</span>)}
        </div>
      </div>

      <Heatmap data={calendar} year={date.getFullYear()} />
    </div>
  )
}

function Heatmap({ data, year }: { data: { date: string; minutes: number }[]; year: number }) {
  const { weeks, max } = useMemo(() => {
    const first = new Date(year, 0, 1)
    const offset = (first.getDay() + 6) % 7 // Monday-first
    const cells: ({ date: string; minutes: number } | null)[] = Array(offset).fill(null).concat(data)
    const w: typeof cells[] = []
    for (let i = 0; i < cells.length; i += 7) w.push(cells.slice(i, i + 7))
    return { weeks: w, max: Math.max(1, ...data.map((d) => d.minutes)) }
  }, [data, year])
  const shade = (m: number) => (m === 0 ? 0.08 : 0.25 + 0.75 * Math.min(1, m / max))
  return (
    <div className="card overflow-x-auto">
      <h3 className="mb-2 font-medium">{year} activity</h3>
      <div className="flex gap-[3px]">
        {weeks.map((w, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {w.map((c, j) => (
              <div key={j} title={c ? `${c.date}: ${fmtMin(c.minutes)}` : ''}
                className="h-3 w-3 rounded-sm" style={c ? { background: CUR, opacity: shade(c.minutes) } : undefined} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
