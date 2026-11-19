import { Notice, TFile } from 'obsidian'
import { useMemo, useState } from 'react'
import { fmtMin } from '../logic/dates'
import { findBlockLine } from '../logic/format'
import { ConfirmModal } from '../modals/ConfirmModal'
import { RATINGS, type Block, type Rating } from '../types'
import { useBlocksVersion, useConfigVersion, usePlugin } from './react'

const PAGE = 25

export default function History() {
  const plugin = usePlugin()
  const { store } = plugin
  const blocksVersion = useBlocksVersion()
  useConfigVersion()
  const [offset, setOffset] = useState(0)
  const [category, setCategory] = useState<string | null>(null)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const all = useMemo(() => store.all(), [blocksVersion, store])
  const filtered = useMemo(
    () => all
      .filter((b) => (!start || b.date >= start) && (!end || b.date <= end) && (category === null || b.category === category))
      .slice()
      .reverse(), // newest first
    [all, start, end, category],
  )
  const items = filtered.slice(offset, offset + PAGE)
  const categoryNames = useMemo(
    () => [...new Set([...plugin.data.categories.map((c) => c.name), ...all.map((b) => b.category).filter((c): c is string => !!c)])],
    [all, plugin.data.categories],
  )
  const color = (name: string | null) => plugin.data.categories.find((c) => c.name === name)?.color ?? '#94a3b8'

  const reset = (fn: () => void) => { setOffset(0); fn() }
  const fail = (e: unknown) => { new Notice(`Progressive Pomodoro: ${(e as Error).message}`) }

  const patch = (b: Block, p: Partial<Pick<Block, 'rating' | 'note'>>) => { store.update(b.id, p).catch(fail) }
  const remove = (b: Block) =>
    new ConfirmModal(plugin.app, `Delete the ${b.time.slice(0, 5)} block on ${b.date}?`, 'Delete', () => store.remove(b.id).catch(fail)).open()

  /** Open the daily log file at this block's line. */
  const openLine = async (b: Block) => {
    const file = plugin.app.vault.getAbstractFileByPath(store.pathFor(b.date))
    if (!(file instanceof TFile)) return
    const line = findBlockLine(await plugin.app.vault.cachedRead(file), b.date, b.id)
    await plugin.app.workspace.getLeaf(false).openFile(file, { eState: { line: Math.max(0, line) } })
  }

  return (
    <div className="pp-history">
      <div className="pp-row pp-wrap">
        <input type="date" value={start} onChange={(e) => reset(() => setStart(e.target.value))} aria-label="From" />
        <span className="pp-muted">to</span>
        <input type="date" value={end} onChange={(e) => reset(() => setEnd(e.target.value))} aria-label="To" />
        <select className="dropdown" value={category ?? ''} onChange={(e) => reset(() => setCategory(e.target.value || null))}>
          <option value="">All categories</option>
          {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="pp-muted pp-push">{filtered.length} blocks</span>
      </div>

      <div className="pp-card pp-scroll-x pp-flush">
        <table className="pp-table">
          <thead>
            <tr><th>When</th><th>Category</th><th>Task</th><th>Planned</th><th>Actual</th><th>Rating</th><th>Break</th><th>Note</th><th /></tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id}>
                <td className="pp-nowrap"><a onClick={() => void openLine(b)} title="Open in log file">{b.date} {b.time.slice(0, 5)}</a></td>
                <td>{b.category ? <span className="pp-row"><span className="pp-dot" style={{ background: color(b.category) }} />{b.category}</span> : '—'}</td>
                <td>{b.task ? <a onClick={() => void plugin.app.workspace.openLinkText(b.task!, '', false)}>{b.task}</a> : '—'}</td>
                <td>{b.plannedMinutes}m</td>
                <td>{fmtMin(b.actualMinutes)}</td>
                <td>
                  <select className="dropdown" value={b.rating} onChange={(e) => patch(b, { rating: e.target.value as Rating })}>
                    {RATINGS.map((r) => <option key={r.id} value={r.id}>{r.emoji} {r.label}</option>)}
                  </select>
                </td>
                <td>{b.breakMinutes ? `${b.breakMinutes}m` : 'skipped'}</td>
                <td>
                  <input type="text" className="pp-note" key={`${b.id}:${b.note ?? ''}`} defaultValue={b.note ?? ''} placeholder="note"
                    onBlur={(e) => e.target.value.trim() !== (b.note ?? '') && patch(b, { note: e.target.value.trim() || null })} />
                </td>
                <td><button className="mod-warning" onClick={() => remove(b)}>Delete</button></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={9} className="pp-empty">No blocks found.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="pp-row pp-between">
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>← Newer</button>
        <button disabled={offset + PAGE >= filtered.length} onClick={() => setOffset(offset + PAGE)}>Older →</button>
      </div>
    </div>
  )
}
