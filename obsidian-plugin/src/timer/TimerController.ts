import { Emitter } from '../emitter'
import { isoDate, isoTime, round1 } from '../logic/dates'
import { suggestNext } from '../logic/progression'
import type { Rating, Settings } from '../types'
import type { SessionStore } from '../store/SessionStore'

export type Phase = 'running' | 'rating' | 'decide' | 'break'

/** Persisted timer state (null = idle). Mirrors `Persisted` in the web app's Timer.tsx. */
export interface ActiveTimer {
  phase: Phase
  plannedMinutes: number
  startedAt: number // epoch ms
  pausedAt?: number // set while paused
  pausedMs?: number // total time spent paused
  endedAt?: number
  category: string | null
  task: string | null
  rating?: Rating
  /** Note typed on the rating screen. */
  note?: string
  pauseNotes?: string[]
  /** Decide step: chosen next length and whether a break is planned. */
  nextMinutes?: number
  takeBreak?: boolean
  breakMinutes?: number
  breakStarted?: number
  breakUntil?: number
  /** Planned time reached and the user was notified (once per block). */
  notifiedEnd?: boolean
}

export interface TimerHost {
  settings(): Settings
  store: SessionStore
  getState(): ActiveTimer | null
  setState(s: ActiveTimer | null): void
  idle(): { planned: number; category: string | null; task: string | null }
  setIdle(patch: Partial<{ planned: number; category: string | null; task: string | null }>): void
  notify(message: string): void
}

/** Focused time (ms) up to `at`, excluding pauses. Frozen while paused. */
export const activeMs = (s: ActiveTimer, at: number) => (s.pausedAt ?? at) - s.startedAt - (s.pausedMs ?? 0)

/**
 * The Progressive Pomodoro state machine: idle → running → rating → decide → (break | running).
 * Time is always derived from timestamps, so it stays correct after sleep, backgrounding or restart.
 */
export class TimerController extends Emitter {
  private busy = false

  constructor(private host: TimerHost) {
    super()
  }

  get state() { return this.host.getState() }

  private set(s: ActiveTimer | null) {
    this.host.setState(s)
    this.emit()
  }

  clamp(n: number) {
    const { minBlock, maxBlock } = this.host.settings()
    return Math.max(minBlock, Math.min(maxBlock, Math.round(n)))
  }

  // ---- Idle selection -------------------------------------------------
  setIdle(patch: Partial<{ planned: number; category: string | null; task: string | null }>) {
    this.host.setIdle(patch)
    this.emit()
  }

  // ---- Running --------------------------------------------------------
  start(minutes: number) {
    const idle = this.host.idle()
    const planned = this.clamp(minutes)
    this.host.setIdle({ planned })
    this.set({ phase: 'running', plannedMinutes: planned, startedAt: Date.now(), category: idle.category, task: idle.task })
  }

  isPaused() {
    const s = this.state
    return s?.phase === 'running' && s.pausedAt !== undefined
  }

  pause(note?: string) {
    const s = this.state
    if (!s || s.phase !== 'running' || s.pausedAt !== undefined) return
    const text = note?.trim()
    this.set({ ...s, pausedAt: Date.now(), pauseNotes: text ? [...(s.pauseNotes ?? []), text] : s.pauseNotes })
  }

  resume() {
    const s = this.state
    if (!s || s.pausedAt === undefined) return
    this.set({ ...s, pausedAt: undefined, pausedMs: (s.pausedMs ?? 0) + (Date.now() - s.pausedAt) })
  }

  /** Stop the clock and move on to rating. */
  finish() {
    const s = this.state
    if (!s || s.phase !== 'running') return
    const end = Date.now()
    const pausedMs = (s.pausedMs ?? 0) + (s.pausedAt !== undefined ? end - s.pausedAt : 0)
    this.set({ ...s, phase: 'rating', endedAt: end, pausedAt: undefined, pausedMs })
  }

  discard() {
    this.set(null)
  }

  // ---- Rating & decide ------------------------------------------------
  rate(rating: Rating, note?: string) {
    const s = this.state
    if (!s || s.phase !== 'rating') return
    const sug = suggestNext(s.plannedMinutes, rating, this.host.settings())
    this.set({
      ...s, phase: 'decide', rating, note: note?.trim() || undefined,
      nextMinutes: sug.nextMinutes, takeBreak: sug.takeBreak, breakMinutes: sug.breakMinutes,
    })
  }

  /** Suggestion for the current decide step (recomputed from the saved rating). */
  suggestion() {
    const s = this.state
    if (!s?.rating) return null
    return suggestNext(s.plannedMinutes, s.rating, this.host.settings())
  }

  setNextMinutes(n: number) {
    const s = this.state
    if (s?.phase !== 'decide') return
    this.set({ ...s, nextMinutes: this.clamp(n) })
  }

  /** On a flow rating no break is suggested; let the user take one anyway. */
  takeBreakAnyway() {
    const s = this.state
    if (s?.phase !== 'decide') return
    this.set({ ...s, takeBreak: true, breakMinutes: this.host.settings().breakMinutes })
  }

  /** Save the rated block, then take the break or start the next block straight away. */
  async proceed(takeBreak: boolean) {
    const s = this.state
    if (!s || s.phase !== 'decide' || this.busy) return
    const next = s.nextMinutes ?? s.plannedMinutes
    const breakMin = takeBreak ? (s.breakMinutes || this.host.settings().breakMinutes) : 0
    await this.guard(async () => {
      await this.persist(s, breakMin)
      this.host.setIdle({ planned: next })
      if (takeBreak) {
        const now = Date.now()
        this.set({ ...s, phase: 'break', breakMinutes: breakMin, breakStarted: now, breakUntil: now + breakMin * 60_000 })
      } else {
        // Keep flowing: start the next block immediately.
        this.set({ phase: 'running', plannedMinutes: next, startedAt: Date.now(), category: s.category, task: s.task })
      }
    })
  }

  /** Save the rated block (no break) and return to the start screen. */
  async saveAndGoHome() {
    const s = this.state
    if (!s || s.phase !== 'decide' || this.busy) return
    await this.guard(async () => {
      await this.persist(s, 0)
      this.host.setIdle({ planned: s.nextMinutes ?? s.plannedMinutes })
      this.set(null)
    })
  }

  finishBreak() {
    if (this.state?.phase === 'break') this.set(null)
  }

  private async guard(fn: () => Promise<void>) {
    this.busy = true
    try {
      await fn()
    } catch (e) {
      this.host.notify(`Progressive Pomodoro: could not save block: ${(e as Error).message}`)
      throw e
    } finally {
      this.busy = false
    }
  }

  private async persist(s: ActiveTimer, breakMinutes: number) {
    if (!s.rating || !s.endedAt) return
    const start = new Date(s.startedAt)
    const date = isoDate(start)
    const time = isoTime(start)
    const note = [s.note ?? '', ...(s.pauseNotes ?? []).map((n) => `Paused: ${n}`)].filter(Boolean).join(' / ')
    await this.host.store.add({
      id: `${date}T${time}`,
      date,
      time,
      plannedMinutes: s.plannedMinutes,
      actualMinutes: Math.max(0.1, round1(activeMs(s, s.endedAt) / 60_000)),
      rating: s.rating,
      breakMinutes,
      category: s.category,
      task: s.task,
      note: note || null,
    })
  }

  // ---- Clock ----------------------------------------------------------
  /** Called every second by the plugin: notifies when time is up and ends breaks. */
  tick(now = Date.now()): { timeUp: boolean; breakOver: boolean } {
    const s = this.state
    if (!s) return { timeUp: false, breakOver: false }
    if (s.phase === 'running' && !s.notifiedEnd && s.pausedAt === undefined
      && activeMs(s, now) >= s.plannedMinutes * 60_000) {
      this.set({ ...s, notifiedEnd: true })
      return { timeUp: true, breakOver: false }
    }
    if (s.phase === 'break' && s.breakUntil && now >= s.breakUntil) {
      this.set(null)
      return { timeUp: false, breakOver: true }
    }
    return { timeUp: false, breakOver: false }
  }
}
