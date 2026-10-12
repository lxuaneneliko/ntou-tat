import { describe, expect, it } from 'vitest'
import { activityImage } from './campusActivityMedia'
const item = (sourceUrl: string) => ({ sourceUrl, title: '活動' })
describe('activity source images', () => {
  it('reuses the exact official poster, ignoring source query strings', () => {
    expect(activityImage(item('https://art.ntou.edu.tw/p/406-1091-128881,r1034.php?Lang=zh-tw'))).toEqual({ url: 'https://ntou-campus.vercel.app/media/watercolor-exhibition.jpg', alt: '侯彥廷水彩展官方海報', credit: '海大藝文中心' })
  })
  it('matches IG account-prefixed and canonical public post links to one captured image', () => {
    const image = activityImage(item('https://www.instagram.com/enjoywater/p/DdT2xNbzsOF/?utm_source=test'))
    expect(image?.url).toBe('https://ntou-campus.vercel.app/media/ig-DdT2xNbzsOF.webp')
    expect(activityImage(item('https://instagram.com/p/DdT2xNbzsOF'))).toEqual(image)
    expect(image?.credit).toContain('Instagram')
  })
  it('supports captured reels and future stable platform cover paths', () => {
    expect(activityImage(item('https://www.instagram.com/reel/DdEZcllBabm/'))?.url).toContain('ig-DdEZcllBabm.webp')
    expect(activityImage(item('https://www.instagram.com/p/NewCapture_123/'))).toEqual({ url: 'https://ntou-campus.vercel.app/media/ig-NewCapture_123.webp', alt: '活動 · IG 原貼文圖片', credit: 'IG 原貼文' })
  })
  it('does not invent pictures for unrelated official announcements or IG profiles', () => {
    expect(activityImage(item('https://www.ntou.edu.tw/'))).toBeNull()
    expect(activityImage(item('https://www.instagram.com/enjoywater/'))).toBeNull()
    expect(activityImage(item('https://art.ntou.edu.tw/p/unrelated.php'))).toBeNull()
  })
  it('rejects executable URLs, credentials, unexpected ports and lookalike hosts', () => {
    for (const url of ['javascript:alert(1)', 'data:image/png,test', 'https://user:secret@www.instagram.com/p/DdT2xNbzsOF/', 'https://www.instagram.com:8443/p/DdT2xNbzsOF/', 'https://www.instagram.com.attacker.example/p/DdT2xNbzsOF/', 'https://www.instagram.com/p/..%2fsecret/', 'http://www.instagram.com/p/DdT2xNbzsOF/']) expect(activityImage(item(url))).toBeNull()
  })
})
