import { useMemo, useState, type ReactNode } from 'react'
import { fmtMin, mmss, today } from '../logic/dates'
import { NotePicker } from '../modals/NotePicker'
import { activeMs } from '../timer/TimerController'
import { RATINGS } from '../types'
import { useBlocksVersion, useConfigVersion, useNow, usePlugin, useTimer } from './react'

const R = 90
const CIRC = 2 * Math.PI * R

function Ring({ progress, color, children }: { progress: number; color: string; children: ReactNode }) {
  return (
    <div className="pp-ring">
      <svg viewBox="0 0 200 200">
        <circle cx="100" cy="100" r={R} fill="none" strokeWidth="10" className="pp-ring-track" />
        <circle cx="100" cy="100" r={R} fill="none" strokeWidth="10" strokeLinecap="round"
          stroke={color} strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progress)} />
      </svg>
      <div className="pp-ring-label">{children}</div>
    </div>
  )
}

function LengthGrid({ presets, selected, onPick, selectedFilled }: {
  presets: number[]; selected: number; onPick: (m: number) => void; selectedFilled?: boolean
}) {
  return (
    <div className="pp-grid3">
      {presets.map((m) => (
        <button key={m}
          className={`pp-preset ${m === selected ? (selectedFilled ? 'is-selected mod-cta' : 'is-selected') : ''}`}
          onClick={() => onPick(m)}>
          {m}<span>min</span>
        </button>
      ))}
    </div>
  )
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <>
      <button onClick={() => onChange(value - 1)} aria-label="Shorter">−</button>
      <span className="pp-stepper-value">{value}m</span>
      <button onClick={() => onChange(value + 1)} aria-label="Longer">+</button>
    </>
  )
}

export default function Timer() {
  const plugin = usePlugin()
  const { timer, store } = plugin
  const state = useTimer()
  const blocksVersion = useBlocksVersion()
  useConfigVersion()
  const ticking = state?.phase === 'running' || state?.phase === 'break'
  const now = useNow(250, ticking)
  const [note, setNote] = useState('')

  const settings = plugin.data.settings
  const idle = plugin.data.idle
  const categories = plugin.data.categories.filter((c) => !c.archived || c.name === idle.category)

  const todayMinutes = useMemo(() => {
    const d = today()
    return store.all().filter((b) => b.date === d).reduce((s, b) => s + b.actualMinutes, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksVersion, store])

  const paused = state?.phase === 'running' && state.pausedAt !== undefined
  const elapsed = state?.phase === 'running' ? activeMs(state, now) / 1000 : 0
  const remaining = state ? state.plannedMinutes * 60 - elapsed : 0
  const overrun = state?.phase === 'running' && remaining < 0
  const progress = state?.phase === 'running' ? Math.min(1, elapsed / (state.plannedMinutes * 60)) : 0
  const suggestion = state?.phase === 'decide' ? timer.suggestion() : null

  const pickTask = () =>
    new NotePicker(plugin.app, store.folderPath, (file) => {
      timer.setIdle({ task: plugin.app.metadataCache.fileToLinktext(file, '', true) })
    }).open()

  const openTask = (task: string) => void plugin.app.workspace.openLinkText(task, '', false)

  const save = (fn: () => Promise<void>) => () => { fn().catch(() => { /* Notice already shown */ }) }

  return (
    <div className="pp-timer">
      <div className="pp-card pp-center">
        {state?.phase === 'decide' && (
          <button className="pp-corner" onClick={save(() => timer.saveAndGoHome())}
            title="Save this block and return to the start screen">
            Save &amp; go home
          </button>
        )}
        <p className="pp-muted">Today: <b>{fmtMin(todayMinutes)}</b> focused</p>

        {!state && (
          <div className="pp-stack-lg">
            <div className="pp-row pp-wrap pp-justify">
              <select className="dropdown" value={idle.category ?? ''}
                onChange={(e) => timer.setIdle({ category: e.target.value || null })}>
                <option value="">No category</option>
                {categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              {idle.task ? (
                <span className="pp-chip">
                  <a onClick={() => openTask(idle.task!)}>{idle.task}</a>
                  <button className="clickable-icon" aria-label="Clear task" onClick={() => timer.setIdle({ task: null })}>✕</button>
                </span>
              ) : (
                <button onClick={pickTask}>Pick task note…</button>
              )}
            </div>
            <div>
              <p className="pp-muted">Tap a block to start — the more resistance you feel, the shorter it should be</p>
              <LengthGrid presets={settings.presets} selected={idle.planned} onPick={(m) => timer.start(m)} />
            </div>
            <div className="pp-divider">
              <p className="pp-muted">Custom</p>
              <div className="pp-row pp-justify">
                <Stepper value={idle.planned} onChange={(n) => timer.setIdle({ planned: timer.clamp(n) })} />
                <button className="mod-cta" onClick={() => timer.start(idle.planned)}>Start</button>
              </div>
            </div>
          </div>
        )}

        {state?.phase === 'running' && (
          <div className="pp-stack-lg">
            <p className="pp-muted">
              {state.category ?? 'Focus block'}
              {state.task && <> · <a onClick={() => openTask(state.task!)}>{state.task}</a></>}
            </p>
            <Ring progress={progress} color={paused ? '#94a3b8' : overrun ? '#f59e0b' : 'var(--interactive-accent)'}>
              <span className="pp-big">{overrun ? '+' : ''}{mmss(remaining)}</span>
              <span className="pp-small">{overrun ? 'still flowing? keep going' : `of ${state.plannedMinutes} min`}</span>
            </Ring>
            {paused && <p className="pp-muted">⏸ Paused</p>}
            {overrun && !paused && <p className="pp-warn">Timer's up — if you're flowing, keep on flowing.</p>}
            <div className="pp-row pp-wrap pp-justify">
              {paused
                ? <button className="mod-cta" onClick={() => timer.resume()}>▶ Resume</button>
                : <button onClick={() => plugin.requestPause()}>⏸ Pause</button>}
              <button className="mod-cta" onClick={() => timer.finish()}>Finish block</button>
              <button className="mod-warning" onClick={() => plugin.requestDiscard()}>Discard</button>
            </div>
          </div>
        )}

        {state?.phase === 'rating' && (
          <div className="pp-stack-lg">
            <h3>How focused were you?</h3>
            <p className="pp-muted">Be honest — it's fine to be distracted.</p>
            <div className="pp-grid2">
              {RATINGS.map((x) => (
                <button key={x.id} className="pp-rating" onClick={() => { timer.rate(x.id, note); setNote('') }}>
                  <span className="pp-emoji">{x.emoji}</span>{x.label}
                </button>
              ))}
            </div>
            <textarea className="pp-input pp-full" rows={2} placeholder="Optional note…" value={note}
              onChange={(e) => setNote(e.target.value)} />
            <div><button className="mod-warning" onClick={() => plugin.requestDiscard()}>Discard block</button></div>
          </div>
        )}

        {state?.phase === 'decide' && suggestion && (
          <div className="pp-stack-lg">
            <div>
              <p className="pp-muted">Pick the next block length</p>
              <LengthGrid presets={settings.presets} selected={state.nextMinutes ?? suggestion.nextMinutes}
                selectedFilled onPick={(m) => timer.setNextMinutes(m)} />
            </div>
            <div className="pp-divider pp-stack-lg">
              <p className="pp-muted">Suggestions</p>
              <p className="pp-message">{suggestion.message}</p>
              <div>
                <p className="pp-muted">Next block length</p>
                <div className="pp-row pp-justify">
                  <Stepper value={state.nextMinutes ?? suggestion.nextMinutes} onChange={(n) => timer.setNextMinutes(n)} />
                  <button className={state.nextMinutes === suggestion.nextMinutes ? 'mod-cta' : ''}
                    onClick={() => timer.setNextMinutes(suggestion.nextMinutes)}>
                    Suggested {suggestion.nextMinutes}
                  </button>
                </div>
              </div>
              {state.takeBreak ? (
                <div className="pp-stack">
                  <button className="mod-cta" onClick={save(() => timer.proceed(true))}>
                    Take a {state.breakMinutes || settings.breakMinutes}-minute break
                  </button>
                  <button onClick={save(() => timer.proceed(false))}>Skip break, start next block</button>
                </div>
              ) : (
                <div className="pp-stack">
                  <button className="mod-cta" onClick={save(() => timer.proceed(false))}>
                    Keep flowing → {state.nextMinutes}m block
                  </button>
                  <button onClick={() => timer.takeBreakAnyway()}>Take a break anyway</button>
                </div>
              )}
            </div>
          </div>
        )}

        {state?.phase === 'break' && state.breakUntil && (
          <div className="pp-stack-lg">
            <h3>Break ☕</h3>
            <p className="pp-big">{mmss(Math.max(0, (state.breakUntil - now) / 1000))}</p>
            <p className="pp-muted">Next block: {idle.planned} min</p>
            <div><button className="mod-cta" onClick={() => timer.finishBreak()}>End break &amp; set up next block</button></div>
          </div>
        )}
      </div>

      <p className="pp-muted pp-center pp-footnote">
        Start small → rate your focus → skip the break if you're flowing → adjust the next block.
      </p>
    </div>
  )
}
