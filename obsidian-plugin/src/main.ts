import { Notice, Plugin, type WorkspaceLeaf } from 'obsidian'
import { Emitter } from './emitter'
import { mmss } from './logic/dates'
import { ConfirmModal } from './modals/ConfirmModal'
import { PauseModal } from './modals/PauseModal'
import { SettingsTab } from './settings/SettingsTab'
import { withDefaults, type PluginData } from './store/PluginData'
import { SessionStore } from './store/SessionStore'
import { activeMs, TimerController } from './timer/TimerController'
import { DashboardView, HistoryView, TimerView, VIEW_DASHBOARD, VIEW_HISTORY, VIEW_TIMER } from './views/views'
import { VIEW_WIDGET, WidgetView } from './views/WidgetView'

export default class ProgressivePomodoroPlugin extends Plugin {
  data!: PluginData
  store!: SessionStore
  timer!: TimerController
  /** Fires when settings, categories or goals change. */
  config = new Emitter()
  private statusEl!: HTMLElement
  private saveHandle: number | null = null

  async onload() {
    this.data = withDefaults(await this.loadData())
    this.store = new SessionStore(this.app, this.data.settings.logFolder)
    this.timer = new TimerController({
      settings: () => this.data.settings,
      store: this.store,
      getState: () => this.data.activeTimer,
      setState: (s) => { this.data.activeTimer = s; this.saveSoon() },
      idle: () => this.data.idle,
      setIdle: (p) => { this.data.idle = { ...this.data.idle, ...p }; this.saveSoon() },
      notify: (m) => new Notice(m),
    })

    this.registerView(VIEW_TIMER, (leaf) => new TimerView(leaf, this))
    this.registerView(VIEW_DASHBOARD, (leaf) => new DashboardView(leaf, this))
    this.registerView(VIEW_HISTORY, (leaf) => new HistoryView(leaf, this))
    this.registerView(VIEW_WIDGET, (leaf) => new WidgetView(leaf, this))

    this.addRibbonIcon('timer', 'Progressive Pomodoro timer', () => void this.openView(VIEW_TIMER))
    this.statusEl = this.addStatusBarItem()
    this.statusEl.addClass('mod-clickable', 'pp-status')
    this.statusEl.setAttribute('aria-label', 'Open Progressive Pomodoro timer')
    this.registerDomEvent(this.statusEl, 'click', () => void this.openView(VIEW_TIMER))

    this.addCommands()
    this.addSettingTab(new SettingsTab(this.app, this))

    this.register(this.timer.subscribe(() => this.updateStatus()))
    // Pop the widget open when a block starts (not for a block already running at load).
    let wasRunning = this.timer.state?.phase === 'running'
    let lastStart = this.timer.state?.phase === 'running' ? this.timer.state.startedAt : null
    this.register(this.timer.subscribe(() => {
      const s = this.timer.state
      const running = s?.phase === 'running'
      if (running && !wasRunning && this.data.settings.autoWidget) void this.openWidget(true)
      wasRunning = running
      // Distinct "go" signal whenever a new block begins (including a no-break next block).
      if (running && s.startedAt !== lastStart) this.beep('start')
      lastStart = running ? s.startedAt : null
    }))
    this.registerInterval(window.setInterval(() => this.onTick(), 1000))
    this.updateStatus()

    this.app.workspace.onLayoutReady(async () => {
      await this.store.load()
      for (const ref of this.store.watch()) this.registerEvent(ref)
    })
  }

  async onunload() {
    if (this.saveHandle !== null) {
      window.clearTimeout(this.saveHandle)
      await this.saveData(this.data)
    }
  }

  // ---- Persistence ----------------------------------------------------
  /** Debounced save of data.json (timer state changes come in bursts). */
  saveSoon() {
    if (this.saveHandle !== null) window.clearTimeout(this.saveHandle)
    this.saveHandle = window.setTimeout(() => {
      this.saveHandle = null
      void this.saveData(this.data)
    }, 250)
  }

  /** Save settings/categories/goals and notify open views. */
  async saveConfig() {
    await this.saveData(this.data)
    this.config.emit()
  }

  // ---- Views ----------------------------------------------------------
  async openView(type: string) {
    const { workspace } = this.app
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(type)[0] ?? null
    if (!leaf) {
      leaf = type === VIEW_TIMER ? workspace.getRightLeaf(false) : workspace.getLeaf('tab')
      if (!leaf) return
      await leaf.setViewState({ type, active: true })
    }
    await workspace.revealLeaf(leaf)
  }

  /** Open (or focus) the floating "minutes remaining" widget in a small always-on-top pop-out window. */
  async openWidget(auto = false) {
    const existing = this.app.workspace.getLeavesOfType(VIEW_WIDGET)[0]
    if (existing) {
      if (!auto) this.app.workspace.revealLeaf(existing)
      ;(existing.view as WidgetView).pin()
      return
    }
    const leaf = this.app.workspace.openPopoutLeaf({ size: { width: 160, height: 100 } })
    await leaf.setViewState({ type: VIEW_WIDGET, active: true })
    if (!(leaf.view as WidgetView).pin()) {
      new Notice('Widget opened. Use the pin icon in its title bar to keep it on top.', 6000)
    }
  }

  // ---- Commands -------------------------------------------------------
  /** Ask before pausing: "Do you really need to interrupt this block?" */
  requestPause() {
    if (this.timer.state?.phase !== 'running' || this.timer.isPaused()) return
    new PauseModal(this.app, (note) => this.timer.pause(note)).open()
  }

  requestDiscard() {
    if (!this.timer.state) return
    new ConfirmModal(this.app, 'Discard this block without saving?', 'Discard', () => this.timer.discard()).open()
  }

  private addCommands() {
    this.addCommand({ id: 'open-timer', name: 'Open timer', callback: () => void this.openView(VIEW_TIMER) })
    this.addCommand({ id: 'open-widget', name: 'Open floating widget (always on top)', callback: () => void this.openWidget() })
    this.addCommand({ id: 'open-dashboard', name: 'Open dashboard', callback: () => void this.openView(VIEW_DASHBOARD) })
    this.addCommand({ id: 'open-history', name: 'Open history', callback: () => void this.openView(VIEW_HISTORY) })
    this.addCommand({
      id: 'start-block',
      name: 'Start block',
      checkCallback: (checking) => {
        if (this.timer.state) return false
        if (!checking) { this.timer.start(this.data.idle.planned); void this.openView(VIEW_TIMER) }
        return true
      },
    })
    this.addCommand({
      id: 'pause-resume',
      name: 'Pause / resume block',
      checkCallback: (checking) => {
        if (this.timer.state?.phase !== 'running') return false
        if (!checking) { if (this.timer.isPaused()) this.timer.resume(); else this.requestPause() }
        return true
      },
    })
    this.addCommand({
      id: 'finish-block',
      name: 'Finish block and rate it',
      checkCallback: (checking) => {
        if (this.timer.state?.phase !== 'running') return false
        if (!checking) { this.timer.finish(); void this.openView(VIEW_TIMER) }
        return true
      },
    })
    this.addCommand({
      id: 'discard-block',
      name: 'Discard block',
      checkCallback: (checking) => {
        if (!this.timer.state || this.timer.state.phase === 'break') return false
        if (!checking) this.requestDiscard()
        return true
      },
    })
  }

  // ---- Clock & status bar ---------------------------------------------
  private onTick() {
    const { timeUp, breakOver } = this.timer.tick()
    if (timeUp) this.beep()
    if (breakOver) {
      new Notice(`☕ Break over — next block: ${this.data.idle.planned} min.`, 8000)
      this.beep()
    }
    this.updateStatus()
  }

  private updateStatus() {
    const s = this.timer.state
    let text = ''
    if (s?.phase === 'running') {
      const remaining = s.plannedMinutes * 60 - activeMs(s, Date.now()) / 1000
      const icon = s.pausedAt !== undefined ? '⏸' : '🍅'
      text = `${icon} ${remaining < 0 ? '+' : ''}${mmss(remaining)}`
    } else if (s?.phase === 'rating' || s?.phase === 'decide') {
      text = '🍅 rate block'
    } else if (s?.phase === 'break' && s.breakUntil) {
      text = `☕ ${mmss(Math.max(0, (s.breakUntil - Date.now()) / 1000))}`
    }
    this.statusEl.setText(text)
    this.statusEl.toggle(text !== '')
  }

  /** End/break-over: one soft, low-medium note (gentle, so it doesn't break flow). Start: one higher note, so the two signals feel different. */
  private beep(kind: 'start' | 'end' = 'end') {
    if (!this.data.settings.sound) return
    const notes: [number, number][] = kind === 'start'
      ? [[0, 880]]
      : [[0, 440]]
    try {
      const ctx = new AudioContext()
      const play = (at: number, freq: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + at)
        gain.gain.exponentialRampToValueAtTime(kind === 'start' ? 0.25 : 0.15, ctx.currentTime + at + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + (kind === 'start' ? 0.35 : 0.6))
        osc.connect(gain).connect(ctx.destination)
        osc.start(ctx.currentTime + at)
        osc.stop(ctx.currentTime + at + 0.7)
      }
      for (const [at, freq] of notes) play(at, freq)
      window.setTimeout(() => void ctx.close(), 1500)
    } catch {
      /* audio unavailable */
    }
  }
}
