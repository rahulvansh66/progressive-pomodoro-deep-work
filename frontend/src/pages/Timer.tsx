import { useEffect, useMemo, useRef, useState } from 'react'
import {
  api, fmtMin, isoLocal, RATINGS,
  type Category, type Rating, type Settings, type Suggestion, type Task,
} from '../api'

type Phase = 'idle' | 'running' | 'rating' | 'decide' | 'break'

interface Persisted {
  phase: Phase
  plannedMinutes: number
  startedAt: number // epoch ms
  endedAt?: number
  categoryId: number | null
  taskId: number | null
  rating?: Rating
  breakUntil?: number
  breakStarted?: number
}

const KEY = 'pomo.timer.v1'
const load = (): Persisted | null => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { return null }
}
const save = (s: Persisted | null) => {
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY) } catch { /* ignore */ }
}

const mmss = (sec: number) => {
  const s = Math.abs(Math.floor(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function Timer() {
  const [cats, setCats] = useState<Category[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [state, setState] = useState<Persisted | null>(load)
  const [planned, setPlanned] = useState(5)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [taskId, setTaskId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [nextMin, setNextMin] = useState(5)
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState('')
  const [todayMinutes, setTodayMinutes] = useState(0)
  const saving = useRef(false)

  const update = (s: Persisted | null) => { setState(s); save(s) }

  useEffect(() => {
    Promise.all([api.categories(), api.settings()])
      .then(([c, s]) => {
        setCats(c.filter((x) => !x.archived))
        setSettings(s)
        if (!load()) setPlanned(s.default_start_minutes)
      })
      .catch((e) => setError(e.message))
    refreshToday()
  }, [])

  useEffect(() => {
    api.tasks(categoryId ?? undefined).then((t) => setTasks(t.filter((x) => !x.done))).catch(() => {})
  }, [categoryId])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  function refreshToday() {
    const d = new Date()
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    api.summary('day', day).then((s) => setTodayMinutes(s.metrics.total_minutes.current)).catch(() => {})
  }

  // End of a break returns the user to idle with the suggested next length.
  useEffect(() => {
    if (state?.phase === 'break' && state.breakUntil && now >= state.breakUntil) finishBreak()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, state])

  const elapsed = state?.phase === 'running' ? (now - state.startedAt) / 1000 : 0
  const remaining = state ? state.plannedMinutes * 60 - elapsed : 0
  const overrun = state?.phase === 'running' && remaining < 0
  const progress = state?.phase === 'running' ? Math.min(1, elapsed / (state.plannedMinutes * 60)) : 0

  const selectedCat = useMemo(() => cats.find((c) => c.id === categoryId), [cats, categoryId])

  function start(minutes: number) {
    update({ phase: 'running', plannedMinutes: minutes, startedAt: Date.now(), categoryId, taskId })
  }

  function stop() {
    if (!state) return
    update({ ...state, phase: 'rating', endedAt: Date.now() })
  }

  async function rate(r: Rating) {
    if (!state || saving.current) return
    saving.current = true
    setError('')
    try {
      const sug = await api.suggest(state.plannedMinutes, r)
      setSuggestion(sug)
      setNextMin(sug.next_minutes)
      update({ ...state, phase: 'decide', rating: r })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      saving.current = false
    }
  }

  async function persist(breakTaken: boolean, breakSeconds: number) {
    if (!state || !state.rating || !state.endedAt) return
    await api.addBlock({
      category_id: state.categoryId,
      task_id: state.taskId,
      planned_minutes: state.plannedMinutes,
      actual_seconds: Math.max(1, Math.round((state.endedAt - state.startedAt) / 1000)),
      started_at: isoLocal(new Date(state.startedAt)),
      ended_at: isoLocal(new Date(state.endedAt)),
      rating: state.rating,
      break_taken: breakTaken,
      break_seconds: breakSeconds,
      note: note.trim() || null,
    })
    setNote('')
    refreshToday()
  }

  async function proceed(takeBreak: boolean) {
    if (!state || !suggestion || saving.current) return
    saving.current = true
    setError('')
    try {
      if (takeBreak) {
        const secs = suggestion.break_minutes * 60
        await persist(true, secs)
        setPlanned(nextMin)
        update({ ...state, phase: 'break', breakStarted: Date.now(), breakUntil: Date.now() + secs * 1000 })
      } else {
        await persist(false, 0)
        setPlanned(nextMin)
        // Keep flowing: start the next block immediately.
        update({ phase: 'running', plannedMinutes: nextMin, startedAt: Date.now(), categoryId: state.categoryId, taskId: state.taskId })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      saving.current = false
    }
  }

  function finishBreak() {
    update(null)
  }

  function discard() {
    if (confirm('Discard this block without saving?')) update(null)
  }

  const min = settings?.min_block_minutes ?? 2
  const max = settings?.max_block_minutes ?? 60
  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  const r = 90
  const circ = 2 * Math.PI * r

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}

      <div className="card text-center">
        <p className="mb-2 text-sm text-slate-500">Today: <b>{fmtMin(todayMinutes)}</b> focused</p>

        {(!state || state.phase === 'idle') && (
          <div className="space-y-4">
            <div className="flex flex-wrap justify-center gap-2">
              <select className="input" value={categoryId ?? ''} onChange={(e) => { setCategoryId(e.target.value ? +e.target.value : null); setTaskId(null) }}>
                <option value="">No category</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="input" value={taskId ?? ''} onChange={(e) => setTaskId(e.target.value ? +e.target.value : null)} disabled={!categoryId}>
                <option value="">No task</option>
                {tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <p className="mb-2 text-sm text-slate-500">Block length — the more resistance you feel, the shorter it should be</p>
              <div className="flex items-center justify-center gap-3">
                <button className="btn-ghost" onClick={() => setPlanned(clamp(planned - 1))}>−</button>
                <span className="w-24 text-4xl font-semibold tabular-nums">{planned}m</span>
                <button className="btn-ghost" onClick={() => setPlanned(clamp(planned + 1))}>+</button>
              </div>
              <div className="mt-3 flex justify-center gap-2">
                {[2, 3, 5, 10, 15, 25].map((m) => (
                  <button key={m} className={planned === m ? 'btn-primary' : 'btn-ghost'} onClick={() => setPlanned(m)}>{m}</button>
                ))}
              </div>
            </div>
            <button className="btn-primary w-full py-3 text-base" onClick={() => start(planned)}>
              Start {planned}-minute block
            </button>
          </div>
        )}

        {state?.phase === 'running' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              {selectedCat?.name ?? cats.find((c) => c.id === state.categoryId)?.name ?? 'Focus block'}
            </p>
            <div className="relative mx-auto h-56 w-56">
              <svg viewBox="0 0 200 200" className="-rotate-90">
                <circle cx="100" cy="100" r={r} fill="none" strokeWidth="10" className="stroke-slate-200 dark:stroke-slate-800" />
                <circle cx="100" cy="100" r={r} fill="none" strokeWidth="10" strokeLinecap="round"
                  stroke={overrun ? '#f59e0b' : '#6366f1'}
                  strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-semibold tabular-nums">{overrun ? '+' : ''}{mmss(remaining)}</span>
                <span className="text-xs text-slate-500">{overrun ? 'still flowing? keep going' : `of ${state.plannedMinutes} min`}</span>
              </div>
            </div>
            {overrun && <p className="text-sm text-amber-600">Timer's up — if you're flowing, keep on flowing.</p>}
            <div className="flex justify-center gap-2">
              <button className="btn-primary" onClick={stop}>Finish block</button>
              <button className="btn-danger" onClick={discard}>Discard</button>
            </div>
          </div>
        )}

        {state?.phase === 'rating' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">How focused were you?</h2>
            <p className="text-sm text-slate-500">Be honest — it's fine to be distracted.</p>
            <div className="grid grid-cols-2 gap-3">
              {RATINGS.map((x) => (
                <button key={x.id} className="btn-ghost flex-col gap-1 py-4" onClick={() => rate(x.id)}>
                  <span className="text-2xl">{x.emoji}</span>{x.label}
                </button>
              ))}
            </div>
            <textarea className="input w-full" rows={2} placeholder="Optional note…" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-danger" onClick={discard}>Discard block</button>
          </div>
        )}

        {state?.phase === 'decide' && suggestion && (
          <div className="space-y-4">
            <p className="text-lg">{suggestion.message}</p>
            <div>
              <p className="mb-1 text-sm text-slate-500">Next block length</p>
              <div className="flex items-center justify-center gap-3">
                <button className="btn-ghost" onClick={() => setNextMin(clamp(nextMin - 1))}>−</button>
                <span className="w-24 text-3xl font-semibold tabular-nums">{nextMin}m</span>
                <button className="btn-ghost" onClick={() => setNextMin(clamp(nextMin + 1))}>+</button>
              </div>
            </div>
            {suggestion.take_break ? (
              <div className="flex flex-col gap-2">
                <button className="btn-primary" onClick={() => proceed(true)}>Take a {suggestion.break_minutes}-minute break</button>
                <button className="btn-ghost" onClick={() => proceed(false)}>Skip break, start next block</button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button className="btn-primary" onClick={() => proceed(false)}>Keep flowing → {nextMin}m block</button>
                <button className="btn-ghost" onClick={() => { setSuggestion({ ...suggestion, take_break: true, break_minutes: settings?.break_minutes ?? 5 }) }}>
                  Take a break anyway
                </button>
              </div>
            )}
          </div>
        )}

        {state?.phase === 'break' && state.breakUntil && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Break ☕</h2>
            <p className="text-5xl font-semibold tabular-nums">{mmss(Math.max(0, (state.breakUntil - now) / 1000))}</p>
            <p className="text-sm text-slate-500">Next block: {planned} min</p>
            <button className="btn-primary" onClick={finishBreak}>End break & set up next block</button>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-slate-500">
        Start small → rate your focus → skip the break if you're flowing → adjust the next block.
      </p>
    </div>
  )
}
