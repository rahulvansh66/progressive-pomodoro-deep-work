import { useCallback, useEffect, useState } from 'react'
import { api, type Category, type Goal, type Settings, type Task } from '../api'

export default function Manage() {
  const [cats, setCats] = useState<Category[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [settings, setSettings] = useState<Settings>()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [taskNames, setTaskNames] = useState<Record<number, string>>({})
  const [goalCat, setGoalCat] = useState<number | null>(null)
  const [goalMin, setGoalMin] = useState(60)
  const [msg, setMsg] = useState('')

  const reload = useCallback(async () => {
    const [c, t, g, s] = await Promise.all([api.categories(), api.tasks(), api.goals(), api.settings()])
    setCats(c); setTasks(t); setGoals(g); setSettings(s)
  }, [])
  useEffect(() => { reload().catch((e) => setMsg(e.message)) }, [reload])

  const run = (fn: () => Promise<unknown>) => async () => {
    setMsg('')
    try { await fn(); await reload() } catch (e) { setMsg((e as Error).message) }
  }

  const currentGoal = (cid: number | null) => goals.find((g) => g.category_id === cid && g.effective_from <= new Date().toISOString().slice(0, 10))
  const catName = (id: number | null) => (id === null ? 'Overall' : cats.find((c) => c.id === id)?.name ?? '?')

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {msg && <div className="col-span-full rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{msg}</div>}

      <section className="card space-y-3">
        <h2 className="font-semibold">Categories &amp; tasks</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(async () => { await api.addCategory({ name: name.trim(), color }); setName('') })() }}>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-12 rounded" />
          <input className="input flex-1" placeholder="New category (e.g. Coding)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn-primary">Add</button>
        </form>
        <div className="space-y-3">
          {cats.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <input type="color" value={c.color} className="h-7 w-8" onChange={(e) => { const v = e.target.value; run(() => api.updateCategory(c.id, { ...c, color: v }))() }} />
                <span className="flex-1 font-medium">{c.name}{c.archived && <em className="ml-2 text-xs text-slate-500">archived</em>}</span>
                <button className="btn-ghost px-2 py-1" onClick={run(() => api.updateCategory(c.id, { ...c, archived: !c.archived }))}>{c.archived ? 'Unarchive' : 'Archive'}</button>
                <button className="btn-danger px-2 py-1" onClick={() => confirm(`Delete "${c.name}" and its tasks? Past blocks are kept.`) && run(() => api.deleteCategory(c.id))()}>Delete</button>
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {tasks.filter((t) => t.category_id === c.id).map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={t.done} onChange={run(() => api.updateTask(t.id, { done: !t.done }))} />
                    <span className={`flex-1 ${t.done ? 'text-slate-400 line-through' : ''}`}>{t.name}</span>
                    <button className="text-xs text-red-600" onClick={run(() => api.deleteTask(t.id))}>✕</button>
                  </li>
                ))}
              </ul>
              <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = (taskNames[c.id] ?? '').trim(); if (n) run(async () => { await api.addTask({ category_id: c.id, name: n }); setTaskNames({ ...taskNames, [c.id]: '' }) })() }}>
                <input className="input flex-1 py-1" placeholder="Add task…" value={taskNames[c.id] ?? ''} onChange={(e) => setTaskNames({ ...taskNames, [c.id]: e.target.value })} />
                <button className="btn-ghost py-1">Add</button>
              </form>
            </div>
          ))}
          {!cats.length && <p className="text-sm text-slate-500">No categories yet.</p>}
        </div>
      </section>

      <div className="space-y-4">
        <section className="card space-y-3">
          <h2 className="font-semibold">Daily focus goals</h2>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(() => api.setGoal({ category_id: goalCat, target_minutes: goalMin }))() }}>
            <select className="input" value={goalCat ?? ''} onChange={(e) => setGoalCat(e.target.value ? +e.target.value : null)}>
              <option value="">Overall</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="input w-24" type="number" min={0} value={goalMin} onChange={(e) => setGoalMin(+e.target.value)} />
            <span className="self-center text-sm text-slate-500">min / day</span>
            <button className="btn-primary">Set from today</button>
          </form>
          <p className="text-xs text-slate-500">Changing a goal only affects today onward; past days keep the goal they had.</p>
          <ul className="space-y-1 text-sm">
            {[null, ...cats.map((c) => c.id)].map((id) => {
              const g = currentGoal(id)
              return g ? <li key={String(id)}>{catName(id)}: <b>{g.target_minutes} min</b> <span className="text-slate-500">(since {g.effective_from})</span></li> : null
            })}
          </ul>
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500">Goal history</summary>
            <ul className="mt-1 space-y-1">
              {goals.map((g) => (
                <li key={g.id} className="flex justify-between">
                  <span>{g.effective_from} · {catName(g.category_id)} · {g.target_minutes} min</span>
                  <button className="text-xs text-red-600" onClick={run(() => api.deleteGoal(g.id))}>✕</button>
                </li>
              ))}
            </ul>
          </details>
        </section>

        {settings && (
          <section className="card space-y-3">
            <h2 className="font-semibold">Progressive Pomodoro settings</h2>
            <form className="grid grid-cols-2 gap-3 text-sm" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.saveSettings(settings); setMsg('') })() }}>
              {([
                ['default_start_minutes', 'Default start (min)'],
                ['min_block_minutes', 'Min block (min)'],
                ['max_block_minutes', 'Max block (min)'],
                ['focused_step', '“Highly focused” increase'],
                ['flow_step', '“Flow” increase'],
                ['break_minutes', 'Break length (min)'],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex flex-col gap-1">
                  {label}
                  <input className="input" type="number" value={settings[k]} onChange={(e) => setSettings({ ...settings, [k]: +e.target.value })} />
                </label>
              ))}
              <button className="btn-primary col-span-2">Save settings</button>
            </form>
          </section>
        )}
      </div>
    </div>
  )
}
