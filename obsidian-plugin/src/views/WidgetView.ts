import { ItemView, type WorkspaceLeaf } from 'obsidian'
import type ProgressivePomodoroPlugin from '../main'
import { activeMs } from '../timer/TimerController'

export const VIEW_WIDGET = 'progressive-pomodoro-widget'

interface ElectronWindow {
  setAlwaysOnTop(flag: boolean, level?: string): void
  setVisibleOnAllWorkspaces?(flag: boolean, opts?: { visibleOnFullScreen?: boolean }): void
  isAlwaysOnTop(): boolean
  setMinimumSize?(w: number, h: number): void
  setSize?(w: number, h: number): void
  setPosition?(x: number, y: number): void
}

/** Initial window size, in pixels (includes the title bar). */
const WIDGET_SIZE = { width: 150, height: 80 }
/** Gap from the screen's bottom-left corner, in pixels. */
const WIDGET_MARGIN = 12

/** Best-effort access to the Electron BrowserWindow hosting `win` (not part of Obsidian's public API). */
function electronWindow(win: Window): ElectronWindow | null {
  try {
    type Req = (id: string) => { remote?: { getCurrentWindow(): ElectronWindow } }
    const req = ((win as unknown as { require?: Req }).require ?? (window as unknown as { require?: Req }).require)
    return req?.('electron')?.remote?.getCurrentWindow() ?? null
  } catch {
    return null
  }
}

/**
 * Compact "minutes remaining" display meant to live in an Obsidian pop-out window
 * that is kept above every other application.
 */
/** Whole-second part (00–59) of a duration, zero-padded. */
const ss = (sec: number) => String(Math.floor(Math.abs(sec)) % 60).padStart(2, '0')

export class WidgetView extends ItemView {
  private timeEl!: HTMLElement
  private subEl!: HTMLElement
  private interval: number | null = null

  constructor(leaf: WorkspaceLeaf, private plugin: ProgressivePomodoroPlugin) {
    super(leaf)
  }

  getViewType() { return VIEW_WIDGET }
  getDisplayText() { return 'Pomodoro widget' }
  getIcon() { return 'timer' }

  async onOpen() {
    const el = this.contentEl
    el.empty()
    el.addClass('pp-widget')
    this.subEl = el.createDiv({ cls: 'pp-widget-sub' })
    this.timeEl = el.createDiv({ cls: 'pp-widget-time' })

    const win = this.containerEl.win
    // Strip the pop-out's chrome (nav arrows, title, tab, "+" button) via a class on its document.
    win.document.body.addClass('pp-widget-window')
    this.render()
    this.interval = win.setInterval(() => this.render(), 1000)
    this.register(this.plugin.timer.subscribe(() => this.render()))

    // The window may not be fully attached yet; try now and shortly after.
    this.pin()
    this.shrink()
    win.setTimeout(() => { this.pin(); this.shrink() }, 300)
  }

  /** Obsidian ignores the requested pop-out size/position, so size and place the native window directly. */
  private shrink() {
    const w = electronWindow(this.containerEl.win)
    try {
      w?.setMinimumSize?.(120, 100)
      w?.setSize?.(WIDGET_SIZE.width, WIDGET_SIZE.height)
      // Park it in the bottom-left corner of the usable screen area (above the taskbar).
      const scr = this.containerEl.win.screen as Screen & { availLeft?: number; availTop?: number }
      const x = (scr.availLeft ?? 0) + WIDGET_MARGIN
      const y = (scr.availTop ?? 0) + scr.availHeight - WIDGET_SIZE.height - WIDGET_MARGIN
      w?.setPosition?.(Math.round(x), Math.round(y))
    } catch {
      /* ignore */
    }
  }

  async onClose() {
    if (this.interval !== null) this.containerEl.win.clearInterval(this.interval)
    this.interval = null
  }

  /** Keep this window above all other apps. Returns false if Electron access is unavailable. */
  pin(on = true): boolean {
    const w = electronWindow(this.containerEl.win)
    if (!w) return false
    try {
      w.setAlwaysOnTop(on, 'screen-saver')
      w.setVisibleOnAllWorkspaces?.(on, { visibleOnFullScreen: true })
      return true
    } catch {
      return false
    }
  }

  private render() {
    const s = this.plugin.timer.state
    const el = this.contentEl
    el.toggleClass('is-paused', false)

    if (s?.phase === 'running') {
      const remaining = s.plannedMinutes * 60 - activeMs(s, Date.now()) / 1000
      const paused = s.pausedAt !== undefined
      el.toggleClass('is-paused', paused)
      if (remaining < 0) {
        this.timeEl.setText(`+${Math.floor(-remaining / 60)}`)
        this.subEl.setText(ss(remaining))
      } else {
        this.timeEl.setText(String(Math.floor(remaining / 60)))
        this.subEl.setText(ss(remaining))
      }
    } else if (s?.phase === 'break' && s.breakUntil) {
      const left = Math.max(0, (s.breakUntil - Date.now()) / 1000)
      this.timeEl.setText(String(Math.floor(left / 60)))
      this.subEl.setText(ss(left))
    } else if (s) {
      this.timeEl.setText('✓')
      this.subEl.setText('rate')
    } else {
      this.timeEl.setText('–')
      this.subEl.setText('')
    }
  }
}
