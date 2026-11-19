import { ReactView } from './react'
import Dashboard from './Dashboard'
import History from './History'
import Timer from './Timer'

export const VIEW_TIMER = 'progressive-pomodoro-timer'
export const VIEW_DASHBOARD = 'progressive-pomodoro-dashboard'
export const VIEW_HISTORY = 'progressive-pomodoro-history'

export class TimerView extends ReactView {
  getViewType() { return VIEW_TIMER }
  getDisplayText() { return 'Pomodoro timer' }
  getIcon() { return 'timer' }
  protected renderView() { return <Timer /> }
}

export class DashboardView extends ReactView {
  getViewType() { return VIEW_DASHBOARD }
  getDisplayText() { return 'Pomodoro dashboard' }
  getIcon() { return 'bar-chart-2' }
  protected renderView() { return <Dashboard /> }
}

export class HistoryView extends ReactView {
  getViewType() { return VIEW_HISTORY }
  getDisplayText() { return 'Pomodoro history' }
  getIcon() { return 'history' }
  protected renderView() { return <History /> }
}
