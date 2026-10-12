import type { MailDetail, MailFolder, MailInbox, MailSummary } from '../api/mail'
export const MAIL_CACHE_LIMIT = 1000
const DETAIL_BYTE_LIMIT = 512 * 1024
const TOTAL_DETAIL_BYTE_LIMIT = 24 * 1024 * 1024
type CachedMessage = { key: string; account: string; folder: string; summary: MailSummary; detail?: MailDetail; touched: number }
type CachedFolder = { key: string; page: Omit<MailInbox, 'messages'>; folders: MailFolder[]; savedAt: number }
const normalize = (account: string) => account.trim().toLowerCase().replace(/@mail\.ntou\.edu\.tw$/, '')
const folderKey = (account: string, folder: string) => `${normalize(account)}|${folder}`
const messageKey = (account: string, folder: string, uid: string) => `${folderKey(account, folder)}|${uid}`
let connection: Promise<IDBDatabase | null> | undefined
const database = () => connection ??= new Promise((resolve) => {
  if (typeof indexedDB === 'undefined') { resolve(null); return }
  const request = indexedDB.open('ntou-mail-cache-v3', 1)
  request.onupgradeneeded = () => { const db = request.result; db.createObjectStore('messages', { keyPath: 'key' }); db.createObjectStore('folders', { keyPath: 'key' }) }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => resolve(null)
})
const readAll = async <T>(name: string): Promise<T[]> => {
  const db = await database(); if (!db) return []
  return new Promise((resolve) => { const request = db.transaction(name).objectStore(name).getAll(); request.onsuccess = () => resolve(request.result as T[]); request.onerror = () => resolve([]) })
}
const readOne = async <T>(name: string, key: string): Promise<T | null> => {
  const db = await database(); if (!db) return null
  return new Promise((resolve) => { const request = db.transaction(name).objectStore(name).get(key); request.onsuccess = () => resolve(request.result as T ?? null); request.onerror = () => resolve(null) })
}
let mutation: Promise<void> = Promise.resolve()
const serialize = (work: () => Promise<void>) => { const result = mutation.then(work, work); mutation = result.catch(() => {}); return mutation }
export const mergeMailSummaries = (fresh: MailSummary[], cached: MailSummary[], limit = MAIL_CACHE_LIMIT) => [...new Map([...cached, ...fresh].map((item) => [item.uid, item])).values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || Number(b.uid) - Number(a.uid)).slice(0, limit)
const trimDetailBudget = (records: CachedMessage[]) => {
  let bytes = 0
  for (const item of [...records].sort((a, b) => b.touched - a.touched)) if (item.detail) {
    const size = JSON.stringify(item.detail).length * 2
    if (bytes + size > TOTAL_DETAIL_BYTE_LIMIT) delete item.detail
    else bytes += size
  }
}
export const cachedMailPage = async (account: string, folder: string) => {
  const [meta, all] = await Promise.all([readOne<CachedFolder>('folders', folderKey(account, folder)), readAll<CachedMessage>('messages')])
  if (!meta) return null
  const messages = mergeMailSummaries([], all.filter((item) => item.account === normalize(account) && item.folder === folder).map((item) => item.summary))
  return { page: { ...meta.page, offset: 0, nextOffset: messages.length, hasMore: messages.length < meta.page.total, messages } as MailInbox, folders: meta.folders, savedAt: meta.savedAt }
}
export const cacheMailPage = (page: MailInbox, folders: MailFolder[] = [], completeSnapshot = false) => serialize(async () => {
  const db = await database(); if (!db) return
  const previous = await readOne<CachedFolder>('folders', folderKey(page.account, page.folder))
  const reset = page.uidValidity && previous?.page.uidValidity && page.uidValidity !== previous.page.uidValidity
  const allowed = new Set(page.messages.map((item) => item.uid))
  const all = (await readAll<CachedMessage>('messages')).filter((item) => item.account !== normalize(page.account) || item.folder !== page.folder || (!reset && (!completeSnapshot || allowed.has(item.summary.uid))))
  const records = new Map(all.map((item) => [item.key, item])); const now = Date.now()
  for (const summary of page.messages) { const key = messageKey(page.account, page.folder, summary.uid); records.set(key, { ...records.get(key), key, account: normalize(page.account), folder: page.folder, summary, touched: now }) }
  const retained = [...records.values()].sort((a, b) => b.summary.receivedAt.localeCompare(a.summary.receivedAt)).slice(0, MAIL_CACHE_LIMIT)
  trimDetailBudget(retained)
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(['messages', 'folders'], 'readwrite'); const messages = transaction.objectStore('messages'); messages.clear(); retained.forEach((record) => messages.put(record))
    const { messages: ignored, ...metadata } = page; void ignored
    transaction.objectStore('folders').put({ key: folderKey(page.account, page.folder), page: metadata, folders: folders.length ? folders : previous?.folders || [], savedAt: now })
    transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve(); transaction.onabort = () => resolve()
  })
})
export const cachedMailDetail = async (account: string, folder: string, uid: string) => (await readOne<CachedMessage>('messages', messageKey(account, folder, uid)))?.detail || null
export const cacheMailDetail = (account: string, folder: string, detail: MailDetail) => serialize(async () => {
  const db = await database(); if (!db) return
  const key = messageKey(account, folder, detail.uid); const previous = await readOne<CachedMessage>('messages', key)
  if (!previous) return
  // Keep the text and small inline images; large posters and attachments stay on the server.
  const light = { ...detail, bodyImages: detail.bodyImages.filter((image) => image.src.length < 64 * 1024) }
  if (JSON.stringify(light).length * 2 > DETAIL_BYTE_LIMIT) return
  const records = await readAll<CachedMessage>('messages')
  const retained = records.map((item) => item.key === key ? { ...previous, summary: { ...previous.summary, unread: false }, detail: light, touched: Date.now() } : item)
  trimDetailBudget(retained)
  await new Promise<void>((resolve) => { const transaction = db.transaction('messages', 'readwrite'); retained.forEach((item) => transaction.objectStore('messages').put(item)); transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve(); transaction.onabort = () => resolve() })
})
export const updateCachedMail = (account: string, folder: string, uid: string, changes: Partial<MailSummary>, remove = false) => serialize(async () => {
  const db = await database(); if (!db) return
  const key = messageKey(account, folder, uid); const previous = await readOne<CachedMessage>('messages', key); if (!previous) return
  await new Promise<void>((resolve) => { const transaction = db.transaction('messages', 'readwrite'); const store = transaction.objectStore('messages'); if (remove) store.delete(key); else store.put({ ...previous, summary: { ...previous.summary, ...changes }, detail: previous.detail ? { ...previous.detail, ...changes } : undefined }); transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve(); transaction.onabort = () => resolve() })
})
export const clearMailCache = (account: string) => serialize(async () => {
  const db = await database(); if (!db) return
  const [messages, folders] = await Promise.all([readAll<CachedMessage>('messages'), readAll<CachedFolder>('folders')])
  await new Promise<void>((resolve) => { const transaction = db.transaction(['messages', 'folders'], 'readwrite'); messages.filter((item) => item.account === normalize(account)).forEach((item) => transaction.objectStore('messages').delete(item.key)); folders.filter((item) => item.key.startsWith(normalize(account) + '|')).forEach((item) => transaction.objectStore('folders').delete(item.key)); transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve(); transaction.onabort = () => resolve() })
})
