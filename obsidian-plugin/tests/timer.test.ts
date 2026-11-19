import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TimerController, type ActiveTimer, type TimerHost } from '../src/timer/TimerController'
import { DEFAULT_SETTINGS, type Block } from '../src/types'

let state: ActiveTimer | null
let idle: { planned: number; category: string | null; task: string | null }
let saved: Block[]
let timer: TimerController

const MIN = 60_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 19, 9, 0, 0))
  state = null
  idle = { planned: 5, category: 'Work', task: 'Write report' }
  saved = []
  const host: TimerHost = {
    settings: () => DEFAULT_SETTINGS,
    store: { add: async (b: Block) => { saved.push(b) } } as never,
    getState: () => state,
    setState: (s) => { state = s },
    idle: () => idle,
    setIdle: (p) => { idle = { ...idle, ...p } },
    notify: () => {},
  }
  timer = new TimerController(host)
})

describe('TimerController', () => {
  it('runs a block with a pause, rates it, takes a break and returns to idle', async () => {
    timer.start(2)
    expect(state).toMatchObject({ phase: 'running', plannedMinutes: 2, category: 'Work', task: 'Write report' })

    vi.advanceTimersByTime(1 * MIN)
    timer.pause('phone call')
    vi.advanceTimersByTime(10 * MIN) // paused time doesn't count
    expect(timer.tick().timeUp).toBe(false)
    timer.resume()
    vi.advanceTimersByTime(1 * MIN)
    expect(timer.tick().timeUp).toBe(true)
    expect(timer.tick().timeUp).toBe(false) // notified once

    timer.finish()
    expect(state?.phase).toBe('rating')
    timer.rate('focused', 'good one')
    expect(state).toMatchObject({ phase: 'decide', nextMinutes: 7, takeBreak: true, breakMinutes: 5 })

    await timer.proceed(true)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      date: '2026-11-19', time: '09:00:00', plannedMinutes: 2, actualMinutes: 2, rating: 'focused',
      breakMinutes: 5, category: 'Work', task: 'Write report', note: 'good one / Paused: phone call',
    })
    expect(state?.phase).toBe('break')
    expect(idle.planned).toBe(7)

    vi.advanceTimersByTime(5 * MIN)
    expect(timer.tick().breakOver).toBe(true)
    expect(state).toBeNull()
  })

  it('keeps flowing: no break, next block starts immediately with the chosen length', async () => {
    timer.start(10)
    vi.advanceTimersByTime(14 * MIN) // overran while flowing
    timer.finish()
    timer.rate('flow')
    expect(state).toMatchObject({ takeBreak: false, nextMinutes: 20 })
    timer.setNextMinutes(25)
    await timer.proceed(false)
    expect(saved[0]).toMatchObject({ actualMinutes: 14, breakMinutes: 0, rating: 'flow' })
    expect(state).toMatchObject({ phase: 'running', plannedMinutes: 25, category: 'Work' })
  })

  it('lets you take a break anyway after flow', async () => {
    timer.start(10)
    timer.finish()
    timer.rate('flow')
    timer.takeBreakAnyway()
    await timer.proceed(true)
    expect(saved[0].breakMinutes).toBe(5)
    expect(state?.phase).toBe('break')
  })

  it('save & go home stores the block and returns to idle with the next length', async () => {
    timer.start(5)
    vi.advanceTimersByTime(3 * MIN)
    timer.finish()
    timer.rate('distracted')
    await timer.saveAndGoHome()
    expect(saved[0]).toMatchObject({ actualMinutes: 3, breakMinutes: 0, rating: 'distracted' })
    expect(state).toBeNull()
    expect(idle.planned).toBe(3)
  })

  it('finishing while paused excludes the paused time', () => {
    timer.start(5)
    vi.advanceTimersByTime(2 * MIN)
    timer.pause()
    vi.advanceTimersByTime(3 * MIN)
    timer.finish()
    expect(state?.pausedMs).toBe(3 * MIN)
    expect(state?.pausedAt).toBeUndefined()
  })

  it('clamps lengths to the configured limits', () => {
    timer.start(500)
    expect(state?.plannedMinutes).toBe(60)
    timer.discard()
    timer.start(0)
    expect(state?.plannedMinutes).toBe(2)
  })
})
