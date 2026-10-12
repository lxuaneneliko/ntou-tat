import { describe, expect, it } from 'vitest'
import { captureMailScroll, restoredMailScrollTop } from './mailScroll'

const rows = [
  { uid: 'before', top: -100, bottom: -24 },
  { uid: 'partly-visible', top: 52, bottom: 128 },
  { uid: 'next', top: 128, bottom: 204 },
  { uid: 'after', top: 204, bottom: 280 },
  { uid: 'below', top: 844, bottom: 920 },
]

describe('mail list scroll restoration', () => {
  it('captures visible stable UID anchors below the sticky header, not read-state or row index', () => {
    const snapshot = captureMailScroll('account/INBOX/query', 4500, 0, rows, 844, 70)
    expect(snapshot).toEqual({
      scope: 'account/INBOX/query', top: 4500, left: 0,
      anchors: [{ uid: 'partly-visible', top: 52 }, { uid: 'next', top: 128 }, { uid: 'after', top: 204 }],
    })
    expect(restoredMailScrollTop(snapshot, snapshot.scope, 0, rows.map((row) => ({ ...row, top: row.top + 4500 })))).toBe(4500)
  })

  it('compensates for new mail or a changing cache notice above the saved row', () => {
    const snapshot = captureMailScroll('INBOX', 4500, 0, rows, 844, 70)
    const changed = rows.map((row) => ({ ...row, top: row.top + 4500 + 76 + 32 }))
    expect(restoredMailScrollTop(snapshot, 'INBOX', 0, changed)).toBe(4608)
    // Repeating after the browser scroll does not add the offset a second time.
    expect(restoredMailScrollTop(snapshot, 'INBOX', 4608, rows)).toBe(4608)
  })

  it('uses the next still-existing anchor if the opened message is deleted or moved', () => {
    const snapshot = captureMailScroll('INBOX', 4500, 0, rows, 844, 70)
    const changed = rows.filter((row) => row.uid !== 'partly-visible').map((row) => ({ ...row, top: row.top + 4500 - 76 }))
    expect(restoredMailScrollTop(snapshot, 'INBOX', 0, changed)).toBe(4424)
  })

  it('falls back to the saved pixel position when the filtered list has no remaining anchor', () => {
    const snapshot = captureMailScroll('INBOX/search', 900, 3, rows, 844, 70)
    expect(restoredMailScrollTop(snapshot, 'INBOX/search', 0, [])).toBe(900)
    expect(snapshot.left).toBe(3)
  })

  it('does not restore a position for another account, folder, or search', () => {
    const snapshot = captureMailScroll('account-A/INBOX/exam', 900, 0, rows, 844)
    for (const scope of ['account-B/INBOX/exam', 'account-A/Archive/exam', 'account-A/INBOX/other']) {
      expect(restoredMailScrollTop(snapshot, scope, 0, rows)).toBeNull()
    }
  })

  it('clamps negative targets and stores no mail bodies or credentials', () => {
    const snapshot = captureMailScroll('INBOX', -5, -2, [{ uid: 'message', top: 20, bottom: 100 }], 844)
    expect(snapshot.top).toBe(0)
    expect(snapshot.left).toBe(0)
    expect(restoredMailScrollTop(snapshot, 'INBOX', 0, [{ uid: 'message', top: -100, bottom: -20 }])).toBe(0)
    expect(Object.keys(snapshot)).toEqual(['scope', 'top', 'left', 'anchors'])
  })

  it('ignores a header that has scrolled out of view when choosing visible anchors', () => {
    const snapshot = captureMailScroll('INBOX', 4500, 0, rows, 844, -4500)
    expect(snapshot.anchors.map((anchor) => anchor.uid)).toEqual(['partly-visible', 'next', 'after'])
  })
})
