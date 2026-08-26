// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  DEPARTMENT_COLLEGES,
  DEPARTMENT_SITES,
  parseDepartmentHomepage,
  parseDepartmentPosts,
} from './departmentSites'

const cse = DEPARTMENT_SITES.find((site) => site.id === 'cse')!

describe('NTOU department sites', () => {
  it('contains the official 22 undergraduate departments grouped into seven colleges', () => {
    expect(DEPARTMENT_SITES).toHaveLength(22)
    expect(new Set(DEPARTMENT_SITES.map((site) => site.id)).size).toBe(22)
    expect(new Set(DEPARTMENT_SITES.map((site) => site.college))).toEqual(new Set(DEPARTMENT_COLLEGES))
    DEPARTMENT_SITES.forEach((site) => expect(new URL(site.url).hostname.endsWith('.ntou.edu.tw')).toBe(true))
  })

  it('keeps each site own tab labels and discovers its category endpoints', () => {
    const overview = parseDepartmentHomepage(`
      <div class="module-complex">
        <nav><a href="#cmb_460_0">最新消息</a><a href="#cmb_460_1">學業資訊</a></nav>
        <div id="cmb_460_0"><script>$.hajaxOpenUrl('/app/index.php?Action=mobileloadmod&Type=mobile_rcg_mstr&Nbr=1034','#target','')</script></div>
        <div id="cmb_460_1"><script>$.hajaxOpenUrl('/app/index.php?Action=mobileloadmod&amp;Type=mobile_rcg_mstr&amp;Nbr=1112','#target','')</script></div>
      </div>
    `, cse)

    expect(overview.categories.map((category) => category.label)).toEqual(['最新消息', '學業資訊'])
    expect(overview.categories[1].endpoint).toBe('https://cse.ntou.edu.tw/app/index.php?Action=mobileloadmod&Type=mobile_rcg_mstr&Nbr=1112')
  })

  it('uses titled home-page news modules for departments without tabs', () => {
    const overview = parseDepartmentHomepage(`
      <div class="module"><h2 class="mt-title">最新消息</h2><div class="mtitle"><a href="/p/406-1062-128098,r1034.php">徵聘專任教師公告</a><i class="mdate">2026-08-17</i></div></div>
      <div class="module"><h2 class="mt-title">相關連結</h2><div class="mtitle"><a href="https://ais.ntou.edu.tw/">教學務系統</a></div></div>
    `, DEPARTMENT_SITES.find((site) => site.id === 'ee')!)

    expect(overview.categories).toHaveLength(1)
    expect(overview.categories[0].label).toBe('最新消息')
    expect(overview.categories[0].initialPosts?.[0]).toEqual(expect.objectContaining({
      title: '徵聘專任教師公告',
      publishedAt: '2026-08-17',
    }))
  })

  it('reads category posts, resolves relative URLs, and rejects off-domain items', () => {
    const posts = parseDepartmentPosts(`
      <div class="mtitle"><a href="/p/406-1063-128310,r1112.php?Lang=zh-tw">選課注意事項</a><i class="mdate after">2026-08-25</i></div>
      <div class="mtitle"><a href="https://example.com/ad">外站廣告</a></div>
    `, cse.url, 'cse-1112')

    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(expect.objectContaining({
      title: '選課注意事項',
      publishedAt: '2026-08-25',
      url: 'https://cse.ntou.edu.tw/p/406-1063-128310,r1112.php?Lang=zh-tw',
    }))
  })
})
