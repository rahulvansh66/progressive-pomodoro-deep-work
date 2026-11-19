import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Manage from './pages/Manage'
import Timer from './pages/Timer'

const links = [
  ['/', 'Timer'],
  ['/dashboard', 'Dashboard'],
  ['/history', 'History'],
  ['/manage', 'Manage'],
] as const

export default function App() {
  return (
    <BrowserRouter>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <span className="font-semibold">🍅 Progressive Pomo</span>
          <nav className="flex gap-1">
            {links.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Timer />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          <Route path="/manage" element={<Manage />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
