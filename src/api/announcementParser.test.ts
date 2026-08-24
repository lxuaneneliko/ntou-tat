import { describe, expect, it } from 'vitest'
import { parseNtouAnnouncements } from './announcementParser'

const homepageHtml = `
  <div id="TabList_post_home_tabpanel">
    <div class="tab sub active">
      <div class="tab-content">
        <ul role="tabpanel">
          <li>
            <a class="important" href="https://ais.ntou.edu.tw/BbsNews.aspx?bbsNoToken=notice-1" title="學校公告 - 【重大公告】停電通知">
              <div class="tabpanel_title"><span class="sr-only">學校公告</span><span>【重大公告】停電通知</span></div>
              <div class="tabpanel_date">營繕組 - 115/08/24</div>
            </a>
          </li>
          <li>
            <a href="https://ais.ntou.edu.tw/BbsNews.aspx?bbsNoToken=notice-2" title="學校公告 - 停車申請公告">
              <div class="tabpanel_title"><span class="sr-only">學校公告</span><span>停車申請公告</span></div>
              <div class="tabpanel_date">駐警隊 - 115/08/18</div>
            </a>
          </li>
          <li class="more_post"><a href="/post/學校公告"><div class="tabpanel_title">更多學校公告</div></a></li>
        </ul>
      </div>
    </div>
    <div class="tab sub active">
      <ul role="tabpanel"><li><a href="https://example.com"><div class="tabpanel_title">招生資料</div></a></li></ul>
    </div>
  </div>
`

describe('NTOU announcement parser', () => {
  it('reads only the school announcement panel', () => {
    expect(parseNtouAnnouncements(homepageHtml)).toEqual([
      {
        id: 'notice-1',
        title: '【重大公告】停電通知',
        source: '營繕組',
        publishedAt: '115/08/24',
        pinned: true,
        url: 'https://ais.ntou.edu.tw/BbsNews.aspx?bbsNoToken=notice-1',
      },
      {
        id: 'notice-2',
        title: '停車申請公告',
        source: '駐警隊',
        publishedAt: '115/08/18',
        pinned: false,
        url: 'https://ais.ntou.edu.tw/BbsNews.aspx?bbsNoToken=notice-2',
      },
    ])
  })

  it('returns no fake announcements when the school panel is missing', () => {
    expect(parseNtouAnnouncements('<main>暫無資料</main>')).toEqual([])
  })
})
