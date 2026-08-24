import { describe, expect, it } from 'vitest'
import { isNewerVersion, parseLatestRelease, releaseHighlights } from './update'

describe('app update helpers', () => {
  it('compares numeric version segments', () => {
    expect(isNewerVersion('v1.12.6', '1.12.5')).toBe(true)
    expect(isNewerVersion('1.13.0', '1.12.99')).toBe(true)
    expect(isNewerVersion('1.12.5', '1.12.5')).toBe(false)
    expect(isNewerVersion('1.12.4', '1.12.5')).toBe(false)
  })

  it('selects the stable NTOUTAT APK asset', () => {
    const update = parseLatestRelease(
      {
        tag_name: 'v1.12.6',
        name: 'NTOU TAT v1.12.6',
        body: '- 改善登入穩定性\n- 修正課表顯示',
        html_url: 'https://github.com/example/releases/tag/v1.12.6',
        published_at: '2026-08-24T12:00:00Z',
        assets: [
          {
            name: 'NTOUTAT.apk',
            browser_download_url: 'https://github.com/example/releases/download/v1.12.6/NTOUTAT.apk',
          },
        ],
      },
      '1.12.5',
    )

    expect(update?.version).toBe('1.12.6')
    expect(update?.downloadUrl).toContain('/NTOUTAT.apk')
    expect(update?.highlights).toEqual(['改善登入穩定性', '修正課表顯示'])
  })

  it('does not notify when the installed version is current', () => {
    expect(parseLatestRelease({ tag_name: 'v1.12.5' }, '1.12.5')).toBeNull()
  })

  it('turns markdown release notes into short plain-text highlights', () => {
    expect(releaseHighlights('## 更新內容\n1. 新增功能\n[詳細說明](https://example.com)')).toEqual([
      '更新內容',
      '新增功能',
      '詳細說明',
    ])
  })
})
