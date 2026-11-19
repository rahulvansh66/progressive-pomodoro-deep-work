/** Progressive Pomodoro rules: decide the break and the next block's length from a rating. */
import type { Rating } from '../types'

export interface Rules {
  minBlock: number
  maxBlock: number
  focusedStep: number
  flowStep: number
  breakMinutes: number
}

export const DEFAULT_RULES: Rules = { minBlock: 2, maxBlock: 60, focusedStep: 5, flowStep: 10, breakMinutes: 5 }

export const MESSAGES: Record<Rating, string> = {
  distracted: 'No stress — shrink the next block and start with clear intent.',
  okay: 'Steady. Keep the same length and build momentum.',
  focused: 'Momentum is building — stretch the next block.',
  flow: "You're flowing — skip the break and keep on flowing!",
}

export interface Suggestion { nextMinutes: number; takeBreak: boolean; breakMinutes: number; message: string }

export function suggestNext(planned: number, rating: Rating, r: Rules = DEFAULT_RULES): Suggestion {
  let next: number
  switch (rating) {
    case 'distracted': next = Math.round(planned * 0.6); break
    case 'okay': next = planned; break
    case 'focused': next = planned + r.focusedStep; break
    case 'flow': next = planned + r.flowStep; break
    default: throw new Error(`unknown rating: ${rating as string}`)
  }
  next = Math.max(r.minBlock, Math.min(r.maxBlock, next))
  return {
    nextMinutes: next,
    takeBreak: rating !== 'flow',
    breakMinutes: rating === 'flow' ? 0 : r.breakMinutes,
    message: MESSAGES[rating],
  }
}
