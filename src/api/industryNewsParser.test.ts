import { describe, expect, it } from 'vitest'
import { parseIndustryNews } from './industryNewsParser'

const industryHtml = `
  <div class="d-item d-title col-sm-12">
    <div class="mbox"><div class="d-txt"><div class="mtitle">
      <a href="https://tlo.ntou.edu.tw/p/406-1082-126280,r1249.php?Lang=zh-tw">勞動部產業新尖兵</a>
      <i class="mdate after">2026-06-11</i>
    </div></div></div>
  </div>
  <div class="d-item d-title col-sm-12">
    <div class="mbox"><div class="d-txt"><div class="mtitle">
      <a href="https://agdigi.atri.org.tw">農業 AI 賦能業界參與計畫</a>
      <i class="mdate after">2025-11-11</i>
    </div></div></div>
  </div>
`

describe('NTOU industry news parser', () => {
  it('reads official industry-center news with internal and external HTTPS links', () => {
    const items = parseIndustryNews(industryHtml)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      title: '勞動部產業新尖兵',
      publishedAt: '2026-06-11',
      source: '海大產學營運總中心',
      url: 'https://tlo.ntou.edu.tw/p/406-1082-126280,r1249.php?Lang=zh-tw',
    })
    expect(items[1]).toMatchObject({
      title: '農業 AI 賦能業界參與計畫',
      url: 'https://agdigi.atri.org.tw/',
    })
  })

  it('ignores navigation markup and unsafe links', () => {
    expect(parseIndustryNews(`
      <nav><a href="https://tlo.ntou.edu.tw/">首頁</a></nav>
      <div class="d-item d-title"><div class="mtitle"><a href="javascript:alert(1)">不安全消息</a></div></div>
    `)).toEqual([])
  })
})
