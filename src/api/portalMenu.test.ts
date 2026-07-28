import { describe, expect, it } from 'vitest'
import { parsePortalLoaderUrl, parsePortalSystemNodes } from './portalMenu'

describe('AIS portal menu helpers', () => {
  it('extracts the actual data frame URL from a feature loader', () => {
    const html = `<script>top.mainFrame.location.href='TKE2240_01.aspx';</script>`
    expect(
      parsePortalLoaderUrl(
        html,
        'https://ais.ntou.edu.tw/Application/TKE/TKE22/TKE2240_.aspx?progcd=TKE2240',
      ),
    ).toBe('https://ais.ntou.edu.tw/Application/TKE/TKE22/TKE2240_01.aspx')
  })

  it('keeps the feature URL when no loader target exists', () => {
    const url = 'https://ais.ntou.edu.tw/Application/GRD/example.aspx'
    expect(parsePortalLoaderUrl('<form id="QUERY"></form>', url)).toBe(url)
  })

  it('maps expandable groups and feature pages without exposing raw hrefs', () => {
    const html = `
      <a href="javascript:TreeView_PopulateNode(null, 3, 'x', '教務系統', '', '', '')">教務系統</a>
      <a href="Application/GRD/GRD5010_.aspx?progcd=GRD5010">查詢各式成績</a>
      <a href="javascript:void(0)">說明</a>
    `

    expect(parsePortalSystemNodes(html)).toEqual([
      {
        id: '教務系統',
        title: '教務系統',
        kind: 'group',
        path: ['教務系統'],
      },
      {
        id: '查詢各式成績',
        title: '查詢各式成績',
        kind: 'page',
        path: ['查詢各式成績'],
      },
    ])
  })
})
