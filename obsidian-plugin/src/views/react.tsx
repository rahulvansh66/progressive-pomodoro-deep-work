import { ItemView, type WorkspaceLeaf } from 'obsidian'
import { createContext, StrictMode, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type ProgressivePomodoroPlugin from '../main'

const PluginContext = createContext<ProgressivePomodoroPlugin | null>(null)

export function usePlugin(): ProgressivePomodoroPlugin {
  const p = useContext(PluginContext)
  if (!p) throw new Error('usePlugin outside of a plugin view')
  return p
}

/** Re-render when the timer state changes; returns the current state. */
export function useTimer() {
  const plugin = usePlugin()
  useSyncExternalStore(plugin.timer.subscribe, () => plugin.timer.version)
  return plugin.timer.state
}

/** Re-render when logged blocks change; returns the store version (use as a memo key). */
export function useBlocksVersion() {
  const plugin = usePlugin()
  return useSyncExternalStore(plugin.store.subscribe, () => plugin.store.version)
}

/** Re-render when settings, categories or goals change. */
export function useConfigVersion() {
  const plugin = usePlugin()
  return useSyncExternalStore(plugin.config.subscribe, () => plugin.config.version)
}

/** Current time, refreshed every `ms` while `active`. */
export function useNow(ms: number, active = true) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms, active])
  return now
}

/** An Obsidian view that renders a React tree. */
export abstract class ReactView extends ItemView {
  private root: Root | null = null

  constructor(leaf: WorkspaceLeaf, protected plugin: ProgressivePomodoroPlugin) {
    super(leaf)
  }

  protected abstract renderView(): ReactNode

  async onOpen() {
    this.contentEl.empty()
    this.contentEl.addClass('pp-view')
    this.root = createRoot(this.contentEl)
    this.root.render(
      <StrictMode>
        <PluginContext.Provider value={this.plugin}>{this.renderView()}</PluginContext.Provider>
      </StrictMode>,
    )
  }

  async onClose() {
    this.root?.unmount()
    this.root = null
  }
}
