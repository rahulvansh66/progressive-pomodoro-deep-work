import { useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { addDays, daysInMonth, fmtMin, isoDate, today } from '../logic/dates'
import * as stats from '../logic/stats'
import { RATINGS, type Period } from '../types'
import { useBlocksVersion, useConfigVersion, usePlugin } from './react'

const CUR = '#6366f1'
const PREV = '#94a3b8'
const PERIODS: Period[] = ['day', 'week', 'month', 'year']
const PREV_LABEL: Record<Period, string> = { day: 'yesterday', week: 'last week', month: 'last month', year: 'last year' }

const tooltipStyle = {
  contentStyle: {
    background: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)',
    borderRadius: 8, color: 'var(--text-normal)',
  },
  labelStyle: { color: 'var(--text-normal)' },
}
const axis = { fontSize: 12, stroke: 'var(--text-muted)', tick: { fill: 'var(--text-muted)' } }

function shift(d: string, period: Period, dir: number): string {
  const [y, m, day] = d.split('-').map(Number)
  if (period === 'day') return addDays(d, dir)
  if (period === 'week') return addDays(d, 7 * dir)
  if (period === 'month') {
    const t = new Date(y, m - 1 + dir, 1)
    return isoDate(new Date(t.getFullYear(), t.getMonth(), Math.min(day, daysInMonth(t.getFullYear(), t.getMonth() + 1))))
  }
  return `${y + dir}-${String(m).padStart(2, '0')}-${String(Math.min(day, daysInMonth(y + dir, m))).padStart(2, '0')}`
}

function StatCard({ title, m, fmt, period }: { title: string; m: stats.Metric; fmt: (n: number) => string; period: Period }) {
  const up = m.delta > 0
  const cls = m.delta === 0 ? 'pp-muted' : up ? 'pp-good' : 'pp-bad'
  return (
    <div className="pp-card">
      <p className="pp-label">{title}</p>
      <p className="pp-stat">{fmt(m.current)}</p>
      <p className={`pp-small ${cls}`}>
        {m.delta === 0 ? '— ' : up ? '▲ ' : '▼ '}
        {m.delta_pct !== null ? `${Math.abs(m.delta_pct)}%` : m.previous === 0 && m.current > 0 ? 'new' : ''}
        <span className="pp-muted"> vs {PREV_LABEL[period]} ({fmt(m.previous)})</span>
      </p>
    </div>
  )
}

export default function Dashboard() {
  const plugin = usePlugin()
  const blocksVersion = useBlocksVersion()
  const configVersion = useConfigVersion()
  const [period, setPeriod] = useState<Period>('week')
  const [date, setDate] = useState(today())
  const [category, setCategory] = useState<string | null>(null)

  const { categories, goals } = plugin.data
  const data = useMemo(() => {
    const blocks = plugin.store.all()
    const t = today()
    return {
      summary: stats.summary(blocks, goals, period, date, category, t),
      series: stats.timeseries(blocks, period, date, category),
      breakdown: stats.breakdown(blocks, categories, period, date, category),
      ratings: stats.ratings(blocks, period, date, category).map((r) => ({
        ...r, name: RATINGS.find((x) => x.id === r.rating)?.label ?? r.rating,
      })),
      progression: stats.blockProgression(blocks, date, category),
      calendar: stats.calendar(blocks, Number(date.slice(0, 4)), category),
      streak: stats.streak(blocks, goals, t),
      categoryNames: [...new Set([...categories.map((c) => c.name), ...blocks.map((b) => b.category).filter((c): c is string => !!c)])],
      invalid: plugin.store.invalidCount(),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksVersion, configVersion, period, date, category])

  const { summary } = data
  const m = summary.metrics
  const range = (r: { start: string; end: string }) => (r.start === r.end ? r.start : `${r.start} → ${r.end}`)
  const goalPct = m.goal_days.current ? Math.round((100 * m.goal_days_met.current) / m.goal_days.current) : null
  const catsWithTime = data.breakdown.categories.filter((c) => c.current > 0)

  return (
    <div className="pp-dashboard">
      <div className="pp-row pp-wrap">
        <div className="pp-segmented">
          {PERIODS.map((p) => (
            <button key={p} className={period === p ? 'mod-cta' : ''} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
        <div className="pp-row">
          <button onClick={() => setDate(shift(date, period, -1))} aria-label="Previous">◀</button>
          <button onClick={() => setDate(today())}>Today</button>
          <button onClick={() => setDate(shift(date, period, 1))} aria-label="Next">▶</button>
        </div>
        <select className="dropdown" value={category ?? ''} onChange={(e) => setCategory(e.target.value || null)}>
          <option value="">All categories</option>
          {data.categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="pp-muted"><b>{range(summary.range)}</b> compared with {range(summary.previous_range)}</span>
      </div>

      {data.invalid > 0 && (
        <div className="pp-alert">
          {data.invalid} unreadable line{data.invalid === 1 ? '' : 's'} in the log files {' '}
          ({plugin.store.filesWithInvalid().map((p, i) => (
            <span key={p}>{i > 0 && ', '}<a onClick={() => void plugin.app.workspace.openLinkText(p, '', false)}>{p.split('/').pop()}</a></span>
          ))}). They're skipped in stats.
        </div>
      )}

      <div className="pp-grid4">
        <StatCard title="Focus time" m={m.total_minutes} fmt={fmtMin} period={period} />
        <StatCard title="Blocks" m={m.block_count} fmt={String} period={period} />
        <StatCard title="Avg block" m={m.avg_block_minutes} fmt={fmtMin} period={period} />
        <StatCard title="Longest block" m={m.longest_block_minutes} fmt={fmtMin} period={period} />
        <StatCard title="Flow rate" m={m.flow_rate} fmt={(n) => `${n}%`} period={period} />
        <StatCard title="Avg focus (1–4)" m={m.avg_rating} fmt={(n) => n.toFixed(2)} period={period} />
        <StatCard title="Active days" m={m.active_days} fmt={String} period={period} />
        <StatCard title="Goal days met" m={m.goal_days_met} fmt={String} period={period} />
      </div>

      <div className="pp-grid3c">
        <div className="pp-card">
          <p className="pp-label">Daily goal</p>
          {goalPct === null ? (
            <p className="pp-muted">No goal set — add one in the plugin settings.</p>
          ) : (
            <>
              <p className="pp-stat">{m.goal_days_met.current}/{m.goal_days.current} days</p>
              <div className="pp-bar"><div style={{ width: `${goalPct}%` }} /></div>
            </>
          )}
        </div>
        <div className="pp-card">
          <p className="pp-label">Goal streak</p>
          <p className="pp-stat">🔥 {data.streak.current} <span className="pp-small pp-muted">days</span></p>
          <p className="pp-small pp-muted">Longest: {data.streak.longest} days</p>
        </div>
        <div className="pp-card">
          <p className="pp-label">Breaks skipped</p>
          <p className="pp-stat">{m.breaks_skipped.current}</p>
          <p className="pp-small pp-muted">{PREV_LABEL[period]}: {m.breaks_skipped.previous}</p>
        </div>
      </div>

      <div className="pp-card">
        <h4>Focus minutes — this {period} vs {PREV_LABEL[period]}</h4>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data.series}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} />
            <Tooltip {...tooltipStyle} />
            <Legend />
            <Bar dataKey="current" name="Current" fill={CUR} radius={[4, 4, 0, 0]} />
            <Line dataKey="previous" name="Previous" stroke={PREV} strokeWidth={2} dot={false} strokeDasharray="5 4" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="pp-grid2c">
        <div className="pp-card">
          <h4>By category</h4>
          {catsWithTime.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={catsWithTime} dataKey="current" nameKey="name" innerRadius={55} outerRadius={90}>
                  {catsWithTime.map((c) => <Cell key={c.id} fill={c.color} />)}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(v) => fmtMin(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="pp-empty">No data in this period.</p>}
        </div>
        <div className="pp-card">
          <h4>Category comparison</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.breakdown.categories}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...tooltipStyle} formatter={(v) => fmtMin(Number(v))} />
              <Legend />
              <Bar dataKey="current" name="Current" fill={CUR} radius={[4, 4, 0, 0]} />
              <Bar dataKey="previous" name="Previous" fill={PREV} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="pp-card">
          <h4>Focus ratings</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.ratings}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" {...axis} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip {...tooltipStyle} />
              <Legend />
              <Bar dataKey="current" name="Current" fill={CUR} radius={[4, 4, 0, 0]} />
              <Bar dataKey="previous" name="Previous" fill={PREV} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="pp-card">
          <h4>Top tasks</h4>
          {data.breakdown.tasks.length ? (
            <ul className="pp-list">
              {data.breakdown.tasks.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <span className="pp-row pp-truncate">
                    <span className="pp-dot" style={{ background: t.color }} />
                    <a onClick={() => void plugin.app.workspace.openLinkText(t.name, '', false)}>{t.name}</a>
                  </span>
                  <span className="pp-muted pp-num">{fmtMin(t.current)} <span className="pp-small">(prev {fmtMin(t.previous)})</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="pp-empty">No task data in this period.</p>}
        </div>
      </div>

      <div className="pp-card">
        <h4>Block progression — {date}</h4>
        <p className="pp-small pp-muted">Planned length per block through the day: start small, grow into flow.</p>
        {data.progression.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.progression}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="time" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...tooltipStyle} formatter={(v, n) => [`${v} min`, n]}
                labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.rating ?? ''}`} />
              <Line dataKey="planned_minutes" name="Planned" stroke={CUR} strokeWidth={2}
                dot={(p: { cx?: number; cy?: number; payload?: stats.ProgressionRow; index?: number }) => (
                  <circle key={p.index} cx={p.cx} cy={p.cy} r={6} fill={RATINGS.find((r) => r.id === p.payload?.rating)?.color ?? CUR} />
                )} />
              <Line dataKey="actual_minutes" name="Actual" stroke={PREV} strokeDasharray="5 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <p className="pp-empty">No blocks on this day. Use ◀ ▶ to browse.</p>}
        <div className="pp-row pp-wrap pp-small pp-muted">
          {RATINGS.map((r) => <span key={r.id} className="pp-row"><span className="pp-dot" style={{ background: r.color }} />{r.label}</span>)}
        </div>
      </div>

      <Heatmap data={data.calendar} year={Number(date.slice(0, 4))} />
    </div>
  )
}

function Heatmap({ data, year }: { data: { date: string; minutes: number }[]; year: number }) {
  const { weeks, max } = useMemo(() => {
    const offset = (new Date(year, 0, 1).getDay() + 6) % 7 // Monday-first
    const cells: ({ date: string; minutes: number } | null)[] = [...Array<null>(offset).fill(null), ...data]
    const w: (typeof cells)[] = []
    for (let i = 0; i < cells.length; i += 7) w.push(cells.slice(i, i + 7))
    return { weeks: w, max: Math.max(1, ...data.map((d) => d.minutes)) }
  }, [data, year])
  const shade = (m: number) => (m === 0 ? 0.08 : 0.25 + 0.75 * Math.min(1, m / max))
  return (
    <div className="pp-card pp-scroll-x">
      <h4>{year} activity</h4>
      <div className="pp-heatmap">
        {weeks.map((w, i) => (
          <div key={i}>
            {w.map((c, j) => (
              <div key={j} title={c ? `${c.date}: ${fmtMin(c.minutes)}` : ''}
                style={c ? { background: CUR, opacity: shade(c.minutes) } : undefined} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
