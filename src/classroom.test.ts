import { describe, expect, it } from 'vitest'
import { describeClassroom, formatClassroom, NTOU_BUILDING_NAMES } from './classroom'

describe('classroom labels', () => {
  it('maps every official building prefix', () => {
    expect(Object.keys(NTOU_BUILDING_NAMES)).toHaveLength(40)
  })

  it.each([
    ['BOH412', 'BOH412（人文大樓 412）'],
    ['MEB329', 'MEB329（機械B館 329）'],
    ['INS203', 'INS203（資工系館 203）'],
    ['EE1206', 'EE1206（電機一館 206）'],
    ['GH1106', 'GH1106（綜合一館 106）'],
    ['CE－001', 'CE－001（工學院大樓 001）'],
    ['MZ1003', 'MZ1003（馬祖校區教學大樓 1003）'],
    ['MEB329、INS203', 'MEB329（機械B館 329）、INS203（資工系館 203）'],
  ])('formats %s without replacing its raw code', (input, expected) => {
    expect(formatClassroom(input)).toBe(expected)
  })

  it('uses the named administrative halls before the ADM prefix', () => {
    expect(formatClassroom('ADM001')).toBe('ADM001（海洋廳）')
  })

  it('does not guess unknown or already descriptive classrooms', () => {
    expect(describeClassroom('104A')).toBeNull()
    expect(formatClassroom('104A')).toBe('104A')
    expect(formatClassroom('線上')).toBe('線上')
  })
})
