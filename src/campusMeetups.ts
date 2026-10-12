import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin'
import { exchangeCampusSession } from './api/portalHttp'
import { authStore } from './storage/authStorage'
import type { StudentProfile } from './types'
import { CAMPUS_API } from './campusBulletinData'

export const meetupCategories = ['讀書會', '競賽組隊', '運動', '一起參加', '生活', '其他'] as const
export type CampusMeetup = {
  id: string; ownerId: string; hostName: string; title: string; description: string; category: string;
  startsAt: string; endsAt: string; location: string; capacity: number; participantCount: number;
  linkedEventId: string | null; status: 'published' | 'cancelled' | 'hidden'; joined?: boolean;
  participants?: { id: string; name: string }[];
}
export type MeetupInput = Pick<CampusMeetup, 'title' | 'description' | 'category' | 'startsAt' | 'endsAt' | 'location' | 'capacity' | 'linkedEventId'>
type CampusSession = { token: string; expiresAt: string; user: { id: string; studentNumber: string; name: string } }
const KEY = 'ntou_tat_campus_session_v1'
let pending: Promise<CampusSession> | null = null
let generation = 0
export class MeetupError extends Error { status: number; constructor(message: string, status = 0) { super(message); this.status = status } }
const decode = (status: number, raw: unknown) => {
  let value: Record<string, unknown>
  try { value = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown> } catch { throw new MeetupError('揪團服務回應不完整', status) }
  if (status < 200 || status >= 300) throw new MeetupError(typeof value?.error === 'string' ? value.error : '揪團暫時無法使用，請稍後再試', status)
  return value
}
async function stored(): Promise<CampusSession | null> {
  try { const { value } = await SecureStoragePlugin.get({ key: KEY }); return JSON.parse(value) } catch { return null }
}
async function authenticated(profile: StudentProfile, force = false): Promise<CampusSession> {
  if (!Capacitor.isNativePlatform()) throw new MeetupError('請在 Android TAT App 內操作揪團')
  const current = await authStore.getSession()
  if (current?.source !== 'portal' || current.profile.id !== profile.id) throw new MeetupError('請先登入海大 AIS')
  const existing = !force ? await stored() : null
  if (existing?.user.studentNumber === profile.id && Date.parse(existing.expiresAt) > Date.now() + 60000 && /^[a-f0-9]{64}$/.test(existing.token)) return existing
  if (pending) { const value = await pending; if (value.user.studentNumber === profile.id) return value; throw new MeetupError('登入帳號已變更，請再試一次') }
  const start = generation
  pending = (async () => {
    const response = await exchangeCampusSession(profile.id, profile.name)
    const value = decode(response.status, response.data) as unknown as CampusSession
    if (!/^[a-f0-9]{64}$/.test(value.token) || value.user?.studentNumber !== profile.id || !Number.isFinite(Date.parse(value.expiresAt))) throw new MeetupError('揪團身分回應不正確')
    const latest = await authStore.getSession()
    if (start !== generation || latest?.source !== 'portal' || latest.profile.id !== profile.id) throw new MeetupError('登入帳號已變更')
    await SecureStoragePlugin.set({ key: KEY, value: JSON.stringify(value) })
    if (start !== generation) { await SecureStoragePlugin.remove({ key: KEY }); throw new MeetupError('登入帳號已變更') }
    return value
  })().finally(() => { pending = null })
  return pending
}
async function request(path: string, method: string, token: string, body?: unknown) {
  const response = await CapacitorHttp.request({ url: CAMPUS_API + '/api/tat' + path, method, headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { data: body }), responseType: 'json', connectTimeout: 10000, readTimeout: 15000 })
  return decode(response.status, response.data)
}
export async function meetupRequest(profile: StudentProfile, path: string, method = 'GET', body?: unknown) {
  let session = await authenticated(profile)
  try { return { value: await request(path, method, session.token, body), userId: session.user.id } } catch (error) {
    // Only rejected authentication is retried; never replay an ambiguous publication.
    if (!(error instanceof MeetupError) || error.status !== 401) throw error
    session = await authenticated(profile, true)
    return { value: await request(path, method, session.token, body), userId: session.user.id }
  }
}
export async function clearMeetupSession() {
  generation++
  const session = await stored()
  try { await SecureStoragePlugin.remove({ key: KEY }) } catch { /* Absent key is already cleared. */ }
  if (session && Capacitor.isNativePlatform()) try { await request('/logout', 'POST', session.token) } catch { /* Token expires on server after 8 hours even when offline. */ }
}
export function validMeetup(value: unknown): value is CampusMeetup {
  if (!value || typeof value !== 'object') return false
  const m = value as CampusMeetup
  return ['id', 'ownerId', 'hostName', 'title', 'description', 'category', 'location'].every(k => typeof (value as Record<string, unknown>)[k] === 'string') &&
    Number.isFinite(Date.parse(m.startsAt)) && Number.isFinite(Date.parse(m.endsAt)) && Number.isInteger(m.capacity) && m.capacity >= 2 && m.capacity <= 100 && Number.isInteger(m.participantCount) && m.participantCount >= 0 && m.participantCount <= m.capacity && ['published', 'cancelled', 'hidden'].includes(m.status)
}
export async function publicMeetups(signal?: AbortSignal): Promise<CampusMeetup[]> {
  const response = await fetch(CAMPUS_API + '/api/v1/meetups?status=active&limit=100', { signal, credentials: 'omit' })
  const value = decode(response.status, await response.json())
  if (!Array.isArray(value.items)) throw new MeetupError('揪團清單回應不完整')
  return value.items.filter(validMeetup).filter(m => m.status === 'published' && Date.parse(m.endsAt) > Date.now()).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}
