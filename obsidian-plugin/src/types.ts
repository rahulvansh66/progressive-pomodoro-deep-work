export type Rating = 'distracted' | 'okay' | 'focused' | 'flow'
export type Period = 'day' | 'week' | 'month' | 'year'

export const RATINGS: { id: Rating; label: string; color: string; emoji: string; score: number }[] = [
  { id: 'distracted', label: 'Distracted', color: '#94a3b8', emoji: '😵', score: 1 },
  { id: 'okay', label: 'Okay', color: '#38bdf8', emoji: '🙂', score: 2 },
  { id: 'focused', label: 'Highly focused', color: '#6366f1', emoji: '🎯', score: 3 },
  { id: 'flow', label: 'Flow', color: '#f59e0b', emoji: '🔥', score: 4 },
]
export const RATING_IDS = RATINGS.map((r) => r.id)
export const isRating = (s: string): s is Rating => (RATING_IDS as string[]).includes(s)

/** One focus block, as stored on one line of a daily log file. */
export interface Block {
  /** `${date}T${time}`: unique within the vault. */
  id: string
  /** Local start date, YYYY-MM-DD (also the log file name). */
  date: string
  /** Local start time, HH:MM:SS. */
  time: string
  plannedMinutes: number
  /** Focused minutes, pauses excluded. */
  actualMinutes: number
  rating: Rating
  /** Break taken after the block, in minutes. 0 = skipped. */
  breakMinutes: number
  category: string | null
  /** Link text of the task note (without [[ ]]). */
  task: string | null
  note: string | null
}

export interface Category { name: string; color: string; archived: boolean }

/** A goal applies from `effectiveFrom` until a newer goal for the same scope. */
export interface Goal { id: string; category: string | null; targetMinutes: number; effectiveFrom: string }

export interface Settings {
  defaultStart: number
  minBlock: number
  maxBlock: number
  focusedStep: number
  flowStep: number
  breakMinutes: number
  presets: number[]
  logFolder: string
  sound: boolean
  /** Open the floating always-on-top widget whenever a block starts. */
  autoWidget: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  defaultStart: 5,
  minBlock: 2,
  maxBlock: 60,
  focusedStep: 5,
  flowStep: 10,
  breakMinutes: 5,
  presets: [2, 30, 60, 5, 10, 15],
  logFolder: 'Pomodoro Log',
  sound: true,
  autoWidget: true,
}
