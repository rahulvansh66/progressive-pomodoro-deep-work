import { DEFAULT_SETTINGS, type Category, type Goal, type Settings } from '../types'
import type { ActiveTimer } from '../timer/TimerController'

/** Everything kept in the plugin's data.json. Sessions live in the vault, not here. */
export interface PluginData {
  settings: Settings
  categories: Category[]
  goals: Goal[]
  /** In-progress block/break; survives an Obsidian restart. */
  activeTimer: ActiveTimer | null
  /** Start-screen selection: length, category and task for the next block. */
  idle: { planned: number; category: string | null; task: string | null }
}

export function withDefaults(raw: unknown): PluginData {
  const d = (raw ?? {}) as Partial<PluginData>
  const settings = { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) }
  if (!Array.isArray(settings.presets) || !settings.presets.length) settings.presets = [...DEFAULT_SETTINGS.presets]
  return {
    settings,
    categories: Array.isArray(d.categories) ? d.categories : [],
    goals: Array.isArray(d.goals) ? d.goals : [],
    activeTimer: d.activeTimer ?? null,
    idle: { planned: settings.defaultStart, category: null, task: null, ...(d.idle ?? {}) },
  }
}

/** Sortable unique id (time-based) for goals. */
export const newId = () => `${Date.now().toString().padStart(15, '0')}${Math.random().toString(36).slice(2, 6)}`
