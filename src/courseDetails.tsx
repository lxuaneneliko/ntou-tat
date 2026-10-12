import { useEffect, useState } from 'react'
import { Browser } from '@capacitor/browser'
import { RefreshCw } from 'lucide-react'
import { createCourseSearchDataSource } from './courseSearchData'
import type { CourseSearchDetail, CourseSearchItem } from './CourseSearchScreen'
import type { CourseSummary } from './types'
const offlineSource = createCourseSearchDataSource(false)
const onlineSource = createCourseSearchDataSource(false, { offlineCatalogLoader: async () => null, allowNetworkCatalogFallback: true })
export const resolveCourseDetails = async (course: CourseSummary, semester: string, signal: AbortSignal, mock = false): Promise<CourseSearchDetail> => {
  const query = { query: course.code || course.title, semester, source: 'all' as const, scope: 'course' as const, degree: 'all' as const, selection: 'all' as const, page: 1, pageSize: 200 }
  const select = (items: CourseSearchItem[]) => {
    const matches = items.filter((item) => item.code === course.code || item.title.replace(/\s/g, '') === course.title.replace(/\s/g, ''))
    const teachers = matches.filter((item) => item.teacher && course.instructor && (item.teacher.includes(course.instructor) || course.instructor.includes(item.teacher)))
    const result = teachers.length ? teachers : matches
    if (result.length > 1) throw new Error('同名課程有多個開課班別，請至校務系統確認開課系所。')
    if (!result.length) throw new Error('這個學期找不到對應的官方課程，請至校務系統查詢。')
    return result[0]
  }
  if (mock) { const source = createCourseSearchDataSource(true); const page = await source.searchCourses({ ...query, query: '' }, signal); const item = page.items[0]; return { ...await source.getCourseDetail(item, signal), title: course.title, code: course.code, teacher: course.instructor, credits: course.credits } }
  try { const page = await offlineSource.searchCourses(query, signal); return await offlineSource.getCourseDetail(select(page.items), signal) } catch (error) { if (signal.aborted) throw error }
  const page = await onlineSource.searchCourses(query, signal)
  return onlineSource.getCourseDetail(select(page.items), signal)
}
export function OfficialCourseDetails({ course, semester, mock }: { course: CourseSummary; semester: string; mock: boolean }) {
  const [detail, setDetail] = useState<CourseSearchDetail | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    setDetail(null); setError(''); setLoading(true)
    void resolveCourseDetails(course, semester, abort.signal, mock).then((next) => { if (!abort.signal.aborted) setDetail(next) }).catch((reason: unknown) => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : '官方課程資訊暫時無法讀取') }).finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [course, semester, mock, retry])
  return <section className="official-course-details"><div className="section-label">學校開課資訊 · {semester}</div>{loading ? <p className="settings-caption"><RefreshCw size={15} className="spin" />讀取官方課程資料…</p> : error ? <div className="course-detail-retry"><p>{error}</p><button type="button" onClick={() => setRetry(retry + 1)}>重新讀取</button><button type="button" onClick={() => void Browser.open({ url: 'https://ais.ntou.edu.tw/' })}>校務系統</button></div> : detail ? <><dl><div><dt>開課系所</dt><dd>{detail.unit || '未提供'}</dd></div><div><dt>開課班別</dt><dd>{detail.className || '未提供'}</dd></div><div><dt>學分 / 選別</dt><dd>{detail.credits} / {detail.requirement || detail.selectionType || '未提供'}</dd></div><div><dt>授課教師</dt><dd>{detail.teacher || course.instructor}</dd></div></dl>{([['課程目標', detail.objective], ['課程內容', detail.outline || detail.description], ['評量方式', detail.evaluation], ['備註', detail.notes]] as const).map(([label, value]) => value ? <details key={label}><summary>{label}</summary><p>{value}</p></details> : null)}</> : null}</section>
}
