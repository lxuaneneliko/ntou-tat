/* oxlint-disable react/only-export-components -- The exported contracts and formatters keep the injected API independently testable. */

import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  FileText,
  GraduationCap,
  Info,
  Loader2,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

export type CourseSearchSource =
  | 'ntou'
  | 'taipei-alliance'
  | 'other-exchange'
  | 'online-alliance'

export type CourseSearchSourceFilter = CourseSearchSource | 'all'

export type CourseSearchScope = 'all' | 'course' | 'teacher' | 'unit'

export type CourseSearchDegree = 'all' | 'undergraduate' | 'master' | 'doctorate'

export type CourseSearchSelection = 'all' | 'required' | 'elective'

export type CourseSearchSemester = {
  value: string
  label: string
}

export type CourseSearchMeeting = {
  time: string
  classroom?: string
}

export type CourseSearchItem = {
  id: string
  semester: string
  source: CourseSearchSource
  code: string
  title: string
  unit: string
  teacher: string
  credits: number
  enrollment?: number | null
  capacity?: number | null
  selectionType?: string
  meetings?: CourseSearchMeeting[]
}

export type CourseSearchWeek = {
  week: number | string
  topic: string
}

export type CourseSearchDetail = CourseSearchItem & {
  englishTitle?: string
  className?: string
  instructorDepartment?: string
  requirement?: string
  hours?: number | null
  minimumStudents?: number | null
  internship?: boolean | null
  crossListed?: boolean | null
  masterDoctorCombined?: boolean | null
  term?: string
  allEnglish?: boolean | null
  deliveryMode?: string
  audience?: string
  mainField?: string
  subField?: string
  coInstructors?: string
  coreCompetencies?: string
  characteristicField?: string
  description?: string
  descriptionEn?: string
  objective?: string
  objectiveEn?: string
  outline?: string
  outlineEn?: string
  teachingMethod?: string
  teachingMethodEn?: string
  evaluation?: string
  evaluationEn?: string
  prerequisites?: string
  prerequisitesEn?: string
  references?: string
  referencesEn?: string
  sustainableDevelopmentGoals?: string
  referenceUrl?: string
  downloadUrl?: string
  notes?: string
  weeks?: CourseSearchWeek[]
}

export type CourseWithdrawalEstimate = {
  status: 'estimated' | 'unavailable'
  midtermWithdrawalCount?: number | null
  courseEnrollment?: number | null
  initialEnrollment?: number | null
  finalEnrollment?: number | null
  initialCapturedAt?: string
  finalCapturedAt?: string
  ratePercent?: number | null
  explanation?: string
}

export type CourseSearchRequest = {
  query: string
  semester: string
  source: CourseSearchSourceFilter
  scope: CourseSearchScope
  degree: CourseSearchDegree
  selection: CourseSearchSelection
  page: number
  pageSize: number
}

export type CourseSearchPage = {
  items: CourseSearchItem[]
  page: number
  pageSize: number
  total?: number
  hasNextPage?: boolean
}

export type CourseSearchScreenProps = {
  searchCourses: (request: CourseSearchRequest, signal?: AbortSignal) => Promise<CourseSearchPage>
  getCourseDetail: (course: CourseSearchItem, signal?: AbortSignal) => Promise<CourseSearchDetail>
  getWithdrawalEstimate: (
    course: CourseSearchItem,
    signal?: AbortSignal,
  ) => Promise<CourseWithdrawalEstimate | null>
  semesters?: readonly CourseSearchSemester[]
  initialSemester?: string
  initialSource?: CourseSearchSourceFilter
  initialScope?: CourseSearchScope
  initialDegree?: CourseSearchDegree
  initialSelection?: CourseSearchSelection
  pageSize?: number
  onBack?: () => void
  onAddCourse?: (course: CourseSearchItem | CourseSearchDetail) => void | Promise<void>
  isCourseAdded?: (course: CourseSearchItem | CourseSearchDetail) => boolean
}

export type CourseSearchScreenHandle = {
  goBack: () => boolean
}

type SearchCriteria = {
  query: string
  semester: string
  source: CourseSearchSourceFilter
  scope: CourseSearchScope
  degree: CourseSearchDegree
  selection: CourseSearchSelection
}

type WithdrawalStats = {
  initial: number
  final: number
  withdrawn: number
  ratePercent: number
  netChange: number
}

export const COURSE_SEARCH_SOURCE_LABELS: Record<CourseSearchSource, string> = {
  ntou: '本校',
  'taipei-alliance': '北聯大校際',
  'other-exchange': '其他校際',
  'online-alliance': '聯盟線上',
}

const sourceOptions: ReadonlyArray<{ value: CourseSearchSourceFilter; label: string }> = [
  { value: 'all', label: '全部來源' },
  { value: 'ntou', label: '本校' },
  { value: 'taipei-alliance', label: '北聯大校際' },
  { value: 'other-exchange', label: '其他校際' },
  { value: 'online-alliance', label: '聯盟線上' },
]

const scopeOptions: ReadonlyArray<{ value: CourseSearchScope; label: string }> = [
  { value: 'all', label: '全部欄位' },
  { value: 'course', label: '課名／課號' },
  { value: 'teacher', label: '授課老師' },
  { value: 'unit', label: '開課單位' },
]

const degreeOptions: ReadonlyArray<{ value: CourseSearchDegree; label: string }> = [
  { value: 'all', label: '全部部別' },
  { value: 'undergraduate', label: '大學部' },
  { value: 'master', label: '碩士班' },
  { value: 'doctorate', label: '博士班' },
]

const selectionOptions: ReadonlyArray<{ value: CourseSearchSelection; label: string }> = [
  { value: 'all', label: '全部選別' },
  { value: 'required', label: '必修' },
  { value: 'elective', label: '選修' },
]

const numberFormatter = new Intl.NumberFormat('zh-TW')

const messageFromError = (error: unknown) => error instanceof Error
  ? error.message
  : '課程資料暫時無法讀取'

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

const normalizePercent = (value: number) => Math.min(100, Math.max(0, value))

export const deriveWithdrawalStats = (
  estimate: CourseWithdrawalEstimate | null,
): WithdrawalStats | null => {
  if (!estimate || estimate.status !== 'estimated') return null

  const officialWithdrawalCount = typeof estimate.midtermWithdrawalCount === 'number'
    ? estimate.midtermWithdrawalCount
    : undefined
  const initial = typeof estimate.initialEnrollment === 'number'
    ? estimate.initialEnrollment
    : estimate.courseEnrollment
  const final = typeof estimate.finalEnrollment === 'number'
    ? estimate.finalEnrollment
    : typeof initial === 'number' && typeof officialWithdrawalCount === 'number'
      ? Math.max(0, initial - officialWithdrawalCount)
      : undefined

  if (
    typeof initial !== 'number'
    || typeof final !== 'number'
    || initial < 0
    || final < 0
    || (typeof officialWithdrawalCount === 'number' && officialWithdrawalCount < 0)
  ) return null

  const withdrawn = officialWithdrawalCount ?? Math.max(0, initial - final)
  const calculatedRate = initial > 0 ? (withdrawn / initial) * 100 : 0

  return {
    initial,
    final,
    withdrawn,
    ratePercent: normalizePercent(
      typeof estimate.ratePercent === 'number' ? estimate.ratePercent : calculatedRate,
    ),
    netChange: final - initial,
  }
}

export const formatCourseSearchMeetings = (meetings?: CourseSearchMeeting[]) => {
  if (!meetings?.length) return '點入查看上課時間'
  return meetings
    .map((meeting) => meeting.classroom ? `${meeting.time}・${meeting.classroom}` : meeting.time)
    .join('、')
}

const officialText = (value?: string | null) => value?.trim() || '官方未提供'

const DetailTextSection = ({
  title,
  text,
  englishText,
  icon,
}: {
  title: string
  text?: string
  englishText?: string
  icon?: React.ReactNode
}) => (
  <section className="course-search-detail-section">
    <h3>{icon}{title}</h3>
    <p>{officialText(text)}</p>
    {englishText?.trim() ? <p className="course-search-detail-english">{englishText.trim()}</p> : null}
  </section>
)

const DetailDataRow = ({
  label,
  value,
  wide = false,
}: {
  label: string
  value?: string | number | null
  wide?: boolean
}) => (
  <div className={wide ? 'course-search-detail-data-row course-search-detail-data-row-wide' : 'course-search-detail-data-row'}>
    <span>{label}</span>
    <strong>{value === null || value === undefined || value === '' ? '官方未提供' : value}</strong>
  </div>
)

export const CourseSearchScreen = forwardRef<CourseSearchScreenHandle, CourseSearchScreenProps>(
  function CourseSearchScreen({
    searchCourses,
    getCourseDetail,
    getWithdrawalEstimate,
    semesters = [],
    initialSemester,
    initialSource = 'all',
    initialScope = 'all',
    initialDegree = 'all',
    initialSelection = 'all',
    pageSize = 20,
    onBack,
    onAddCourse,
    isCourseAdded,
  }, ref) {
    const firstSemester = initialSemester ?? ''
    const initialCriteriaRef = useRef<SearchCriteria>({
      query: '',
      semester: firstSemester,
      source: initialSource,
      scope: initialScope,
      degree: initialDegree,
      selection: initialSelection,
    })
    const [draftQuery, setDraftQuery] = useState('')
    const [criteria, setCriteria] = useState<SearchCriteria>(initialCriteriaRef.current)
    const [filtersExpanded, setFiltersExpanded] = useState(false)
    const [searchPrompt, setSearchPrompt] = useState<string | null>(null)
    const [results, setResults] = useState<CourseSearchPage>({
      items: [],
      page: 1,
      pageSize,
      total: 0,
      hasNextPage: false,
    })
    const [hasSearched, setHasSearched] = useState(false)
    const [searching, setSearching] = useState(false)
    const [searchError, setSearchError] = useState<string | null>(null)
    const [selectedCourse, setSelectedCourse] = useState<CourseSearchItem | null>(null)
    const [detail, setDetail] = useState<CourseSearchDetail | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)
    const [detailError, setDetailError] = useState<string | null>(null)
    const [withdrawal, setWithdrawal] = useState<CourseWithdrawalEstimate | null | undefined>(undefined)
    const [withdrawalError, setWithdrawalError] = useState<string | null>(null)
    const [addCourseState, setAddCourseState] = useState<'idle' | 'adding' | 'added' | 'error'>('idle')
    const [addCourseError, setAddCourseError] = useState<string | null>(null)
    const searchAbortRef = useRef<AbortController | null>(null)
    const detailAbortRef = useRef<AbortController | null>(null)
    const searchSerialRef = useRef(0)
    const detailSerialRef = useRef(0)

    const loadSearch = useCallback(async (nextPage: number, nextCriteria: SearchCriteria) => {
      const serial = ++searchSerialRef.current
      searchAbortRef.current?.abort()
      const controller = new AbortController()
      searchAbortRef.current = controller
      setSearching(true)
      setSearchError(null)
      setSearchPrompt(null)

      try {
        const nextResults = await searchCourses({
          ...nextCriteria,
          page: nextPage,
          pageSize,
        }, controller.signal)
        if (controller.signal.aborted || serial !== searchSerialRef.current) return
        setResults({
          ...nextResults,
          page: Math.max(1, nextResults.page || nextPage),
          pageSize: Math.max(1, nextResults.pageSize || pageSize),
          items: nextResults.items ?? [],
        })
        setHasSearched(true)
      } catch (error) {
        if (controller.signal.aborted || serial !== searchSerialRef.current || isAbortError(error)) return
        setSearchError(messageFromError(error))
        setHasSearched(true)
      } finally {
        if (serial === searchSerialRef.current) setSearching(false)
      }
    }, [pageSize, searchCourses])

    useEffect(() => () => {
      searchAbortRef.current?.abort()
      detailAbortRef.current?.abort()
    }, [])

    const hasActiveSearch = (nextCriteria: SearchCriteria) => Boolean(
      nextCriteria.query.trim()
      || nextCriteria.semester
      || nextCriteria.source !== 'all'
      || nextCriteria.scope !== 'all'
      || nextCriteria.degree !== 'all'
      || nextCriteria.selection !== 'all',
    )

    const returnToGuidance = (nextCriteria: SearchCriteria, prompt?: string) => {
      searchSerialRef.current += 1
      searchAbortRef.current?.abort()
      setCriteria(nextCriteria)
      setSearching(false)
      setHasSearched(false)
      setSearchError(null)
      setSearchPrompt(prompt ?? null)
      setResults({ items: [], page: 1, pageSize, total: 0, hasNextPage: false })
    }

    const applyFilter = (nextCriteria: SearchCriteria) => {
      setCriteria(nextCriteria)
      if (!hasActiveSearch(nextCriteria)) {
        returnToGuidance(nextCriteria)
        return
      }
      void loadSearch(1, nextCriteria)
    }

    const submitSearch = () => {
      const nextCriteria = { ...criteria, query: draftQuery.trim() }
      if (!hasActiveSearch(nextCriteria)) {
        returnToGuidance(nextCriteria, '請先輸入關鍵字，或至少選擇一項篩選條件')
        return
      }
      setCriteria(nextCriteria)
      void loadSearch(1, nextCriteria)
    }

    const changeSemester = (semester: string) => {
      const nextCriteria = { ...criteria, query: draftQuery.trim(), semester }
      applyFilter(nextCriteria)
    }

    const changeSource = (source: CourseSearchSourceFilter) => {
      const nextCriteria = { ...criteria, query: draftQuery.trim(), source }
      applyFilter(nextCriteria)
    }

    const changeScope = (scope: CourseSearchScope) => {
      applyFilter({ ...criteria, query: draftQuery.trim(), scope })
    }

    const changeDegree = (degree: CourseSearchDegree) => {
      applyFilter({ ...criteria, query: draftQuery.trim(), degree })
    }

    const changeSelection = (selection: CourseSearchSelection) => {
      applyFilter({ ...criteria, query: draftQuery.trim(), selection })
    }

    const clearSearch = () => {
      setDraftQuery('')
      const nextCriteria = { ...criteria, query: '' }
      applyFilter(nextCriteria)
    }

    const openCourse = async (course: CourseSearchItem) => {
      const serial = ++detailSerialRef.current
      detailAbortRef.current?.abort()
      const controller = new AbortController()
      detailAbortRef.current = controller
      setSelectedCourse(course)
      setDetail(null)
      setDetailError(null)
      setWithdrawal(undefined)
      setWithdrawalError(null)
      setAddCourseState('idle')
      setAddCourseError(null)
      setDetailLoading(true)

      const detailRequest = getCourseDetail(course, controller.signal)
        .then((nextDetail) => {
          if (!controller.signal.aborted && serial === detailSerialRef.current) setDetail(nextDetail)
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && serial === detailSerialRef.current && !isAbortError(error)) {
            setDetailError(messageFromError(error))
          }
        })

      const withdrawalRequest = getWithdrawalEstimate(course, controller.signal)
        .then((nextWithdrawal) => {
          if (!controller.signal.aborted && serial === detailSerialRef.current) setWithdrawal(nextWithdrawal)
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && serial === detailSerialRef.current && !isAbortError(error)) {
            setWithdrawal(null)
            setWithdrawalError(messageFromError(error))
          }
        })

      await Promise.all([detailRequest, withdrawalRequest])
      if (!controller.signal.aborted && serial === detailSerialRef.current) setDetailLoading(false)
    }

    const closeDetail = useCallback(() => {
      if (!selectedCourse) return false
      detailSerialRef.current += 1
      detailAbortRef.current?.abort()
      setSelectedCourse(null)
      setDetail(null)
      setDetailError(null)
      setWithdrawal(undefined)
      setWithdrawalError(null)
      setAddCourseState('idle')
      setAddCourseError(null)
      setDetailLoading(false)
      return true
    }, [selectedCourse])

    useImperativeHandle(ref, () => ({ goBack: closeDetail }), [closeDetail])

    const totalPages = useMemo(() => {
      if (typeof results.total !== 'number') return undefined
      return Math.max(1, Math.ceil(results.total / Math.max(1, results.pageSize)))
    }, [results.pageSize, results.total])
    const hasPreviousPage = results.page > 1
    const hasNextPage = results.hasNextPage ?? (totalPages ? results.page < totalPages : false)
    const advancedFilterCount = Number(criteria.scope !== 'all')
      + Number(criteria.degree !== 'all')
      + Number(criteria.selection !== 'all')

    if (selectedCourse) {
      const visibleCourse = detail ?? selectedCourse
      const withdrawalStats = deriveWithdrawalStats(withdrawal ?? null)
      const alreadyAdded = addCourseState === 'added' || Boolean(isCourseAdded?.(visibleCourse))
      const enrollmentLabel = typeof visibleCourse.enrollment === 'number'
        ? `${numberFormatter.format(visibleCourse.enrollment)} 人`
        : '官方未提供'
      const meetingItems = visibleCourse.meetings ?? []
      const addSelectedCourse = async () => {
        if (!onAddCourse || !detail || alreadyAdded || addCourseState === 'adding') return
        setAddCourseState('adding')
        setAddCourseError(null)
        try {
          await onAddCourse(visibleCourse)
          setAddCourseState('added')
        } catch (error) {
          setAddCourseState('error')
          setAddCourseError(messageFromError(error))
        }
      }
      return (
        <section className="course-search-screen course-search-detail-screen">
          <header className="course-search-detail-header">
            <button type="button" onClick={closeDetail} aria-label="返回課程查詢結果">
              <ChevronLeft size={23} aria-hidden="true" />
            </button>
            <div className="course-search-detail-heading">
              <span>處理學期 {visibleCourse.semester.replace(/^(\d{3})([1-4])$/, '$1-$2')}</span>
              <h2>{visibleCourse.title}</h2>
              {detail?.englishTitle ? <p>{detail.englishTitle}</p> : null}
            </div>
            <span className="course-search-source-badge">
              {COURSE_SEARCH_SOURCE_LABELS[visibleCourse.source]}
            </span>
          </header>

          {onAddCourse ? (
            <div className="course-search-add-course-wrap">
              <button
                type="button"
                className="course-search-add-course-button"
                disabled={!detail || alreadyAdded || addCourseState === 'adding'}
                onClick={() => void addSelectedCourse()}
              >
                {addCourseState === 'adding'
                  ? <Loader2 size={18} aria-hidden="true" />
                  : <Plus size={18} aria-hidden="true" />}
                {alreadyAdded
                  ? '已加入我的課程'
                  : addCourseState === 'adding'
                    ? '正在加入'
                    : detailLoading || !detail
                      ? '正在讀取上課時間'
                      : '加入我的課程'}
              </button>
              {addCourseError ? <p role="alert">{addCourseError}</p> : null}
            </div>
          ) : null}

          <div className="course-search-detail-card-grid">
            <section className="course-search-detail-info-card">
              <h3><Info size={19} aria-hidden="true" />海大官方課程資料</h3>
              <div className="course-search-detail-data-grid">
                <DetailDataRow label="課程代碼" value={visibleCourse.code} />
                <DetailDataRow label="開課系所" value={visibleCourse.unit} />
                <DetailDataRow label="授課老師" value={visibleCourse.teacher} />
                <DetailDataRow label="老師單位" value={detail?.instructorDepartment} />
                <DetailDataRow label="跨系整合" value={detail?.crossListed === null || detail?.crossListed === undefined ? null : detail.crossListed ? '是' : '否'} />
                <DetailDataRow label="中文課名" value={visibleCourse.title} />
                <DetailDataRow label="英文課名" value={detail?.englishTitle} />
                <DetailDataRow label="開課年班" value={detail?.className} />
                <DetailDataRow label="學分" value={Number.isFinite(visibleCourse.credits) ? visibleCourse.credits : null} />
                <DetailDataRow label="時數" value={typeof detail?.hours === 'number' ? `${detail.hours} 小時` : null} />
                <DetailDataRow label="人數上限" value={typeof visibleCourse.capacity === 'number' ? `${visibleCourse.capacity} 人` : null} />
                <DetailDataRow label="人數下限" value={typeof detail?.minimumStudents === 'number' ? `${detail.minimumStudents} 人` : null} />
                <DetailDataRow label="全程英語授課" value={detail?.allEnglish === null || detail?.allEnglish === undefined ? null : detail.allEnglish ? '是' : '否'} />
                <DetailDataRow label="選課類別" value={detail?.requirement || visibleCourse.selectionType} />
                <DetailDataRow label="開課期限" value={detail?.term} />
                <DetailDataRow label="是否實習(時數)" value={detail?.internship === null || detail?.internship === undefined ? null : detail.internship ? '是' : '否'} />
              </div>
              <div className="course-search-official-meetings">
                <span><MapPin size={16} aria-hidden="true" />上課時間／地點</span>
              {meetingItems.length ? (
                <div className="course-search-meeting-list">
                  {meetingItems.map((meeting, index) => (
                    <div key={`${meeting.time}-${meeting.classroom ?? ''}-${index}`}>
                      <Clock3 size={17} aria-hidden="true" />
                      <span>
                        <small>上課時間</small>
                        <strong>{meeting.time}</strong>
                        <small>上課地點</small>
                        <strong>{officialText(meeting.classroom)}</strong>
                      </span>
                    </div>
                  ))}
                </div>
                ) : <p className="course-search-official-missing">官方未提供</p>}
              </div>
              <div className="course-search-detail-data-grid course-search-detail-data-grid-after-meetings">
                <DetailDataRow label="是否遠距" value={detail?.deliveryMode} />
                <DetailDataRow label="主領域" value={detail?.mainField} />
                <DetailDataRow label="子領域" value={detail?.subField} />
                <DetailDataRow label="選課人數" value={enrollmentLabel} />
                <DetailDataRow label="碩博合開" value={detail?.masterDoctorCombined === null || detail?.masterDoctorCombined === undefined ? null : detail.masterDoctorCombined ? '是' : '否'} />
                <DetailDataRow label="備註" value={detail?.notes} wide />
                <DetailDataRow label="合授教師姓名" value={detail?.coInstructors} wide />
                <DetailDataRow label="課程核心能力" value={detail?.coreCompetencies} wide />
              </div>
            </section>
          </div>

          <section className="course-search-withdrawal-card" aria-labelledby="course-search-withdrawal-title">
            <div className="course-search-withdrawal-heading">
              <span className="course-search-withdrawal-icon"><BarChart3 size={20} aria-hidden="true" /></span>
              <div>
                <h3 id="course-search-withdrawal-title">退選率</h3>
                <p>依官方退選筆數與課程人數計算</p>
              </div>
            </div>

            {withdrawal === undefined ? (
              <div className="course-search-withdrawal-loading" role="status">
                <Loader2 size={20} aria-hidden="true" />
                <span>正在讀取內建退選資料</span>
              </div>
            ) : withdrawalStats ? (
              <div className="course-search-withdrawal-result">
                <div className="course-search-withdrawal-rate">
                  <strong>{withdrawalStats.ratePercent.toFixed(1)}%</strong>
                  <span>退選率</span>
                </div>
                <div className="course-search-withdrawal-flow">
                  <span><small>退選前人數</small><b>{numberFormatter.format(withdrawalStats.initial)} 人</b></span>
                  <ArrowRight size={19} aria-hidden="true" />
                  <span><small>退選後人數</small><b>{numberFormatter.format(withdrawalStats.final)} 人</b></span>
                </div>
                <p className="course-search-withdrawal-change">
                  <ArrowDownRight size={16} aria-hidden="true" />
                  {withdrawalStats.netChange <= 0
                    ? `退選 ${numberFormatter.format(withdrawalStats.withdrawn)} 人`
                    : `人數紀錄增加 ${numberFormatter.format(withdrawalStats.netChange)} 人，退選率顯示為 0%`}
                </p>
                {withdrawal?.explanation ? (
                  <p className="course-search-withdrawal-note">{withdrawal.explanation}</p>
                ) : null}
              </div>
            ) : (
              <div className="course-search-withdrawal-empty">
                <CircleHelp size={22} aria-hidden="true" />
                <div>
                  <strong>尚無退選資料</strong>
                  <p>{withdrawal?.explanation || withdrawalError || '離線官方資料未提供這門課的退選紀錄。'}</p>
                </div>
              </div>
            )}
          </section>

          {detailError ? (
            <div className="course-search-error" role="alert">
              <AlertCircle size={19} aria-hidden="true" />
              <div><strong>離線課綱讀取失敗</strong><span>{detailError}</span></div>
              <button type="button" onClick={() => void openCourse(selectedCourse)}>重新讀取</button>
            </div>
          ) : detailLoading && !detail ? (
            <div className="course-search-detail-loading" role="status">
              <Loader2 size={24} aria-hidden="true" />
              <span>正在讀取 App 內建課綱</span>
            </div>
          ) : (
            <div className="course-search-detail-content">
              <DetailTextSection title="教學目標" text={detail?.objective} englishText={detail?.objectiveEn} />
              <DetailTextSection title="先修科目" text={detail?.prerequisites} englishText={detail?.prerequisitesEn} />
              <DetailTextSection
                title="教材內容"
                text={detail?.description}
                englishText={detail?.descriptionEn}
                icon={<BookOpen size={18} aria-hidden="true" />}
              />
              <DetailTextSection title="教學方式" text={detail?.teachingMethod} englishText={detail?.teachingMethodEn} />
              <DetailTextSection
                title="參考書目"
                text={detail?.references}
                englishText={detail?.referencesEn}
                icon={<FileText size={18} aria-hidden="true" />}
              />

              <section className="course-search-detail-section course-search-weekly-section">
                <h3><ClipboardList size={18} aria-hidden="true" />教學進度</h3>
                {detail?.weeks?.length ? (
                  <ol className="course-search-week-list">
                    {detail.weeks.map((week, index) => (
                      <li key={`${week.week}-${index}`}>
                        <span>第 {week.week} 週</span>
                        <p>{week.topic}</p>
                      </li>
                    ))}
                  </ol>
                ) : <p>{officialText(detail?.outline)}</p>}
                {detail?.outlineEn?.trim() ? (
                  <p className="course-search-detail-english">{detail.outlineEn.trim()}</p>
                ) : null}
              </section>

              <DetailTextSection title="評量方式" text={detail?.evaluation} englishText={detail?.evaluationEn} />
              <DetailTextSection title="參考網址" text={detail?.referenceUrl} />
              <DetailTextSection title="課程永續發展目標" text={detail?.sustainableDevelopmentGoals} />
              <DetailTextSection title="課程特色領域" text={detail?.characteristicField} />
            </div>
          )}
        </section>
      )
    }

    return (
      <section className="course-search-screen">
        <header className="course-search-header">
          {onBack ? (
            <button type="button" onClick={onBack} aria-label="返回其他功能">
              <ChevronLeft size={23} aria-hidden="true" />
            </button>
          ) : null}
          <div>
            <h2>歷屆課程查詢</h2>
            <p>從課名、課號、老師或開課單位找課</p>
          </div>
          <BookOpen size={24} aria-hidden="true" />
        </header>

        <form
          className="course-search-form"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            submitSearch()
          }}
        >
          <Search size={19} aria-hidden="true" />
          <input
            type="search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="搜尋課名、課號、老師或單位"
            aria-label="搜尋歷屆課程"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {draftQuery ? (
            <button className="course-search-clear-button" type="button" onClick={clearSearch} aria-label="清除搜尋">
              <X size={17} aria-hidden="true" />
            </button>
          ) : null}
          <button className="course-search-submit-button" type="submit" aria-label="搜尋課程" disabled={searching}>
            {searching ? <Loader2 size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
          </button>
        </form>

        <div className="course-search-filter-row">
          <label className="course-search-filter">
            <CalendarDays size={17} aria-hidden="true" />
            <span>學期</span>
            <select value={criteria.semester} onChange={(event) => changeSemester(event.target.value)} aria-label="篩選學期">
              <option value="">全部學期</option>
              {semesters.map((semester) => (
                <option key={semester.value} value={semester.value}>{semester.label}</option>
              ))}
            </select>
          </label>
          <label className="course-search-filter">
            <Building2 size={17} aria-hidden="true" />
            <span>來源</span>
            <select
              value={criteria.source}
              onChange={(event) => changeSource(event.target.value as CourseSearchSourceFilter)}
              aria-label="篩選課程來源"
            >
              {sourceOptions.map((source) => (
                <option key={source.value} value={source.value}>{source.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="course-search-more-filters">
          <button
            type="button"
            className={filtersExpanded
              ? 'course-search-more-toggle course-search-more-toggle-expanded'
              : 'course-search-more-toggle'}
            aria-expanded={filtersExpanded}
            aria-controls="course-search-advanced-filters"
            onClick={() => setFiltersExpanded((current) => !current)}
          >
            <SlidersHorizontal size={17} aria-hidden="true" />
            <span>更多篩選</span>
            {advancedFilterCount ? <small>{advancedFilterCount} 項</small> : null}
            <ChevronDown size={18} aria-hidden="true" />
          </button>

          {filtersExpanded ? (
            <div className="course-search-advanced-filters" id="course-search-advanced-filters">
              <label className="course-search-advanced-filter">
                <span>搜尋範圍</span>
                <select
                  value={criteria.scope}
                  onChange={(event) => changeScope(event.target.value as CourseSearchScope)}
                  aria-label="篩選搜尋範圍"
                >
                  {scopeOptions.map((scope) => (
                    <option key={scope.value} value={scope.value}>{scope.label}</option>
                  ))}
                </select>
              </label>
              <label className="course-search-advanced-filter">
                <span>部別</span>
                <select
                  value={criteria.degree}
                  onChange={(event) => changeDegree(event.target.value as CourseSearchDegree)}
                  aria-label="篩選部別"
                >
                  {degreeOptions.map((degree) => (
                    <option key={degree.value} value={degree.value}>{degree.label}</option>
                  ))}
                </select>
              </label>
              <label className="course-search-advanced-filter">
                <span>必選修</span>
                <select
                  value={criteria.selection}
                  onChange={(event) => changeSelection(event.target.value as CourseSearchSelection)}
                  aria-label="篩選必選修"
                >
                  {selectionOptions.map((selection) => (
                    <option key={selection.value} value={selection.value}>{selection.label}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </div>

        <p className="course-search-offline-note">
          <BookOpen size={15} aria-hidden="true" />
          113-1 起的課程、課綱與退選資料已內建，搜尋與開啟都不會連線校網。
        </p>

        {criteria.source === 'online-alliance' ? (
          <p className="course-search-source-note">
            <CircleHelp size={15} aria-hidden="true" />
            聯盟線上課依官方課名與課綱中的「線上／遠距」標記辨識。
          </p>
        ) : null}

        {searching || hasSearched ? (
          <div className="course-search-result-summary" aria-live="polite">
            <span>
              {searching && !hasSearched
                ? '正在整理歷屆課程'
                : typeof results.total === 'number'
                  ? `找到 ${numberFormatter.format(results.total)} 門課`
                  : `本頁 ${numberFormatter.format(results.items.length)} 門課`}
            </span>
            {criteria.query ? <small>「{criteria.query}」</small> : <small>依目前篩選顯示</small>}
          </div>
        ) : null}

        {searchPrompt ? (
          <div className="course-search-prompt" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{searchPrompt}</span>
          </div>
        ) : null}

        {searchError ? (
          <div className="course-search-error" role="alert">
            <AlertCircle size={20} aria-hidden="true" />
            <div><strong>課程查詢失敗</strong><span>{searchError}</span></div>
            <button type="button" onClick={() => void loadSearch(results.page, criteria)}>重試</button>
          </div>
        ) : null}

        {!hasSearched && !searching && !searchError ? (
          <div className="course-search-state course-search-guide-state">
            <Search size={26} aria-hidden="true" />
            <strong>先找一門想了解的課</strong>
            <span>輸入關鍵字，或選擇學期、來源與更多篩選後開始查詢</span>
          </div>
        ) : searching && !results.items.length ? (
          <div className="course-search-state" role="status">
            <Loader2 size={26} aria-hidden="true" />
            <strong>正在搜尋 App 內建課程資料</strong>
            <span>第一次載入離線索引可能需要一點時間</span>
          </div>
        ) : !searchError && hasSearched && !results.items.length ? (
          <div className="course-search-state">
            <Search size={26} aria-hidden="true" />
            <strong>找不到符合的課程</strong>
            <span>可縮短關鍵字，或改用老師、課號與開課單位搜尋</span>
          </div>
        ) : results.items.length ? (
          <div className="course-search-result-list" aria-busy={searching}>
            {results.items.map((course) => (
              <button
                type="button"
                className="course-search-result-card"
                key={`${course.source}-${course.semester}-${course.id}`}
                onClick={() => void openCourse(course)}
              >
                <span className="course-search-card-topline">
                  <span className="course-search-source-badge">{COURSE_SEARCH_SOURCE_LABELS[course.source]}</span>
                  <span>{course.semester}</span>
                  {course.selectionType ? <span>{course.selectionType}</span> : null}
                </span>
                <strong className="course-search-card-title">{course.title}</strong>
                <span className="course-search-card-time">
                  <Clock3 size={16} aria-hidden="true" />
                  {formatCourseSearchMeetings(course.meetings)}
                </span>
                <span className="course-search-card-meta">
                  <span><GraduationCap size={15} aria-hidden="true" />{course.code}</span>
                  <span><Building2 size={15} aria-hidden="true" />{course.unit}</span>
                  <span><UserRound size={15} aria-hidden="true" />{course.teacher}</span>
                </span>
                <span className="course-search-card-footer">
                  <span>{course.credits} 學分</span>
                  <span>
                    <Users size={15} aria-hidden="true" />
                    {typeof course.enrollment === 'number'
                      ? `${numberFormatter.format(course.enrollment)}${typeof course.capacity === 'number' ? ` / ${numberFormatter.format(course.capacity)}` : ''} 人`
                      : '人數未提供'}
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {results.items.length ? (
          <nav className="course-search-pagination" aria-label="課程搜尋分頁">
            <button
              type="button"
              disabled={!hasPreviousPage || searching}
              onClick={() => void loadSearch(results.page - 1, criteria)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
              上一頁
            </button>
            <span>
              第 {results.page} 頁
              {totalPages ? <small>／共 {totalPages} 頁</small> : null}
            </span>
            <button
              type="button"
              disabled={!hasNextPage || searching}
              onClick={() => void loadSearch(results.page + 1, criteria)}
            >
              下一頁
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </section>
    )
  },
)
