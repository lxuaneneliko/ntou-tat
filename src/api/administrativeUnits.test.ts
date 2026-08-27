// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  ADMINISTRATIVE_CONTENT_UNITS,
  ADMINISTRATIVE_UNITS,
} from './administrativeUnits'
import { parseDepartmentHomepage } from './departmentSites'

describe('NTOU administrative units', () => {
  it('contains 20 top-level units and 45 subordinate units with unique IDs', () => {
    const children = ADMINISTRATIVE_UNITS.flatMap((unit) => unit.children ?? [])
    expect(ADMINISTRATIVE_UNITS).toHaveLength(20)
    expect(children).toHaveLength(45)
    expect(new Set(ADMINISTRATIVE_CONTENT_UNITS.map((unit) => unit.id)).size).toBe(65)
  })

  it('keeps the six student affairs offices and the official activities page', () => {
    const studentAffairs = ADMINISTRATIVE_UNITS.find((unit) => unit.id === 'student-affairs')!
    expect(studentAffairs.children).toHaveLength(6)
    expect(studentAffairs.children?.find((unit) => unit.id === 'student-activities')).toEqual(expect.objectContaining({
      name: '課外活動指導組',
      shortName: '課指組',
      url: 'https://stu.ntou.edu.tw/p/412-1023-7602.php?Lang=zh-tw',
    }))
  })

  it('uses only secure NTOU websites', () => {
    ADMINISTRATIVE_CONTENT_UNITS.forEach((unit) => {
      const url = new URL(unit.url)
      expect(url.protocol).toBe('https:')
      expect(url.hostname === 'ntou.edu.tw' || url.hostname.endsWith('.ntou.edu.tw')).toBe(true)
    })
  })

  it('preserves named groups that share a parent news feed', () => {
    const international = ADMINISTRATIVE_UNITS.find((unit) => unit.id === 'international')!
    const personnel = ADMINISTRATIVE_UNITS.find((unit) => unit.id === 'personnel')!
    expect(international.children?.every((unit) => unit.feedUrl === international.url)).toBe(true)
    expect(personnel.children?.every((unit) => unit.feedUrl === personnel.url)).toBe(true)
  })

  it('parses app-style categories from an administrative page', () => {
    const activities = ADMINISTRATIVE_CONTENT_UNITS.find((unit) => unit.id === 'student-activities')!
    const overview = parseDepartmentHomepage(`
      <div class="module-complex">
        <nav><a href="#cmb_1023_0">最新消息</a><a href="#cmb_1023_1">場館公告</a></nav>
        <div id="cmb_1023_0"><script>$.hajaxOpenUrl('/app/index.php?Action=mobileloadmod&Type=mobile_rcg_mstr&Nbr=7602','#target','')</script></div>
        <div id="cmb_1023_1"><script>$.hajaxOpenUrl('/app/index.php?Action=mobileloadmod&Type=mobile_rcg_mstr&Nbr=7603','#target','')</script></div>
      </div>
    `, activities)

    expect(overview.categories.map((category) => category.label)).toEqual(['最新消息', '場館公告'])
    expect(overview.categories[0].endpoint).toContain('stu.ntou.edu.tw/app/index.php')
  })
})
