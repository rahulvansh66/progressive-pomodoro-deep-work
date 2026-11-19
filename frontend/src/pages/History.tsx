import { useCallback, useEffect, useState } from 'react'
import { api, fmtMin, RATINGS, type Block, type Category, type Rating } from '../api'

const PAGE = 25

export default function History() {
  const [items, setItems] = useState<Block[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [cats, setCats] = useState<Category[]>([])
  const [catId, setCatId] = useState<number | null>(null)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api.blocks({ start, end, category_id: catId, limit: PAGE, offset })
      .then((r) => { setItems(r.items); setTotal(r.total) })
      .catch((e) => setError(e.message))
  }, [start, end, catId, offset])

  useEffect(() => { api.categories().then(setCats).catch(() => {}) }, [])
  useEffect(load, [load])

  const cat = (id: number | null) => cats.find((c) => c.id === id)

  const patch = async (id: number, body: Partial<Block>) => {
    try { await api.updateBlock(id, body); load() } catch (e) { setError((e as Error).message) }
  }
  const remove = async (id: number) => {
    if (!confirm('Delete this block?')) return
    try { await api.deleteBlock(id); load() } catch (e) { setError((e as Error).message) }
  }
  const reset = (fn: () => void) => { setOffset(0); fn() }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" className="input" value={start} onChange={(e) => reset(() => setStart(e.target.value))} />
        <span className="text-slate-500">to</span>
        <input type="date" className="input" value={end} onChange={(e) => reset(() => setEnd(e.target.value))} />
        <select className="input" value={catId ?? ''} onChange={(e) => reset(() => setCatId(e.target.value ? +e.target.value : null))}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="ml-auto text-sm text-slate-500">{total} blocks</span>
      </div>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800">
            <tr><th className="p-3">When</th><th>Category</th><th>Planned</th><th>Actual</th><th>Rating</th><th>Break</th><th>Note</th><th /></tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="p-3 whitespace-nowrap">{b.started_at.replace('T', ' ').slice(0, 16)}</td>
                <td>
                  {cat(b.category_id) ? (
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: cat(b.category_id)!.color }} />{cat(b.category_id)!.name}</span>
                  ) : '—'}
                </td>
                <td>{b.planned_minutes}m</td>
                <td>{fmtMin(b.actual_seconds / 60)}</td>
                <td>
                  <select className="input py-1" value={b.rating} onChange={(e) => patch(b.id, { rating: e.target.value as Rating })}>
                    {RATINGS.map((r) => <option key={r.id} value={r.id}>{r.emoji} {r.label}</option>)}
                  </select>
                </td>
                <td>{b.break_taken ? `${Math.round(b.break_seconds / 60)}m` : 'skipped'}</td>
                <td>
                  <input className="input w-48 py-1" defaultValue={b.note ?? ''} placeholder="note"
                    onBlur={(e) => e.target.value !== (b.note ?? '') && patch(b.id, { note: e.target.value })} />
                </td>
                <td><button className="btn-danger px-2 py-1" onClick={() => remove(b.id)}>Delete</button></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={8} className="p-6 text-center text-slate-500">No blocks found.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between">
        <button className="btn-ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>← Newer</button>
        <button className="btn-ghost" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Older →</button>
      </div>
    </div>
  )
}
