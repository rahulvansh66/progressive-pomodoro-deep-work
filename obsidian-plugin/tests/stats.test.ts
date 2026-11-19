import { describe, expect, it } from 'vitest'
import * as svc from '../src/logic/stats'
import type { Block, Goal, Rating } from '../src/types'

// Port of backend/tests/test_stats.py, run against the pure functions.

let seq = 0
function block(day: string, minutes: number, rating: Rating = 'okay', category: string | null = null, hour = 9): Block {
  const time = `${String(hour).padStart(2, '0')}:00:${String(seq++ % 60).padStart(2, '0')}`
  return {
    id: `${day}T${time}`, date: day, time, plannedMinutes: minutes, actualMinutes: minutes, rating,
    breakMinutes: rating === 'flow' ? 0 : 5, category, task: null, note: null,
  }
}
const goal = (targetMinutes: number, effectiveFrom: string, category: string | null = null, id = effectiveFrom): Goal =>
  ({ id, category, targetMinutes, effectiveFrom })

const TODAY = '2024-12-31'

describe('period math', () => {
  it('period ranges', () => {
    const d = '2024-03-06' // Wednesday
    expect(svc.periodRange('day', d)).toEqual([d, d])
    expect(svc.periodRange('week', d)).toEqual(['2024-03-04', '2024-03-10'])
    expect(svc.periodRange('month', d)).toEqual(['2024-03-01', '2024-03-31'])
    expect(svc.periodRange('year', d)).toEqual(['2024-01-01', '2024-12-31'])
  })

  it('previous ranges roll over', () => {
    expect(svc.previousRange('day', '2024-03-01')).toEqual(['2024-02-29', '2024-02-29']) // leap year
    expect(svc.previousRange('week', '2024-01-03')).toEqual(['2023-12-25', '2023-12-31'])
    expect(svc.previousRange('month', '2024-01-15')).toEqual(['2023-12-01', '2023-12-31'])
    expect(svc.previousRange('month', '2024-03-15')).toEqual(['2024-02-01', '2024-02-29'])
    expect(svc.previousRange('year', '2024-06-01')).toEqual(['2023-01-01', '2023-12-31'])
  })
})

describe('metrics', () => {
  it('summary compares with previous week', () => {
    const blocks = [
      block('2024-03-06', 20, 'flow', 'Code'),
      block('2024-03-07', 10, 'okay', 'Code'),
      block('2024-02-28', 15, 'focused', 'Code'),
    ]
    const r = svc.summary(blocks, [], 'week', '2024-03-06', null, TODAY)
    expect(r.metrics.total_minutes.current).toBe(30)
    expect(r.metrics.total_minutes.previous).toBe(15)
    expect(r.metrics.total_minutes.delta_pct).toBe(100)
    expect(r.metrics.flow_rate.current).toBe(50)
    expect(r.metrics.breaks_skipped.current).toBe(1)
    expect(r.previous_range.start).toBe('2024-02-26')
  })

  it('delta_pct is null when previous is zero', () => {
    const m = svc.summary([block('2024-03-06', 10)], [], 'day', '2024-03-06', null, TODAY).metrics
    expect(m.total_minutes.previous).toBe(0)
    expect(m.total_minutes.delta_pct).toBeNull()
  })

  it('filters by category', () => {
    const blocks = [block('2024-03-06', 10, 'okay', 'A'), block('2024-03-06', 20, 'okay', 'B', 10)]
    expect(svc.summary(blocks, [], 'day', '2024-03-06', 'B', TODAY).metrics.total_minutes.current).toBe(20)
  })

  it('timeseries and breakdown', () => {
    const blocks = [block('2024-03-06', 10, 'okay', 'Study'), block('2024-02-28', 5, 'okay', 'Study')]
    const pts = svc.timeseries(blocks, 'week', '2024-03-06', null)
    expect(pts).toHaveLength(7)
    expect(pts[2]).toMatchObject({ label: 'Wed', current: 10, previous: 5 })
    const b = svc.breakdown(blocks, [{ name: 'Study', color: '#123456', archived: false }], 'week', '2024-03-06', null)
    expect(b.categories[0]).toMatchObject({ name: 'Study', current: 10, previous: 5, color: '#123456' })
  })

  it('month timeseries covers the longer of the two months', () => {
    expect(svc.timeseries([], 'month', '2024-03-10', null)).toHaveLength(31) // Mar 31 vs Feb 29
  })

  it('breakdown groups tasks', () => {
    const blocks = [
      { ...block('2024-03-06', 10, 'okay', 'Work'), task: 'Report' },
      { ...block('2024-03-06', 5, 'okay', 'Work', 10), task: 'Report' },
      block('2024-03-06', 7, 'okay', null, 11),
    ]
    const b = svc.breakdown(blocks, [], 'day', '2024-03-06', null)
    expect(b.tasks).toEqual([expect.objectContaining({ name: 'Report', current: 15, category: 'Work' })])
    expect(b.categories.map((c) => c.name)).toEqual(['Work', 'Uncategorized'])
  })

  it('ratings and progression', () => {
    const blocks = [block('2024-03-06', 5, 'distracted', null, 9), block('2024-03-06', 10, 'flow', null, 10)]
    const r = svc.ratings(blocks, 'day', '2024-03-06', null)
    expect(r.find((x) => x.rating === 'flow')?.current).toBe(1)
    const p = svc.blockProgression(blocks, '2024-03-06', null)
    expect(p.map((x) => x.planned_minutes)).toEqual([5, 10])
    expect(p[0].time).toBe('09:00')
  })
})

describe('goals and streak', () => {
  it('counts goal days met and the streak', () => {
    const goals = [goal(10, '2024-03-04')]
    const blocks = ['2024-03-04', '2024-03-05', '2024-03-06'].map((d) => block(d, 10))
    const m = svc.summary(blocks, goals, 'week', '2024-03-06', null, '2024-03-06').metrics
    expect(m.goal_days_met.current).toBe(3)
    expect(svc.streak(blocks, goals, '2024-03-06')).toEqual({ current: 3, longest: 3 })
    // Today not met yet doesn't break the streak.
    expect(svc.streak(blocks, goals, '2024-03-07')).toEqual({ current: 3, longest: 3 })
    expect(svc.streak(blocks, goals, '2024-03-08').current).toBe(0)
  })

  it('goal history is not rewritten', () => {
    const goals = [goal(10, '2024-03-01'), goal(60, '2024-03-05')]
    const blocks = [block('2024-03-02', 10), block('2024-03-06', 10)]
    let m = svc.summary(blocks, goals, 'day', '2024-03-02', null, TODAY).metrics
    expect(m.goal_days_met.current).toBe(1)
    m = svc.summary(blocks, goals, 'day', '2024-03-06', null, TODAY).metrics
    expect(m.goal_days_met.current).toBe(0)
    expect(m.goal_days.current).toBe(1)
  })

  it('per-category goals are separate from the overall goal', () => {
    const goals = [goal(30, '2024-03-01', 'Work')]
    expect(svc.goalFor(goals, '2024-03-06', 'Work')).toBe(30)
    expect(svc.goalFor(goals, '2024-03-06', null)).toBe(0)
    expect(svc.goalFor(goals, '2024-02-28', 'Work')).toBe(0)
  })

  it('future goal days are not counted', () => {
    const m = svc.summary([], [goal(10, '2024-03-01')], 'week', '2024-03-06', null, '2024-03-06').metrics
    expect(m.goal_days.current).toBe(3) // Mon..Wed only
  })
})

describe('calendar', () => {
  it('has one entry per day of the year', () => {
    expect(svc.calendar([], 2024, null)).toHaveLength(366)
    expect(svc.calendar([block('2023-07-04', 12)], 2023, null).find((d) => d.date === '2023-07-04')?.minutes).toBe(12)
  })
})
