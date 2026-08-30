import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  BookOpenCheck,
  Check,
  CircleAlert,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react'
import {
  analyzeGeneralEducationProgress,
  EIGHT_DOMAIN_KEYS,
  FOUR_DOMAIN_KEYS,
  GENERAL_EDUCATION_DOMAIN_DEFINITIONS,
  type GeneralEducationDomainKey,
  type GeneralEducationOverrides,
} from './generalEducation'
import type { Grade } from './types'

type GeneralEducationProgressSheetProps = {
  grades: Grade[]
  studentId: string
  initialCohortYear: number | null
  loadedSemesters: number
  totalSemesters: number
  loading: boolean
  onReload: () => void
  onClose: () => void
}

const SUPPORTED_COHORT_YEARS = [115, 114, 113, 112, 111, 110]
const ALL_DOMAIN_KEYS = [...FOUR_DOMAIN_KEYS, ...EIGHT_DOMAIN_KEYS]

const cohortStorageKey = (studentId: string) =>
  `ntou_general_education_cohort_v1:${studentId.trim().toUpperCase()}`

const overrideStorageKey = (studentId: string) =>
  `ntou_general_education_overrides_v1:${studentId.trim().toUpperCase()}`

const readStoredCohortYear = (studentId: string, fallback: number | null) => {
  try {
    const raw = localStorage.getItem(cohortStorageKey(studentId))
    if (!raw) return fallback
    const stored = Number(raw)
    return SUPPORTED_COHORT_YEARS.includes(stored) ? stored : fallback
  } catch {
    return fallback
  }
}

const readStoredOverrides = (studentId: string): GeneralEducationOverrides => {
  try {
    const parsed = JSON.parse(localStorage.getItem(overrideStorageKey(studentId)) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, GeneralEducationOverrides[string]] =>
        typeof entry[0] === 'string' &&
        [...ALL_DOMAIN_KEYS, 'ignore'].includes(entry[1] as GeneralEducationOverrides[string]),
      ),
    )
  } catch {
    return {}
  }
}

const writeStoredOverrides = (studentId: string, overrides: GeneralEducationOverrides) => {
  try {
    localStorage.setItem(overrideStorageKey(studentId), JSON.stringify(overrides))
  } catch {
    // Manual review still works for the current session when storage is unavailable.
  }
}

const semesterLabel = (semester: string) => semester.replace('-', '–')

export function GeneralEducationProgressSheet({
  grades,
  studentId,
  initialCohortYear,
  loadedSemesters,
  totalSemesters,
  loading,
  onReload,
  onClose,
}: GeneralEducationProgressSheetProps) {
  const supportedInitialYear = initialCohortYear !== null && SUPPORTED_COHORT_YEARS.includes(initialCohortYear)
    ? initialCohortYear
    : null
  const [cohortYear, setCohortYear] = useState(() =>
    readStoredCohortYear(studentId, supportedInitialYear),
  )
  const [overrides, setOverrides] = useState<GeneralEducationOverrides>(() =>
    readStoredOverrides(studentId),
  )
  const progress = useMemo(
    () => analyzeGeneralEducationProgress(grades, cohortYear ?? 0, overrides),
    [cohortYear, grades, overrides],
  )
  const progressPercent = Math.round(
    progress.supported
      ? Math.min(1, progress.recognizedTotal / progress.requiredTotal) * 100
      : 0,
  )
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCloseRef.current()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [])

  const changeCohortYear = (nextYear: number | null) => {
    setCohortYear(nextYear)
    try {
      if (nextYear === null) localStorage.removeItem(cohortStorageKey(studentId))
      else localStorage.setItem(cohortStorageKey(studentId), String(nextYear))
    } catch {
      // The selected year remains active for this session.
    }
  }

  const updateOverride = (courseKey: string, value: GeneralEducationDomainKey | 'ignore' | '') => {
    const next = { ...overrides }
    if (value) next[courseKey] = value
    else delete next[courseKey]
    setOverrides(next)
    writeStoredOverrides(studentId, next)
  }

  const historyComplete = totalSemesters > 0 && loadedSemesters >= totalSemesters
  const allRequirementsMet = progress.supported
    && progress.remainingTotal === 0
    && progress.sustainabilityRemaining === 0
    && progress.serviceLearningRemainingTerms === 0
  const currentDomainKeys = progress.domainSystem === 'four' ? FOUR_DOMAIN_KEYS : EIGHT_DOMAIN_KEYS
  const domainSystemLabel = progress.domainSystem === 'four' ? '四大領域' : '八大領域'

  return (
    <div className="sheet-backdrop general-ed-backdrop" role="presentation" onClick={onClose}>
      <section
        className="course-sheet general-ed-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="general-ed-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <button ref={closeButtonRef} className="sheet-close" type="button" aria-label="關閉通識修課進度" onClick={onClose}>
          <X size={21} />
        </button>

        <header className="general-ed-heading">
          <div className="general-ed-heading-icon"><BookOpenCheck size={24} /></div>
          <div>
            <span>TRANSCRIPT CHECK</span>
            <h2 id="general-ed-sheet-title">通識修課分析</h2>
          </div>
        </header>

        <div className="general-ed-source-note">
          <ShieldCheck size={17} />
          <span>
            {cohortYear === null
              ? '請先選擇適用課程年度；本頁只讀歷年成績，不讀課表。'
              : <>113-1 起新舊制課名會並列領域；本頁依入學年度採計{progress.domainSystem === 'four' ? ' 〖四大領域〗' : '（八大領域）'}標記。</>}
          </span>
        </div>

        <div className="general-ed-cohort-row">
          <div>
            <span>適用課程年度</span>
            <small>依學號推測；轉學生、復學生請自行調整</small>
          </div>
          <select
            aria-label="適用課程年度"
            value={cohortYear ?? ''}
            onChange={(event) => changeCohortYear(
              event.target.value ? Number(event.target.value) : null,
            )}
          >
            <option value="">請選擇</option>
            {SUPPORTED_COHORT_YEARS.map((year) => (
              <option key={year} value={year}>{year} 學年度</option>
            ))}
          </select>
        </div>

        {progress.supported ? (
        <>
        <section className="general-ed-overview" aria-label="通識總進度">
          <div
            className="general-ed-ring"
            style={{ '--general-ed-progress': `${progressPercent}%` } as CSSProperties}
            role="progressbar"
            aria-label="共同教育十八學分完成進度"
            aria-valuemin={0}
            aria-valuemax={progress.requiredTotal}
            aria-valuenow={progress.recognizedTotal}
          >
            <div><strong>{progress.recognizedTotal}</strong><span>/ {progress.requiredTotal}</span></div>
          </div>
          <div className="general-ed-overview-copy">
            <span>博雅必修＋{domainSystemLabel}</span>
            <strong>
              {allRequirementsMet
                ? '依目前資料已達成'
                : progress.remainingTotal
                  ? `尚缺 ${progress.remainingTotal} 學分`
                  : `尚缺服務學習 ${progress.serviceLearningRemainingTerms} 學期`}
            </strong>
            <small>已辨識 {progress.countedCourses.length} 門；待確認 {progress.unknownCourses.length} 門</small>
          </div>
          <button
            className="general-ed-reload"
            type="button"
            disabled={loading}
            aria-label="重新向 AIS 讀取歷年成績"
            onClick={onReload}
          >
            {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          </button>
        </section>

        <div
          className={`general-ed-history-state ${!historyComplete ? 'incomplete' : ''}`}
          role="status"
          aria-live="polite"
        >
          {loading ? <Loader2 className="spin" size={15} /> : !historyComplete ? <CircleAlert size={15} /> : <Check size={15} />}
          <span>
            {loading
              ? '正在整理歷年成績…'
              : totalSemesters === 0
                ? '尚未取得可查詢的學期清單'
                : `已讀取 ${loadedSemesters}/${totalSemesters} 學期成績${!historyComplete ? '，結果可能尚未完整' : ''}`}
          </span>
        </div>

        <section className="general-ed-required-grid" aria-label="共同必修">
          <RequirementCard
            title="海洋科學概論"
            earned={progress.oceanEarned}
            required={2}
          />
          <RequirementCard
            title="人工智慧概論"
            earned={progress.aiEarned}
            required={2}
          />
          {progress.serviceLearningRequiredTerms ? (
            <RequirementCard
              title="服務學習—愛校服務"
              earned={progress.serviceLearningCompletedTerms}
              required={progress.serviceLearningRequiredTerms}
              unit="學期"
              fullWidth
            />
          ) : null}
        </section>

        <div className="general-ed-section-heading">
          <div>
            <span>{domainSystemLabel}</span>
            <strong>{progress.domainRecognized} / {progress.domainRequired} 學分</strong>
          </div>
          <small>各領域最多採計 4 學分</small>
        </div>

        <section className="general-ed-domain-list" aria-label={`${domainSystemLabel}進度`}>
          {progress.domains.map((domain) => (
            <article className="general-ed-domain-card" key={domain.key}>
              <div className="general-ed-domain-topline">
                <i style={{ background: domain.color }} aria-hidden="true" />
                <strong>{domain.label}</strong>
                <span>{domain.recognized} / {domain.cap}</span>
              </div>
              <div
                className="general-ed-domain-track"
                role="progressbar"
                aria-label={`${domain.label}採計學分`}
                aria-valuemin={0}
                aria-valuemax={domain.cap}
                aria-valuenow={domain.recognized}
              >
                <i style={{ width: `${Math.min(100, domain.recognized / domain.cap * 100)}%`, background: domain.color }} />
              </div>
              {domain.key === 'sustainability' && domain.recognized < 2 ? (
                <small className="general-ed-domain-warning">至少還需 {2 - domain.recognized} 學分</small>
              ) : domain.earned > domain.cap ? (
                <small className="general-ed-domain-extra">已修 {domain.earned}，其中採計 {domain.cap}</small>
              ) : null}
              {domain.courses.length ? (
                <div className="general-ed-course-chips">
                  {domain.courses.map((course) => (
                    <span key={course.key}>
                      <b>{course.title}</b>
                      <small>{semesterLabel(course.semester)} · {course.credits} 學分</small>
                      {course.classification.kind === 'domain' && course.classification.evidence === 'manual' ? (
                        <button type="button" onClick={() => updateOverride(course.key, '')}>撤銷手動分類</button>
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : (
                <small className="general-ed-domain-empty">歷年成績尚未辨識到此領域</small>
              )}
            </article>
          ))}
        </section>

        <section className={`general-ed-missing ${allRequirementsMet ? 'complete' : ''}`}>
          {allRequirementsMet ? <Check size={20} /> : <CircleAlert size={20} />}
          <div>
            <strong>{allRequirementsMet ? `目前資料已達${domainSystemLabel}與共同必修門檻` : '目前還需要修習'}</strong>
            {!allRequirementsMet ? (
              <ul>
                {progress.oceanRemaining ? <li>海洋科學概論 {progress.oceanRemaining} 學分</li> : null}
                {progress.aiRemaining ? <li>人工智慧概論 {progress.aiRemaining} 學分</li> : null}
                {progress.serviceLearningRemainingTerms ? (
                  <li>服務學習—愛校服務 {progress.serviceLearningRemainingTerms} 學期</li>
                ) : null}
                {progress.sustainabilityRemaining ? <li>跨域永續至少 {progress.sustainabilityRemaining} 學分</li> : null}
                {progress.flexibleRemaining ? (
                  <li>
                    另缺 {progress.flexibleRemaining} 學分，請從尚有採計空間的領域搭配補足：
                    {progress.eligibleDomains.map((key) => GENERAL_EDUCATION_DOMAIN_DEFINITIONS[key].shortLabel).join('、')}
                  </li>
                ) : null}
              </ul>
            ) : <p>仍請以學校正式畢業審核結果為準。</p>}
          </div>
        </section>

        {progress.unknownCourses.length ? (
          <section className="general-ed-review">
            <div className="general-ed-section-heading">
              <div>
                <span>待確認課程</span>
                <strong>{progress.unknownCourses.length} 門未自動採計</strong>
              </div>
              <small>沒有官方領域標記就不猜</small>
            </div>
            <div className="general-ed-review-list">
              {progress.unknownCourses.map((course) => {
                const suggestedDomain = course.classification.kind === 'unknown'
                  ? course.classification.suggestedDomain
                  : undefined
                return (
                  <label key={course.key}>
                    <span>
                      <strong>{course.title}</strong>
                      <small>
                        {semesterLabel(course.semester)} · {course.credits} 學分
                        {suggestedDomain ? ` · 可能是${GENERAL_EDUCATION_DOMAIN_DEFINITIONS[suggestedDomain].label}` : ''}
                      </small>
                    </span>
                    <select
                      aria-label={`指定${course.title}所屬領域`}
                      value={overrides[course.key] ?? ''}
                      onChange={(event) => updateOverride(
                        course.key,
                        event.target.value as GeneralEducationDomainKey | 'ignore' | '',
                      )}
                    >
                      <option value="">待確認</option>
                      {currentDomainKeys.map((key) => (
                        <option key={key} value={key}>{GENERAL_EDUCATION_DOMAIN_DEFINITIONS[key].label}</option>
                      ))}
                      <option value="ignore">不是博雅課</option>
                    </select>
                  </label>
                )
              })}
            </div>
          </section>
        ) : null}

        </>
        ) : (
          <section className="general-ed-unsupported" role="status">
            <CircleAlert size={22} />
            <div>
              <strong>尚未套用任何畢業規則</strong>
              <p>本版支援 110～115 學年度的一般學士班。若你確定適用，請在上方自行選擇；轉學生、復學生仍應向系辦確認。</p>
            </div>
          </section>
        )}

        <p className="general-ed-disclaimer">
          本頁是依成績單課名試算；抵免、轉復學生、外國學生、交換生與特殊折抵仍須向系辦確認。
        </p>
      </section>
    </div>
  )
}

function RequirementCard({
  title,
  earned,
  required,
  unit = '學分',
  fullWidth = false,
}: {
  title: string
  earned: number
  required: number
  unit?: '學分' | '學期'
  fullWidth?: boolean
}) {
  const complete = earned >= required
  return (
    <article className={`general-ed-required-card ${complete ? 'complete' : ''} ${fullWidth ? 'full-width' : ''}`}>
      <i aria-hidden="true">{complete ? <Check size={16} /> : required - earned}</i>
      <div>
        <strong>{title}</strong>
        <span>{complete ? `已完成 ${earned}/${required} ${unit}` : `${earned}/${required} ${unit} · 尚缺 ${required - earned} ${unit}`}</span>
      </div>
    </article>
  )
}
