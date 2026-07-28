import { describe, expect, it } from 'vitest'
import { GPA_MAX, hasPassingResult, scoreToGpa } from './gpa'

describe('NTOU 4.0 GPA scale', () => {
  it('caps numeric and letter grades at 4.0', () => {
    expect(GPA_MAX).toBe(4)
    expect(scoreToGpa(100)).toBe(4)
    expect(scoreToGpa(90)).toBe(4)
    expect(scoreToGpa(null, 'A+')).toBe(4)
  })

  it('preserves lower grade bands', () => {
    expect(scoreToGpa(80)).toBe(3.7)
    expect(scoreToGpa(null, 'B+')).toBe(3.3)
    expect(scoreToGpa(59)).toBe(0)
  })

  it('does not count unpublished grades as earned credits', () => {
    expect(hasPassingResult(null)).toBe(false)
    expect(hasPassingResult(null, '未公布')).toBe(false)
    expect(hasPassingResult(null, 'A')).toBe(true)
    expect(hasPassingResult(60)).toBe(true)
  })
})
