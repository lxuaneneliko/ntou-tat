// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
const mocks = vi.hoisted(() => ({ feed: vi.fn(), request: vi.fn() }))
vi.mock('./campusMeetups', async () => { const real = await vi.importActual<typeof import('./campusMeetups')>('./campusMeetups'); return { ...real, publicMeetups: mocks.feed, meetupRequest: mocks.request } })
vi.mock('./ActivityPoster', () => ({ ActivityPoster: () => null }))
import { CampusMeetupsPanel } from './CampusMeetupsPanel'
const profile = { id: '11501001', name: '測試同學', department: '機械系', grade: '一', avatarInitials: '測' }
const group = { id: 'meetup-one', ownerId: 'tat-owner', hostName: '同學', title: '讀書會', description: '一起準備考試', category: '讀書會', location: '海大圖書館', startsAt: '2030-10-11T00:00:00Z', endsAt: '2030-10-11T01:00:00Z', capacity: 4, participantCount: 1, linkedEventId: null, status: 'published', joined: false }
let container: HTMLDivElement, root: Root
async function click(label: string) { const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label); expect(button).toBeTruthy(); await act(async () => button!.click()) }
async function fill(label: string, value: string) {
  const row = [...container.querySelectorAll('label')].find(l => l.textContent?.startsWith(label))!, input = row.querySelector('input,textarea') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}
beforeEach(async () => {
  vi.clearAllMocks(); mocks.feed.mockResolvedValue([group]); mocks.request.mockImplementation(async (_p, path, method) => ({ value: method === 'POST' || path.endsWith('/join') ? { ok: true } : group, userId: 'tat-guest' }))
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } }); Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => root.render(<CampusMeetupsPanel profile={profile} events={[]} query="" draftEvent={null} onConsumeDraft={() => {}} />))
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); document.body.style.overflow = '' })
it('renders pinned public cards and a create button without web login/redirect', () => { expect(container.querySelectorAll('.meetup-card')).toHaveLength(1); expect(container.textContent).toContain('發起揪團'); expect(container.querySelectorAll('a')).toHaveLength(0) })
it('submits a native meetup and displays owner controls', async () => {
  mocks.request.mockResolvedValue({ value: group, userId: group.ownerId })
  await click('發起揪團'); await fill('揪團名稱', '週三读書會'); await fill('介紹', '一起準備考試')
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  expect(mocks.request).toHaveBeenCalledWith(profile, '/meetups', 'POST', expect.objectContaining({ title: '週三读書會', description: '一起準備考試', capacity: 4, linkedEventId: null }))
  expect(container.textContent).toContain('揪團已發布'); expect(container.textContent).toContain('取消揪團')
})
it('joins and leaves via the native API and refreshes participant state', async () => {
  let joined = false
  mocks.request.mockImplementation(async (_p, path, method) => { if (path.endsWith('/join')) joined = method === 'POST'; return { value: { ...group, joined }, userId: 'tat-guest' } })
  await act(async () => (container.querySelector('.meetup-card') as HTMLButtonElement).click()); await click('加入揪團'); expect(container.textContent).toContain('退出揪團'); await click('退出揪團')
  expect(mocks.request).toHaveBeenCalledWith(profile, '/meetups/meetup-one/join', 'POST', undefined); expect(mocks.request).toHaveBeenCalledWith(profile, '/meetups/meetup-one/join', 'DELETE', undefined)
})
it('does not show a successful publication when AIS verification fails', async () => {
  mocks.request.mockRejectedValue(new Error('AIS 身分無法核對'))
  await click('發起揪團'); await fill('揪團名稱', '讀書會'); await fill('介紹', '討論')
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  expect(container.querySelector('[role=alert]')?.textContent).toBe('AIS 身分無法核對'); expect(container.textContent).not.toContain('揪團已發布'); expect(container.querySelector('dialog[open]')).toBeTruthy()
})
it('Android-style cancel event closes the modal and restores the page', async () => { await click('發起揪團'); await act(async () => container.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }))); expect(container.querySelector('dialog')).toBeNull(); expect(document.body.style.overflow).toBe('') })
