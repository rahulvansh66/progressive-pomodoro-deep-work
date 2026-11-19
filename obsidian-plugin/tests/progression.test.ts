import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, suggestNext } from '../src/logic/progression'
import type { Rating } from '../src/types'

describe('suggestNext', () => {
  // Same cases as backend/tests/test_stats.py::test_suggest_next
  it.each<[number, Rating, number, boolean]>([
    [5, 'distracted', 3, true],
    [3, 'distracted', 2, true],
    [10, 'okay', 10, true],
    [10, 'focused', 15, true],
    [10, 'flow', 20, false],
    [55, 'flow', 60, false],
  ])('%i min rated %s -> next %i, break %s', (planned, rating, next, brk) => {
    const r = suggestNext(planned, rating, DEFAULT_RULES)
    expect(r.nextMinutes).toBe(next)
    expect(r.takeBreak).toBe(brk)
  })

  it('uses the configured steps and limits', () => {
    const rules = { minBlock: 1, maxBlock: 90, focusedStep: 3, flowStep: 20, breakMinutes: 7 }
    expect(suggestNext(10, 'focused', rules)).toMatchObject({ nextMinutes: 13, breakMinutes: 7 })
    expect(suggestNext(80, 'flow', rules)).toMatchObject({ nextMinutes: 90, breakMinutes: 0 })
    expect(suggestNext(1, 'distracted', rules).nextMinutes).toBe(1)
  })
})
