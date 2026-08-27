import { describe, expect, it } from 'vitest'
import { parseIndustryNews } from './industryNewsParser'

const industryHtml = `
  <div class="d-item d-title col-sm-12">
    <div class="mbox"><div class="d-txt"><div class="mtitle">
      <a href="https://tlo.ntou.edu.tw/p/406-1082-127227,r1237.php?Lang=zh-tw">【轉知】雲林縣政府設立「撫錢House青年創業基地」</a>
      <i class="mdate after">2026-07-20</i>
    </div></div></div>
  </div>
  <div class="d-item d-title col-sm-12">
    <div class="mbox"><div class="d-txt"><div class="mtitle">
      <a href="https://tlo.ntou.edu.tw/p/406-1082-127226,r1237.php?Lang=zh-tw">【轉知】115年創新創業線上論壇</a>
      <i class="mdate after">2026-07-20</i>
    </div></div></div>
  </div>
`

describe('NTOU industry news parser', () => {
  it('reads the official latest-announcement list and tags its category', () => {
    const items = parseIndustryNews(industryHtml, 'all')
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      title: '【轉知】雲林縣政府設立「撫錢House青年創業基地」',
      publishedAt: '2026-07-20',
      source: '海大產學營運總中心',
      category: 'all',
      url: 'https://tlo.ntou.edu.tw/p/406-1082-127227,r1237.php?Lang=zh-tw',
    })
    expect(items[1]).toMatchObject({
      title: '【轉知】115年創新創業線上論壇',
      category: 'all',
    })
  })

  it('ignores navigation markup and unsafe links', () => {
    expect(parseIndustryNews(`
      <nav><a href="https://tlo.ntou.edu.tw/">首頁</a></nav>
      <div class="d-item d-title"><div class="mtitle"><a href="javascript:alert(1)">不安全消息</a></div></div>
    `, 'all')).toEqual([])
  })
})
