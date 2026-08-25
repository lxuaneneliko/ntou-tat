import { describe, expect, it } from 'vitest'
import { parseExternalCompetitions } from './competitionParser'

const competitionHtml = `
  <div class="elementor-posts-container">
    <article class="elementor-post elementor-grid-item post-15556 entry">
      <div class="elementor-post__text">
        <h3 class="elementor-post__title">
          <a href="https://cyie.cycu.edu.tw/u-start-18/">🚀【U-start 18啟航無限｜參展團隊全面徵件中！】</a>
        </h3>
        <div class="elementor-post__meta-data"><span class="elementor-post-date">2026-08-04</span></div>
      </div>
    </article>
    <article class="elementor-post elementor-grid-item post-15560 entry">
      <h3 class="elementor-post__title"><a href="/taoyuan-star/">2026桃園之星 × 創天下競賽</a></h3>
      <span class="elementor-post-date">2026-08-04</span>
    </article>
  </div>
`

describe('external competition parser', () => {
  it('reads the CYCU competition cards with their dates and links', () => {
    expect(parseExternalCompetitions(competitionHtml)).toEqual([
      {
        id: 'cycu-15556',
        title: '🚀【U-start 18啟航無限｜參展團隊全面徵件中！】',
        publishedAt: '2026-08-04',
        source: '中原大學創新創業發展中心',
        url: 'https://cyie.cycu.edu.tw/u-start-18/',
      },
      {
        id: 'cycu-15560',
        title: '2026桃園之星 × 創天下競賽',
        publishedAt: '2026-08-04',
        source: '中原大學創新創業發展中心',
        url: 'https://cyie.cycu.edu.tw/taoyuan-star/',
      },
    ])
  })

  it('ignores unrelated page content and off-domain links', () => {
    expect(parseExternalCompetitions('<article><a href="https://example.com">廣告</a></article>')).toEqual([])
  })
})
