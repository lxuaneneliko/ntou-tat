export type MailScrollRow = { uid: string; top: number; bottom: number }

export type MailListScrollSnapshot = {
  scope: string
  top: number
  left: number
  anchors: { uid: string; top: number }[]
}

// A UID anchor survives read-status changes, new mail, and removal of a nearby row.
// The pixel position remains a fallback if none of the saved rows still exists.
export function captureMailScroll(
  scope: string,
  top: number,
  left: number,
  rows: MailScrollRow[],
  viewportHeight: number,
  obscuredTop = 0,
): MailListScrollSnapshot {
  const visible = rows.filter((row) => row.bottom > Math.max(0, obscuredTop) && row.top < viewportHeight)
  return {
    scope,
    top: Math.max(0, top),
    left: Math.max(0, left),
    anchors: visible.slice(0, 12).map(({ uid, top: rowTop }) => ({ uid, top: rowTop })),
  }
}

export function restoredMailScrollTop(
  snapshot: MailListScrollSnapshot,
  scope: string,
  currentTop: number,
  rows: MailScrollRow[],
): number | null {
  if (snapshot.scope !== scope) return null
  const byUid = new Map(rows.map((row) => [row.uid, row]))
  for (const anchor of snapshot.anchors) {
    const row = byUid.get(anchor.uid)
    if (row) return Math.max(0, currentTop + row.top - anchor.top)
  }
  return snapshot.top
}

const readRows = (root: HTMLElement): MailScrollRow[] =>
  [...root.querySelectorAll<HTMLElement>('[data-mail-uid]')].map((row) => {
    const bounds = row.getBoundingClientRect()
    return { uid: row.dataset.mailUid ?? '', top: bounds.top, bottom: bounds.bottom }
  })

export function captureMailListScroll(root: HTMLElement, scope: string): MailListScrollSnapshot | null {
  const view = root.ownerDocument.defaultView
  if (!view) return null
  const headerBottom = root.ownerDocument.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0
  return captureMailScroll(scope, view.scrollY, view.scrollX, readRows(root), view.innerHeight, headerBottom)
}

export function restoreMailListScroll(root: HTMLElement, snapshot: MailListScrollSnapshot, scope: string): void {
  const view = root.ownerDocument.defaultView
  if (!view) return
  const top = restoredMailScrollTop(snapshot, scope, view.scrollY, readRows(root))
  if (top !== null) view.scrollTo({ top, left: snapshot.left, behavior: 'instant' })
}
