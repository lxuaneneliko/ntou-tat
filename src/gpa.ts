export const GPA_MAX = 4.0

export const hasPassingResult = (score: number | null, letter?: string) => {
  if (score !== null) return score >= 60
  if (!letter?.trim()) return false

  const clean = letter.trim().toUpperCase()
  if (/不及格|未通過|未公布|尚未|^F$/.test(clean)) return false
  return /^(A[+-]?|B[+-]?|C[+-]?|P|PASS|通過|及格)/.test(clean)
}

export const scoreToGpa = (score: number | null, letter?: string) => {
  if (score !== null) {
    if (score >= 90) return 4.0
    if (score >= 85) return 4.0
    if (score >= 80) return 3.7
    if (score >= 77) return 3.3
    if (score >= 73) return 3.0
    if (score >= 70) return 2.7
    if (score >= 67) return 2.3
    if (score >= 63) return 2.0
    if (score >= 60) return 1.7
    return 0.0
  }

  if (!letter) return null

  const clean = letter.trim().toUpperCase()
  if (clean.startsWith('A+')) return 4.0
  if (clean.startsWith('A-')) return 3.7
  if (clean.startsWith('A')) return 4.0
  if (clean.startsWith('B+')) return 3.3
  if (clean.startsWith('B-')) return 2.7
  if (clean.startsWith('B')) return 3.0
  if (clean.startsWith('C+')) return 2.3
  if (clean.startsWith('C-')) return 1.7
  if (clean.startsWith('C')) return 2.0
  if (clean.startsWith('F')) return 0.0
  return null
}
