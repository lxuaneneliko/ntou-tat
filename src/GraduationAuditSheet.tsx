import { Browser } from '@capacitor/browser'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  BookMarked,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  ExternalLink,
  GraduationCap,
  Loader2,
  RefreshCw,
  SearchCheck,
  X,
} from 'lucide-react'
import { DEPARTMENT_COLLEGES, DEPARTMENT_SITES } from './api/departmentSites'
import {
  fetchGraduationCurriculum,
  getBundledGraduationCurriculumOptions,
  type GraduationCurriculum,
  type GraduationDepartmentId,
} from './api/graduationRequirements'
import { analyzeGraduationAudit, type GraduationRequirementStatus } from './graduationAudit'
import {
  analyzeGraduationSupplement,
  completedGraduationCourses,
  englishConfirmationSatisfied,
  suggestedEnglishCourseKeys,
  suggestedSwimmingCourseKeys,
  swimmingConfirmationSatisfied,
  type EnglishConfirmation,
  type EnglishConfirmationStatus,
  type GraduationManualSelections,
  type GraduationSelectableCourse,
  type GraduationSupplementRule,
  type SwimmingConfirmation,
  type SwimmingConfirmationStatus,
} from './graduationSupplement'
import type { GeneralEducationOverrides } from './generalEducation'
import type { Grade } from './types'

type GraduationAuditSheetProps = {
  grades: Grade[]
  studentId: string
  profileDepartment: string
  initialCohortYear: number | null
  loadedSemesters: number
  totalSemesters: number
  gradesLoading: boolean
  onReloadGrades: () => void
  onClose: () => void
}

type CourseFilter = 'missing' | 'complete' | 'all'
type SelectionFilter = 'all' | 'suggested' | 'selected'

const SUPPORTED_COHORT_YEARS = [115, 114, 113, 112, 111, 110, 109, 108, 107, 106, 105]

const departmentStorageKey = (studentId: string) =>
  `ntou_graduation_department_v1:${studentId.trim().toUpperCase()}`
const cohortStorageKey = (studentId: string) =>
  `ntou_graduation_cohort_v1:${studentId.trim().toUpperCase()}`
const programVariantStorageKey = (
  studentId: string,
  departmentId: GraduationDepartmentId,
  cohortYear: number,
) => `ntou_graduation_variant_v1:${studentId.trim().toUpperCase()}:${departmentId}:${cohortYear}`
const manualSelectionStorageKey = (
  studentId: string,
  departmentId: GraduationDepartmentId,
  cohortYear: number,
) => `ntou_graduation_manual_v1:${studentId.trim().toUpperCase()}:${departmentId}:${cohortYear}`
const swimmingConfirmationStorageKey = (
  studentId: string,
  departmentId: GraduationDepartmentId,
  cohortYear: number,
) => `ntou_graduation_swimming_v1:${studentId.trim().toUpperCase()}:${departmentId}:${cohortYear}`
const englishConfirmationStorageKey = (
  studentId: string,
  departmentId: GraduationDepartmentId,
  cohortYear: number,
) => `ntou_graduation_english_v1:${studentId.trim().toUpperCase()}:${departmentId}:${cohortYear}`
const generalEducationOverrideStorageKey = (studentId: string) =>
  `ntou_general_education_overrides_v1:${studentId.trim().toUpperCase()}`

const normalizeDepartmentName = (value: string) => value
  .normalize('NFKC')
  .replace(/國立臺灣海洋大學|海洋大學|海大/gu, '')
  .replace(/學士學位學程|學系|系|學程/gu, '')
  .replace(/\s+/gu, '')

const inferDepartmentId = (profileDepartment: string): GraduationDepartmentId | null => {
  const profile = normalizeDepartmentName(profileDepartment)
  if (!profile || /AIS|未提供/u.test(profileDepartment)) return null
  const exact = DEPARTMENT_SITES.find((site) => normalizeDepartmentName(site.name) === profile)
  if (exact) return exact.id as GraduationDepartmentId
  const partial = DEPARTMENT_SITES.find((site) => {
    const candidate = normalizeDepartmentName(site.name)
    return candidate.includes(profile) || profile.includes(candidate)
  })
  return partial ? partial.id as GraduationDepartmentId : null
}

const readInitialDepartment = (studentId: string, profileDepartment: string) => {
  try {
    const stored = localStorage.getItem(departmentStorageKey(studentId))
    if (stored && DEPARTMENT_SITES.some((site) => site.id === stored)) return stored as GraduationDepartmentId
  } catch {
    // Fall back to the AIS profile when local storage is unavailable.
  }
  return inferDepartmentId(profileDepartment)
}

const readInitialCohort = (studentId: string, fallback: number | null) => {
  try {
    const stored = Number(localStorage.getItem(cohortStorageKey(studentId)))
    if (SUPPORTED_COHORT_YEARS.includes(stored)) return stored
  } catch {
    // Use the student-number inference below.
  }
  return fallback && SUPPORTED_COHORT_YEARS.includes(fallback) ? fallback : 115
}

const storeSelection = (studentId: string, departmentId: GraduationDepartmentId | null, year: number) => {
  try {
    if (departmentId) localStorage.setItem(departmentStorageKey(studentId), departmentId)
    localStorage.setItem(cohortStorageKey(studentId), String(year))
  } catch {
    // Selection still works during the current session.
  }
}

const readProgramVariant = (
  studentId: string,
  departmentId: GraduationDepartmentId | null,
  cohortYear: number,
) => {
  if (!departmentId) return ''
  const options = getBundledGraduationCurriculumOptions(departmentId, cohortYear)
  if (options.length === 1) return options[0].programVariantCode ?? ''
  try {
    const stored = localStorage.getItem(programVariantStorageKey(studentId, departmentId, cohortYear)) ?? ''
    return options.some((option) => option.programVariantCode === stored) ? stored : ''
  } catch {
    return ''
  }
}

const readManualSelections = (
  studentId: string,
  departmentId: GraduationDepartmentId | null,
  cohortYear: number,
): GraduationManualSelections => {
  if (!departmentId) return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(
      manualSelectionStorageKey(studentId, departmentId, cohortYear),
    ) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string[]] =>
        typeof entry[0] === 'string' &&
        Array.isArray(entry[1]) &&
        entry[1].every((value) => typeof value === 'string'),
      ),
    )
  } catch {
    return {}
  }
}

const readGeneralEducationOverrides = (studentId: string): GeneralEducationOverrides => {
  try {
    const parsed = JSON.parse(localStorage.getItem(generalEducationOverrideStorageKey(studentId)) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as GeneralEducationOverrides
      : {}
  } catch {
    return {}
  }
}

const defaultSwimmingConfirmation: SwimmingConfirmation = { status: 'unconfirmed', courseKeys: [] }
const swimmingStatuses: SwimmingConfirmationStatus[] = [
  'unconfirmed',
  'course',
  'ability-test',
  'competition',
  'not-applicable',
  'not-met',
]

const readSwimmingConfirmation = (
  studentId: string,
  departmentId: GraduationDepartmentId | null,
  cohortYear: number,
): SwimmingConfirmation => {
  if (!departmentId) return defaultSwimmingConfirmation
  try {
    const parsed = JSON.parse(localStorage.getItem(
      swimmingConfirmationStorageKey(studentId, departmentId, cohortYear),
    ) || '{}') as Partial<SwimmingConfirmation>
    return {
      status: swimmingStatuses.includes(parsed.status as SwimmingConfirmationStatus)
        ? parsed.status as SwimmingConfirmationStatus
        : 'unconfirmed',
      courseKeys: Array.isArray(parsed.courseKeys)
        ? parsed.courseKeys.filter((value): value is string => typeof value === 'string')
        : [],
    }
  } catch {
    return defaultSwimmingConfirmation
  }
}

const defaultEnglishConfirmation: EnglishConfirmation = { status: 'unconfirmed', courseKeys: [] }
const englishStatuses: EnglishConfirmationStatus[] = [
  'unconfirmed',
  'proficiency-test',
  'approved-course',
  'exemption',
  'not-applicable',
  'not-met',
]

const readEnglishConfirmation = (
  studentId: string,
  departmentId: GraduationDepartmentId | null,
  cohortYear: number,
): EnglishConfirmation => {
  if (!departmentId) return defaultEnglishConfirmation
  try {
    const parsed = JSON.parse(localStorage.getItem(
      englishConfirmationStorageKey(studentId, departmentId, cohortYear),
    ) || '{}') as Partial<EnglishConfirmation>
    return {
      status: englishStatuses.includes(parsed.status as EnglishConfirmationStatus)
        ? parsed.status as EnglishConfirmationStatus
        : 'unconfirmed',
      courseKeys: Array.isArray(parsed.courseKeys)
        ? parsed.courseKeys.filter((value): value is string => typeof value === 'string')
        : [],
    }
  } catch {
    return defaultEnglishConfirmation
  }
}

const statusCopy: Record<GraduationRequirementStatus, string> = {
  complete: '已完成',
  missing: '尚缺',
  review: '需確認',
}

export function GraduationAuditSheet({
  grades,
  studentId,
  profileDepartment,
  initialCohortYear,
  loadedSemesters,
  totalSemesters,
  gradesLoading,
  onReloadGrades,
  onClose,
}: GraduationAuditSheetProps) {
  const [departmentId, setDepartmentId] = useState<GraduationDepartmentId | null>(() =>
    readInitialDepartment(studentId, profileDepartment),
  )
  const [cohortYear, setCohortYear] = useState(() => readInitialCohort(studentId, initialCohortYear))
  const [programVariantCode, setProgramVariantCode] = useState(() => {
    const initialDepartment = readInitialDepartment(studentId, profileDepartment)
    const initialCohort = readInitialCohort(studentId, initialCohortYear)
    return readProgramVariant(studentId, initialDepartment, initialCohort)
  })
  const [curriculum, setCurriculum] = useState<GraduationCurriculum | null>(null)
  const [curriculumLoading, setCurriculumLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<CourseFilter>('missing')
  const [manualSelections, setManualSelections] = useState<GraduationManualSelections>(() =>
    readManualSelections(studentId, readInitialDepartment(studentId, profileDepartment), readInitialCohort(studentId, initialCohortYear)),
  )
  const [swimmingConfirmation, setSwimmingConfirmation] = useState<SwimmingConfirmation>(() =>
    readSwimmingConfirmation(studentId, readInitialDepartment(studentId, profileDepartment), readInitialCohort(studentId, initialCohortYear)),
  )
  const [englishConfirmation, setEnglishConfirmation] = useState<EnglishConfirmation>(() =>
    readEnglishConfirmation(studentId, readInitialDepartment(studentId, profileDepartment), readInitialCohort(studentId, initialCohortYear)),
  )
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [])

  const loadCurriculum = useCallback(async (force = false) => {
    if (!departmentId) {
      setCurriculum(null)
      return
    }
    const options = getBundledGraduationCurriculumOptions(departmentId, cohortYear)
    const selectedOption = options.length > 1
      ? options.find((option) => option.programVariantCode === programVariantCode)
      : options[0]
    if (options.length > 1 && !selectedOption) {
      setCurriculum(null)
      setError('')
      setCurriculumLoading(false)
      return
    }
    setCurriculumLoading(true)
    setError('')
    try {
      const result = await fetchGraduationCurriculum(
        departmentId,
        cohortYear,
        force,
        selectedOption?.programVariantCode,
      )
      setCurriculum(result)
      storeSelection(studentId, departmentId, cohortYear)
    } catch (loadError) {
      setCurriculum(null)
      setError(loadError instanceof Error ? loadError.message : '無法讀取海大必修科目表')
    } finally {
      setCurriculumLoading(false)
    }
  }, [cohortYear, departmentId, programVariantCode, studentId])

  useEffect(() => {
    void loadCurriculum(false)
  }, [loadCurriculum])

  useEffect(() => {
    setProgramVariantCode(readProgramVariant(studentId, departmentId, cohortYear))
    setManualSelections(readManualSelections(studentId, departmentId, cohortYear))
    setSwimmingConfirmation(readSwimmingConfirmation(studentId, departmentId, cohortYear))
    setEnglishConfirmation(readEnglishConfirmation(studentId, departmentId, cohortYear))
  }, [cohortYear, departmentId, studentId])

  const curriculumOptions = useMemo(
    () => departmentId ? getBundledGraduationCurriculumOptions(departmentId, cohortYear) : [],
    [cohortYear, departmentId],
  )
  const needsProgramVariant = curriculumOptions.length > 1
  const hasSelectedProgramVariant = !needsProgramVariant || curriculumOptions.some(
    (option) => option.programVariantCode === programVariantCode,
  )

  const audit = useMemo(
    () => curriculum ? analyzeGraduationAudit(curriculum, grades) : null,
    [curriculum, grades],
  )
  const supplement = useMemo(
    () => curriculum
      ? analyzeGraduationSupplement(
          curriculum,
          grades,
          cohortYear,
          manualSelections,
          readGeneralEducationOverrides(studentId),
        )
      : null,
    [cohortYear, curriculum, grades, manualSelections, studentId],
  )
  const progressPercent = curriculum && audit
    ? Math.round(Math.min(1, audit.totalEarnedCredits / curriculum.graduationMinimumCredits) * 100)
    : 0
  const visibleCourses = audit
    ? filter === 'all'
      ? audit.requirements.filter((item) => item.kind === 'course')
      : filter === 'complete'
        ? audit.completeCourses
        : audit.missingCourses
    : []
  const transcriptCourses = useMemo(() => completedGraduationCourses(grades, true), [grades])
  const swimmingSuggestedKeys = useMemo(
    () => suggestedSwimmingCourseKeys(transcriptCourses),
    [transcriptCourses],
  )
  const englishSuggestedKeys = useMemo(
    () => suggestedEnglishCourseKeys(transcriptCourses),
    [transcriptCourses],
  )
  const swimmingRequirement = audit?.reviewRequirements.find((requirement) =>
    /游泳畢業門檻/u.test(requirement.title),
  )
  const englishRequirement = audit?.reviewRequirements.find((requirement) =>
    /(?:英文|英語)畢業門檻/u.test(requirement.title),
  )
  const otherReviewRequirements = audit?.reviewRequirements.filter((requirement) =>
    !/游泳畢業門檻|(?:英文|英語)畢業門檻/u.test(requirement.title),
  ) ?? []
  const hasSeparateFieldRequirement = curriculum?.requirements.some((requirement) =>
    requirement.kind === 'group' &&
    /系訂.*(?:主領域|副領域).*必修及選修|系訂主領域|系訂副領域/u.test(
      requirement.category.replace(/\s+/gu, ''),
    ),
  ) ?? false

  const updateManualRule = (ruleId: string, courseKeys: string[]) => {
    if (!departmentId) return
    const next = { ...manualSelections, [ruleId]: courseKeys }
    setManualSelections(next)
    try {
      localStorage.setItem(
        manualSelectionStorageKey(studentId, departmentId, cohortYear),
        JSON.stringify(next),
      )
    } catch {
      // The selection remains active for this session.
    }
  }

  const updateSwimmingConfirmation = (next: SwimmingConfirmation) => {
    if (!departmentId) return
    setSwimmingConfirmation(next)
    try {
      localStorage.setItem(
        swimmingConfirmationStorageKey(studentId, departmentId, cohortYear),
        JSON.stringify(next),
      )
    } catch {
      // The confirmation remains active for this session.
    }
  }

  const updateEnglishConfirmation = (next: EnglishConfirmation) => {
    if (!departmentId) return
    setEnglishConfirmation(next)
    try {
      localStorage.setItem(
        englishConfirmationStorageKey(studentId, departmentId, cohortYear),
        JSON.stringify(next),
      )
    } catch {
      // The confirmation remains active for this session.
    }
  }

  return (
    <div className="sheet-backdrop graduation-audit-backdrop" role="presentation" onClick={onClose}>
      <section
        className="course-sheet graduation-audit-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="graduation-audit-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <button
          ref={closeButtonRef}
          className="sheet-close graduation-audit-close"
          type="button"
          aria-label="關閉畢業門檻分析"
          onClick={onClose}
        >
          <X size={24} />
        </button>

        <header className="graduation-audit-heading">
          <span className="graduation-audit-mark"><GraduationCap size={28} /></span>
          <div>
            <span>DEGREE AUDIT</span>
            <h2 id="graduation-audit-title">畢業門檻分析</h2>
          </div>
        </header>

        <div className="graduation-audit-selector-grid">
          <label>
            <span>系所</span>
            <select
              aria-label="畢業門檻系所"
              value={departmentId ?? ''}
              onChange={(event) => setDepartmentId(event.target.value as GraduationDepartmentId || null)}
            >
              <option value="">請選擇系所</option>
              {DEPARTMENT_COLLEGES.map((college) => (
                <optgroup label={college} key={college}>
                  {DEPARTMENT_SITES.filter((site) => site.college === college).map((site) => (
                    <option value={site.id} key={site.id}>{site.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            <span>入學年度</span>
            <select
              aria-label="畢業門檻入學年度"
              value={cohortYear}
              onChange={(event) => setCohortYear(Number(event.target.value))}
            >
              {SUPPORTED_COHORT_YEARS.map((year) => <option value={year} key={year}>{year} 學年度</option>)}
            </select>
          </label>
        </div>

        {needsProgramVariant && departmentId ? (
          <div className="graduation-audit-variant-selector">
            <label>
              <span>組別／舊制</span>
              <select
                aria-label="畢業門檻組別"
                value={programVariantCode}
                onChange={(event) => {
                  const next = event.target.value
                  setProgramVariantCode(next)
                  try {
                    localStorage.setItem(programVariantStorageKey(studentId, departmentId, cohortYear), next)
                  } catch {
                    // The selection remains active for this session.
                  }
                }}
              >
                <option value="">請選擇當時所屬組別</option>
                {curriculumOptions.map((option) => (
                  <option value={option.programVariantCode} key={option.programVariantCode}>
                    {option.programVariantName}
                  </option>
                ))}
              </select>
            </label>
            <small>該年度官方科目表分成不同組別，必須選對版本才能分析。</small>
          </div>
        ) : null}

        {!departmentId ? (
          <div className="graduation-audit-empty">
            <BookMarked size={34} />
            <strong>先選擇你的系所</strong>
            <span>目前 AIS 登入頁沒有提供可用的系所名稱，所以第一次需要手動選擇；之後會記住。</span>
          </div>
        ) : !hasSelectedProgramVariant ? (
          <div className="graduation-audit-empty">
            <BookMarked size={34} />
            <strong>請先選擇當時所屬組別</strong>
            <span>不同組別的必修與選修規定不同，App 不會自行替你猜測。</span>
          </div>
        ) : curriculumLoading ? (
          <div className="graduation-audit-empty" role="status">
            <Loader2 className="spin" size={32} />
            <strong>正在讀取官方必修科目表</strong>
            <span>{cohortYear} 學年度沒有資料時，會自動向前查找。</span>
          </div>
        ) : error ? (
          <div className="graduation-audit-error" role="alert">
            <CircleAlert size={24} />
            <div><strong>門檻資料讀取失敗</strong><span>{error}</span></div>
            <button type="button" onClick={() => void loadCurriculum(true)}>重試</button>
          </div>
        ) : curriculum && audit ? (
          <>
            <div className={`graduation-audit-source ${curriculum.fallbackUsed ? 'fallback' : ''}`}>
              <SearchCheck size={17} />
              <span>
                {curriculum.fallbackUsed
                  ? `${curriculum.requestedYear} 學年度查無資料，目前沿用 ${curriculum.sourceYear} 學年度${curriculum.programVariantName ? `－${curriculum.programVariantName}` : ''}規定，僅供參考。`
                  : `已套用 ${curriculum.sourceYear} 學年度 ${curriculum.departmentName}${curriculum.programVariantName ? `－${curriculum.programVariantName}` : ''} 官方必修科目表。`}
              </span>
              <button type="button" aria-label="重新讀取官方必修科目表" onClick={() => void loadCurriculum(true)}>
                <RefreshCw size={16} />
              </button>
            </div>

            <div className="graduation-audit-nonprofessional" role="note">
              <CircleAlert size={18} />
              <div>
                <strong>非專業分析，請自行確認</strong>
                <span>結果可能受課程分類、抵免及系所特殊規定影響，實際資格以系所與教務處正式審核為準。</span>
              </div>
            </div>

            <section className="graduation-audit-overview" aria-label="畢業總學分進度">
              <div
                className="graduation-audit-ring"
                style={{ '--degree-progress': `${progressPercent * 3.6}deg` } as CSSProperties}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={curriculum.graduationMinimumCredits}
                aria-valuenow={audit.totalEarnedCredits}
              >
                <strong>{audit.totalEarnedCredits}</strong>
                <span>/ {curriculum.graduationMinimumCredits}</span>
              </div>
              <div>
                <span>{curriculum.departmentName}</span>
                <strong>{audit.totalRemainingCredits ? `尚缺 ${audit.totalRemainingCredits} 學分` : '已達最低總學分'}</strong>
                <small>已讀取 {loadedSemesters}/{totalSemesters} 學期；體育與軍訓不列入總學分</small>
              </div>
              <button type="button" aria-label="重新向 AIS 讀取歷年成績" disabled={gradesLoading} onClick={onReloadGrades}>
                {gradesLoading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
              </button>
            </section>

            <section className="graduation-audit-stat-grid">
              <article><span>必修總數</span><strong>{curriculum.requiredCredits}</strong><small>官方規定學分</small></article>
              <article><span>選修最低</span><strong>{curriculum.electiveMinimumCredits}</strong><small>須同時符合系規</small></article>
              <article><span>可比對必修</span><strong>{audit.completedRequiredCredits}/{audit.trackableRequiredCredits}</strong><small>依課號與課名</small></article>
            </section>

            <section className={`graduation-audit-elective-structure ${curriculum.departmentElectiveMinimumCredits === null ? 'review' : ''}`}>
              <div>
                <span>OFFICIAL ELECTIVE RULE</span>
                <strong>{curriculum.sourceYear} 學年度選修結構</strong>
              </div>
              <dl>
                <div><dt>選修總額</dt><dd>{curriculum.electiveMinimumCredits} 學分</dd></div>
                <div>
                  <dt>本系選修最低</dt>
                  <dd>{curriculum.departmentElectiveMinimumCredits === null ? '官方原文確認' : `${curriculum.departmentElectiveMinimumCredits} 學分`}</dd>
                </div>
                <div>
                  <dt>系外可補</dt>
                  <dd>{curriculum.outsideElectiveMaximumCredits === null ? '尚無法判定' : `最多 ${curriculum.outsideElectiveMaximumCredits} 學分`}</dd>
                </div>
              </dl>
              <p>
                {hasSeparateFieldRequirement
                  ? '主／副領域列在必修結構中，會獨立採計，不會再重複算入本系其他選修。'
                  : curriculum.departmentElectiveMinimumCredits === null
                    ? '官方備註沒有可可靠解析的本系與系外比例，App 不會自行猜測，請查看原表。'
                    : '依所選系所與入學年度的官方必修科目表計算。'}
              </p>
            </section>

            {supplement?.rules.length ? (
              <section className="graduation-audit-supplement">
                <div className="graduation-audit-section-heading">
                  <div><span>RULE CHECK</span><strong>共同與選修門檻</strong></div>
                  <small>{supplement.completedCount} 完成 · {supplement.remainingCount} 待補</small>
                </div>
                <div className="graduation-audit-rule-list">
                  {supplement.rules.map((rule) => (
                    <GraduationRuleCard
                      key={rule.id}
                      rule={rule}
                      onChange={(courseKeys) => updateManualRule(rule.id, courseKeys)}
                    />
                  ))}
                </div>
                <p className="graduation-audit-rule-note">
                  手動採計與確認結果僅用於本機畢業進度估算，系統會依你的選擇重新計算；實際畢業資格仍以系所及教務處正式審核結果為準。
                </p>
              </section>
            ) : null}

            {swimmingRequirement ? (
              <section className="graduation-audit-swimming">
                <div className="graduation-audit-section-heading">
                  <div><span>MANUAL VERIFY</span><strong>游泳畢業門檻</strong></div>
                  <small>手動確認</small>
                </div>
                <SwimmingConfirmationCard
                  confirmation={swimmingConfirmation}
                  courses={transcriptCourses}
                  suggestedCourseKeys={swimmingSuggestedKeys}
                  note={swimmingRequirement.notes}
                  onChange={updateSwimmingConfirmation}
                />
              </section>
            ) : null}

            {englishRequirement ? (
              <section className="graduation-audit-threshold">
                <div className="graduation-audit-section-heading">
                  <div><span>MANUAL VERIFY</span><strong>英文畢業門檻</strong></div>
                  <small>手動確認</small>
                </div>
                <EnglishConfirmationCard
                  confirmation={englishConfirmation}
                  courses={transcriptCourses}
                  suggestedCourseKeys={englishSuggestedKeys}
                  note={englishRequirement.notes}
                  onChange={updateEnglishConfirmation}
                />
              </section>
            ) : null}

            {loadedSemesters < totalSemesters ? (
              <div className="graduation-audit-history-warning">
                <CircleAlert size={17} />
                <span>歷年成績尚未完整，缺課清單可能不準；請先按上方重新整理。</span>
              </div>
            ) : null}

            <section className="graduation-audit-course-section">
              <div className="graduation-audit-section-heading">
                <div><span>COURSE CHECK</span><strong>必修課程檢核</strong></div>
                <small>{audit.completeCourses.length} 完成 · {audit.missingCourses.length} 尚缺</small>
              </div>
              <div className="graduation-audit-filters" role="group" aria-label="必修課程篩選">
                <button type="button" className={filter === 'missing' ? 'active' : ''} onClick={() => setFilter('missing')}>尚缺</button>
                <button type="button" className={filter === 'complete' ? 'active' : ''} onClick={() => setFilter('complete')}>已完成</button>
                <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部</button>
              </div>
              <div className="graduation-audit-course-list">
                {visibleCourses.length ? visibleCourses.map((course) => (
                  <article className={course.status} key={course.id}>
                    <span className="graduation-audit-course-status">
                      {course.status === 'complete' ? <Check size={16} /> : <CircleAlert size={16} />}
                    </span>
                    <div>
                      <strong>{course.title}</strong>
                      <span>{course.category}{course.codes.length ? ` · ${course.codes.join('、')}` : ''}</span>
                      {course.notes ? <small>{course.notes}</small> : null}
                    </div>
                    <b>{statusCopy[course.status]}<small>{course.earnedCredits}/{course.credits}</small></b>
                  </article>
                )) : (
                  <div className="graduation-audit-list-empty">
                    <Check size={21} /><span>{filter === 'missing' ? '目前沒有可辨識的未完成必修' : '這個分類沒有課程'}</span>
                  </div>
                )}
              </div>
            </section>

            {otherReviewRequirements.length ? (
              <section className="graduation-audit-review">
                <div className="graduation-audit-section-heading">
                  <div><span>MANUAL CHECK</span><strong>需另外確認</strong></div>
                  <small>{otherReviewRequirements.length} 項</small>
                </div>
                {otherReviewRequirements.map((requirement) => (
                  <article key={requirement.id}>
                    <CircleAlert size={17} />
                    <div><strong>{requirement.title}</strong><span>{requirement.notes || '成績單無法判定此項目是否完成。'}</span></div>
                  </article>
                ))}
              </section>
            ) : null}

            {(curriculum.electiveNotes || curriculum.graduationNotes || curriculum.generalNotes) ? (
              <details className="graduation-audit-notes">
                <summary>查看系所選修與畢業備註</summary>
                {curriculum.electiveNotes ? <p><strong>選修規定</strong>{curriculum.electiveNotes}</p> : null}
                {curriculum.graduationNotes ? <p><strong>畢業規定</strong>{curriculum.graduationNotes}</p> : null}
                {curriculum.generalNotes ? <p><strong>其他備註</strong>{curriculum.generalNotes}</p> : null}
              </details>
            ) : null}

            <button className="graduation-audit-official-link" type="button" onClick={() => void Browser.open({ url: curriculum.sourceUrl })}>
              <ExternalLink size={16} /><span>開啟海大官方畢業門檻</span>
            </button>
            <p className="graduation-audit-disclaimer">
              此功能屬非專業分析，僅依歷年成績、課號與官方必修科目表試算；抵免、轉系、雙主修、學程、英文與游泳檢定，請自行確認並以系辦及正式畢業審核為準。
            </p>
          </>
        ) : null}
      </section>
    </div>
  )
}

function GraduationRuleCard({
  rule,
  onChange,
}: {
  rule: GraduationSupplementRule
  onChange: (courseKeys: string[]) => void
}) {
  const [selectionFilter, setSelectionFilter] = useState<SelectionFilter>('all')
  const selected = new Set(rule.selectedCourseKeys)
  const suggested = new Set(rule.automaticCourseKeys)
  const locked = new Set(rule.lockedCourseKeys)
  const visibleCourses = rule.selectableCourses.filter((course) =>
    selectionFilter === 'all' ||
    (selectionFilter === 'suggested' && suggested.has(course.key)) ||
    (selectionFilter === 'selected' && selected.has(course.key)),
  )
  const progress = rule.required > 0 ? Math.min(100, rule.earned / rule.required * 100) : 100
  const toggleCourse = (courseKey: string) => {
    if (locked.has(courseKey)) return
    const next = new Set(selected)
    if (next.has(courseKey)) next.delete(courseKey)
    else next.add(courseKey)
    onChange([...next])
  }

  return (
    <article className={`graduation-audit-rule ${rule.status}`}>
      <div className="graduation-audit-rule-main">
        <span className="graduation-audit-rule-icon">
          {rule.status === 'complete' ? <Check size={17} /> : <ClipboardCheck size={17} />}
        </span>
        <div>
          <strong>{rule.title}</strong>
          <small>{rule.description}</small>
        </div>
        <b>
          {rule.earned}/{rule.required}
          <small>{rule.unit}</small>
        </b>
      </div>
      <div
        className="graduation-audit-rule-track"
        role="progressbar"
        aria-label={`${rule.title}完成進度`}
        aria-valuemin={0}
        aria-valuemax={rule.required}
        aria-valuenow={rule.earned}
      >
        <i style={{ width: `${progress}%` }} />
      </div>
      <div className="graduation-audit-rule-result">
        <span>{rule.status === 'complete' ? '已達成' : `尚缺 ${rule.remaining} ${rule.unit}`}</span>
        <em>{rule.method === 'automatic' ? '自動分析' : '手動採計'}</em>
      </div>

      {rule.method !== 'automatic' ? (
        <details className="graduation-audit-rule-picker">
          <summary>
            <span>選擇採計課程</span>
            <small>已選 {rule.selectedCourseKeys.length} 門</small>
            <ChevronDown size={16} />
          </summary>
          <div className="graduation-audit-rule-picker-body">
            <SelectionFilters value={selectionFilter} onChange={setSelectionFilter} />
            {visibleCourses.length ? visibleCourses.map((course) => (
              <label key={course.key}>
                <input
                  type="checkbox"
                  checked={selected.has(course.key)}
                  disabled={locked.has(course.key)}
                  onChange={() => toggleCourse(course.key)}
                />
                <span>
                  <strong>
                    {course.title}
                    {locked.has(course.key)
                      ? <em>由本系選修帶入</em>
                      : suggested.has(course.key) ? <em>建議確認</em> : null}
                  </strong>
                  <small>{course.semester.replace('-', '–')} · {course.category || '未標示選別'}</small>
                  {rule.title === '體育必修' && !suggested.has(course.key) && selected.has(course.key)
                    ? <small className="graduation-audit-course-caution">系統未辨識為體育課，已依你的選擇採計</small>
                    : null}
                </span>
                <b>{course.credits ? `${course.credits} 學分` : '0 學分'}</b>
              </label>
            )) : (
              <div className="graduation-audit-rule-picker-empty">
                {rule.selectableCourses.length ? '這個篩選目前沒有課程' : '歷年成績中尚未找到可選課程'}
              </div>
            )}
          </div>
        </details>
      ) : null}
    </article>
  )
}

function SelectionFilters({
  value,
  onChange,
}: {
  value: SelectionFilter
  onChange: (value: SelectionFilter) => void
}) {
  return (
    <div className="graduation-audit-rule-picker-filters" role="group" aria-label="採計課程篩選">
      <button type="button" className={value === 'all' ? 'active' : ''} onClick={() => onChange('all')}>全部課程</button>
      <button type="button" className={value === 'suggested' ? 'active' : ''} onClick={() => onChange('suggested')}>系統建議</button>
      <button type="button" className={value === 'selected' ? 'active' : ''} onClick={() => onChange('selected')}>只看已選</button>
    </div>
  )
}

const swimmingStatusLabels: Record<SwimmingConfirmationStatus, string> = {
  unconfirmed: '尚未確認',
  course: '已符合－修習游泳課程',
  'ability-test': '已符合－通過游泳能力檢測',
  competition: '已符合－游泳競賽證明',
  'not-applicable': '不適用／特殊規定',
  'not-met': '尚未符合',
}

function SwimmingConfirmationCard({
  confirmation,
  courses,
  suggestedCourseKeys,
  note,
  onChange,
}: {
  confirmation: SwimmingConfirmation
  courses: GraduationSelectableCourse[]
  suggestedCourseKeys: string[]
  note: string
  onChange: (confirmation: SwimmingConfirmation) => void
}) {
  const [selectionFilter, setSelectionFilter] = useState<SelectionFilter>('all')
  const selected = new Set(confirmation.courseKeys)
  const suggested = new Set(suggestedCourseKeys)
  const satisfied = swimmingConfirmationSatisfied(confirmation)
  const visibleCourses = courses.filter((course) =>
    selectionFilter === 'all' ||
    (selectionFilter === 'suggested' && suggested.has(course.key)) ||
    (selectionFilter === 'selected' && selected.has(course.key)),
  )
  const toggleCourse = (courseKey: string) => {
    const next = new Set(selected)
    if (next.has(courseKey)) next.delete(courseKey)
    else next.add(courseKey)
    onChange({ ...confirmation, courseKeys: [...next] })
  }

  return (
    <article className={`graduation-audit-swimming-card ${satisfied ? 'complete' : 'review'}`}>
      <div className="graduation-audit-swimming-status">
        <span>{satisfied ? <Check size={17} /> : <CircleAlert size={17} />}</span>
        <div>
          <strong>
            {satisfied
              ? '已手動確認符合'
              : confirmation.status === 'course'
                ? '請指定採計的游泳課程'
                : swimmingStatusLabels[confirmation.status]}
          </strong>
          <small>{note || '此門檻可能由課程、能力檢測或競賽證明完成，請依實際狀況確認。'}</small>
        </div>
      </div>
      <label className="graduation-audit-swimming-select">
        <span>確認方式</span>
        <select
          aria-label="游泳畢業門檻狀態"
          value={confirmation.status}
          onChange={(event) => onChange({
            status: event.target.value as SwimmingConfirmationStatus,
            courseKeys: confirmation.courseKeys,
          })}
        >
          {swimmingStatuses.map((status) => (
            <option value={status} key={status}>{swimmingStatusLabels[status]}</option>
          ))}
        </select>
      </label>
      {confirmation.status === 'course' ? (
        <details className="graduation-audit-rule-picker" open>
          <summary>
            <span>指定游泳課程</span>
            <small>已選 {confirmation.courseKeys.length} 門</small>
            <ChevronDown size={16} />
          </summary>
          <div className="graduation-audit-rule-picker-body">
            <SelectionFilters value={selectionFilter} onChange={setSelectionFilter} />
            {visibleCourses.length ? visibleCourses.map((course) => (
              <label key={course.key}>
                <input type="checkbox" checked={selected.has(course.key)} onChange={() => toggleCourse(course.key)} />
                <span>
                  <strong>{course.title}{suggested.has(course.key) ? <em>建議採計</em> : null}</strong>
                  <small>{course.semester.replace('-', '–')} · {course.category || '未標示選別'}</small>
                </span>
                <b>{course.credits ? `${course.credits} 學分` : '0 學分'}</b>
              </label>
            )) : (
              <div className="graduation-audit-rule-picker-empty">
                {courses.length ? '這個篩選目前沒有課程' : '歷年成績中尚未找到可選課程'}
              </div>
            )}
          </div>
        </details>
      ) : null}
    </article>
  )
}

const englishStatusLabels: Record<EnglishConfirmationStatus, string> = {
  unconfirmed: '尚未確認',
  'proficiency-test': '已符合－通過英語能力檢定',
  'approved-course': '已符合－修習認可課程',
  exemption: '已符合－抵免／免修或特殊規定',
  'not-applicable': '不適用',
  'not-met': '尚未符合',
}

function EnglishConfirmationCard({
  confirmation,
  courses,
  suggestedCourseKeys,
  note,
  onChange,
}: {
  confirmation: EnglishConfirmation
  courses: GraduationSelectableCourse[]
  suggestedCourseKeys: string[]
  note: string
  onChange: (confirmation: EnglishConfirmation) => void
}) {
  const [selectionFilter, setSelectionFilter] = useState<SelectionFilter>('all')
  const selected = new Set(confirmation.courseKeys)
  const suggested = new Set(suggestedCourseKeys)
  const satisfied = englishConfirmationSatisfied(confirmation)
  const visibleCourses = courses.filter((course) =>
    selectionFilter === 'all' ||
    (selectionFilter === 'suggested' && suggested.has(course.key)) ||
    (selectionFilter === 'selected' && selected.has(course.key)),
  )
  const toggleCourse = (courseKey: string) => {
    const next = new Set(selected)
    if (next.has(courseKey)) next.delete(courseKey)
    else next.add(courseKey)
    onChange({ ...confirmation, courseKeys: [...next] })
  }

  return (
    <article className={`graduation-audit-swimming-card ${satisfied ? 'complete' : 'review'}`}>
      <div className="graduation-audit-swimming-status">
        <span>{satisfied ? <Check size={17} /> : <CircleAlert size={17} />}</span>
        <div>
          <strong>
            {satisfied
              ? '已手動確認符合'
              : confirmation.status === 'approved-course'
                ? '請指定採計的英文課程'
                : englishStatusLabels[confirmation.status]}
          </strong>
          <small>{note || '英文門檻可能依入學年度、檢定、認可課程或免修規定不同，請依實際狀況確認。'}</small>
        </div>
      </div>
      <label className="graduation-audit-swimming-select">
        <span>確認方式</span>
        <select
          aria-label="英文畢業門檻狀態"
          value={confirmation.status}
          onChange={(event) => onChange({
            status: event.target.value as EnglishConfirmationStatus,
            courseKeys: confirmation.courseKeys,
          })}
        >
          {englishStatuses.map((status) => (
            <option value={status} key={status}>{englishStatusLabels[status]}</option>
          ))}
        </select>
      </label>
      {confirmation.status === 'approved-course' ? (
        <details className="graduation-audit-rule-picker" open>
          <summary>
            <span>指定認可的英文課程</span>
            <small>已選 {confirmation.courseKeys.length} 門</small>
            <ChevronDown size={16} />
          </summary>
          <div className="graduation-audit-rule-picker-body">
            <SelectionFilters value={selectionFilter} onChange={setSelectionFilter} />
            {visibleCourses.length ? visibleCourses.map((course) => (
              <label key={course.key}>
                <input type="checkbox" checked={selected.has(course.key)} onChange={() => toggleCourse(course.key)} />
                <span>
                  <strong>{course.title}{suggested.has(course.key) ? <em>建議確認</em> : null}</strong>
                  <small>{course.semester.replace('-', '–')} · {course.category || '未標示選別'}</small>
                </span>
                <b>{course.credits ? `${course.credits} 學分` : '0 學分'}</b>
              </label>
            )) : (
              <div className="graduation-audit-rule-picker-empty">
                {courses.length ? '這個篩選目前沒有課程' : '歷年成績中尚未找到可選課程'}
              </div>
            )}
          </div>
        </details>
      ) : null}
    </article>
  )
}
