import { gzip } from 'pako'
import { describe, expect, it } from 'vitest'
import type { OfflineCourseCatalog } from './offlineCourseCatalog'
import {
  createOfflineCourseDetailLoader,
  fnv1a32Utf8,
  offlineCourseDetailKey,
  offlineCourseDetailShardId,
  parseOfflineCourseCatalog,
  parseOfflineCourseCatalogAsset,
  parseOfflineCourseDetailShardAsset,
  summarizeOfflineCourseCatalog,
} from './offlineCourseCatalog'
import type { CourseCatalogDetail } from './api/courseCatalog'

const catalog = (): OfflineCourseCatalog => ({
  version: 1,
  generatedAt: '2026-09-10T00:00:00.000Z',
  range: { from: '110-1', to: '114-2' },
  semesters: ['114-2'],
  items: [{
    id: '1142-ME1001',
    pkno: '12345',
    detailPostback: '',
    semesterId: '114-2',
    courseCode: 'ME1001',
    title: '智慧型控制',
    department: '機械與機電工程學系',
    className: '四年級',
    instructor: '鄭一中',
    instructorDepartment: '機械與機電工程學系',
    credits: 3,
    requirement: '選修',
    enrolledCount: 30,
    maximumStudents: 40,
    minimumStudents: 5,
    internship: false,
    hours: 3,
    crossListed: false,
    term: '單學期',
    source: 'ntou',
    detailUrl: 'https://ais.ntou.edu.tw/detail?PKNO=12345',
    degree: '0',
    degrees: ['0'],
  }],
})

const detail = (): CourseCatalogDetail => ({
  ...catalog().items[0],
  englishTitle: 'Intelligent Control',
  allEnglish: false,
  masterDoctorCombined: false,
  meetingTimes: ['203', '204'],
  classrooms: ['MEB226', 'MEB226'],
  deliveryMode: '否',
  audience: '',
  mainField: '控制',
  subField: '智慧控制',
  coInstructors: '',
  coreCompetencies: '系統整合',
  characteristicField: '人工智慧',
  notes: '',
  objectiveZh: '建立控制基礎',
  objectiveEn: '',
  prerequisitesZh: '',
  prerequisitesEn: '',
  contentZh: '模糊控制',
  contentEn: '',
  teachingMethodZh: '講授',
  teachingMethodEn: '',
  referencesZh: '',
  referencesEn: '',
  scheduleZh: '',
  scheduleEn: '',
  evaluationZh: '考試',
  evaluationEn: '',
  sustainableDevelopmentGoals: 'SDG 4',
  referenceUrl: 'https://example.edu.tw/course',
  downloadUrl: 'https://example.edu.tw/course',
})

const completeV2Catalog = () => {
  const item = catalog().items[0]
  const key = offlineCourseDetailKey(item)
  const shardId = offlineCourseDetailShardId(key, 32)
  const semesters = ['115-1', '114-4', '114-3', '114-2', '114-1', '113-4', '113-3', '113-2', '113-1']
  const shards = Array.from({ length: 32 }, (_, index) => {
    const id = index.toString(16).padStart(2, '0')
    return {
      id,
      path: `data/course-details-113plus/shard-${id}.json.gz.bin`,
      detailCount: id === shardId ? 1 : 0,
    }
  })
  const requiredSuccess = new Set(['113-1', '113-2', '114-1', '114-2'])
  const withdrawals = Object.fromEntries(semesters.map((semester) => [semester, {
    querySucceeded: requiredSuccess.has(semester),
    status: requiredSuccess.has(semester) ? 'success' as const : 'unavailable' as const,
    courses: semester === '114-2' ? [{
      key: '114-2:code:me1001',
      semester: '114-2',
      courseCode: 'ME1001',
      courseTitle: null,
      instructor: null,
      withdrawnCount: 2,
      matchStrategy: 'semester_course_code' as const,
    }] : [],
    ignoredRowCount: 0,
    ...(requiredSuccess.has(semester) ? {} : { reason: 'query_not_confirmed' as const }),
  }]))
  const v2: OfflineCourseCatalog = {
    version: 2,
    generatedAt: '2026-09-10T00:00:00.000Z',
    complete: true,
    range: { from: '113-1', to: '115-1' },
    semesters,
    items: [item],
    detailShards: { algorithm: 'fnv1a32', shardCount: 32, shards },
    withdrawals: { version: 1, semesters: withdrawals },
  }
  return { v2, key, shardId }
}

describe('offline course catalog', () => {
  it('accepts and normalizes a complete catalog', () => {
    const parsed = parseOfflineCourseCatalog(JSON.stringify({
      ...catalog(),
      semesters: ['114-2', '114-2'],
    }))
    expect(parsed.semesters).toEqual(['114-2'])
    expect(parsed.items[0]).toMatchObject({ title: '智慧型控制', degree: '0', degrees: ['0'] })
    expect(summarizeOfflineCourseCatalog(parsed)).toEqual({
      generatedAt: '2026-09-10T00:00:00.000Z',
      from: '110-1',
      to: '114-2',
      semesterCount: 1,
      itemCount: 1,
    })
  })

  it('rejects partial semesters and malformed offerings', () => {
    expect(() => parseOfflineCourseCatalog({ ...catalog(), semesters: ['114-1'] })).toThrow(
      '離線課程資料包含未標記完成的學期',
    )
    expect(() => parseOfflineCourseCatalog({
      ...catalog(),
      items: [{ ...catalog().items[0], credits: Number.NaN }],
    })).toThrow('離線課程資料格式錯誤')
  })

  it('keeps generated JSON gzip-compatible', () => {
    const compressed = gzip(JSON.stringify(catalog()))
    expect(compressed[0]).toBe(0x1f)
    expect(compressed[1]).toBe(0x8b)
    expect(parseOfflineCourseCatalogAsset(compressed).items[0].title).toBe('智慧型控制')
  })

  it('normalizes Unicode before hashing so the app and crawler select the same shard', () => {
    expect(offlineCourseDetailKey({ semesterId: '１１４－２', id: 'ＡＢＣ', pkno: '' }))
      .toBe('114-2:abc')
    expect(fnv1a32Utf8('114-2:智慧型控制')).toBe(0x31322c1d)
    expect(offlineCourseDetailShardId('114-2:智慧型控制', 32)).toBe('1d')
  })

  it('validates the complete 113-1+ index and lazily reads exactly one detail shard', async () => {
    const { v2, key, shardId } = completeV2Catalog()
    const parsed = parseOfflineCourseCatalog(JSON.stringify(v2))
    expect(parsed).toMatchObject({
      version: 2,
      complete: true,
      range: { from: '113-1', to: '115-1' },
    })
    const bytes = gzip(JSON.stringify({
      version: 1,
      shardId,
      details: { [key]: detail() },
    }))
    expect(parseOfflineCourseDetailShardAsset(bytes, shardId, 32).details[key].title)
      .toBe('智慧型控制')

    const reads: string[] = []
    const loader = createOfflineCourseDetailLoader(async (path) => {
      reads.push(path)
      return path.endsWith(`shard-${shardId}.json.gz.bin`) ? bytes : null
    })
    await expect(loader(parsed, parsed.items[0])).resolves.toMatchObject({
      title: '智慧型控制',
      contentZh: '模糊控制',
    })
    await loader(parsed, parsed.items[0])
    expect(reads).toEqual([`data/course-details-113plus/shard-${shardId}.json.gz.bin`])
  })

  it('rejects an incomplete range, missing detail count, or incomplete withdrawal semesters', () => {
    const { v2 } = completeV2Catalog()
    expect(() => parseOfflineCourseCatalog({
      ...v2,
      range: { from: '112-1', to: '115-1' },
    })).toThrow('113-1～115-1')
    expect(() => parseOfflineCourseCatalog({
      ...v2,
      detailShards: {
        ...v2.detailShards!,
        shards: v2.detailShards!.shards.map((shard) => ({ ...shard, detailCount: 0 })),
      },
    })).toThrow('離線課程詳細資料不完整')
    expect(() => parseOfflineCourseCatalog({
      ...v2,
      withdrawals: {
        version: 1,
        semesters: Object.fromEntries(Object.entries(v2.withdrawals!.semesters).slice(1)),
      },
    })).toThrow('離線課程退選資料不完整')
    expect(() => parseOfflineCourseCatalog({
      ...v2,
      withdrawals: {
        version: 1,
        semesters: {
          ...v2.withdrawals!.semesters,
          '113-1': {
            ...v2.withdrawals!.semesters['113-1'],
            querySucceeded: false,
            status: 'unavailable',
            reason: 'query_not_confirmed',
          },
        },
      },
    })).toThrow('離線課程退選資料不完整')
    expect(() => parseOfflineCourseCatalog({
      ...v2,
      withdrawals: {
        version: 1,
        semesters: {
          ...v2.withdrawals!.semesters,
          '114-2': {
            ...v2.withdrawals!.semesters['114-2'],
            querySucceeded: true,
            status: 'unavailable',
            reason: 'query_not_confirmed',
          },
        },
      },
    })).toThrow('離線課程退選資料不完整')
  })
})
