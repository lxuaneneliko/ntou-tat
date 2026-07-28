import type {
  Announcement,
  CalendarEvent,
  CampusLink,
  CourseFile,
  CreditSummary,
  EmergencyContact,
  Grade,
  Semester,
  StudentProfile,
  TimetableResponse,
  TrafficInfo,
} from '../types'

export const mockProfile: StudentProfile = {
  id: '01400000',
  name: '林海晴',
  department: '資訊工程學系',
  grade: '三年級',
  className: '資工三甲',
  email: 'student@example.invalid',
  avatarInitials: '林',
}

export const mockSemesters: Semester[] = [
  { id: '114-2', title: '114 學年度第 2 學期', current: true },
  { id: '114-1', title: '114 學年度第 1 學期', current: false },
]

export const mockTimetable: TimetableResponse = {
  semesterId: '114-2',
  updatedAt: '2026-07-25T08:00:00+08:00',
  slots: [
    {
      id: 'slot-algo-mon',
      courseId: 'cs301',
      courseCode: 'CS301',
      courseTitle: '演算法',
      instructor: '江承祐',
      classroom: '電資大樓 305',
      day: 1,
      startsAt: '10:20',
      endsAt: '12:10',
      section: '3-4',
      credits: 3,
      color: '#0d5f73',
    },
    {
      id: 'slot-ocean-mon',
      courseId: 'oc110',
      courseCode: 'OC110',
      courseTitle: '海洋科學概論',
      instructor: '許雅涵',
      classroom: '海洋一館 212',
      day: 1,
      startsAt: '13:10',
      endsAt: '15:00',
      section: '6-7',
      credits: 2,
      color: '#008c8c',
    },
    {
      id: 'slot-signal-tue',
      courseId: 'ee204',
      courseCode: 'EE204',
      courseTitle: '訊號與系統',
      instructor: '陳柏宇',
      classroom: '電機館 B104',
      day: 2,
      startsAt: '09:10',
      endsAt: '12:10',
      section: '2-4',
      credits: 3,
      color: '#375a7f',
    },
    {
      id: 'slot-ai-wed',
      courseId: 'cs410',
      courseCode: 'CS410',
      courseTitle: '人工智慧導論',
      instructor: '吳家寧',
      classroom: '電資大樓 407',
      day: 3,
      startsAt: '10:20',
      endsAt: '12:10',
      section: '3-4',
      credits: 3,
      color: '#1f7a55',
    },
    {
      id: 'slot-keelung-thu',
      courseId: 'ge230',
      courseCode: 'GE230',
      courseTitle: '基隆文化與城市',
      instructor: '蔡明澤',
      classroom: '人社院 101',
      day: 4,
      startsAt: '13:10',
      endsAt: '15:00',
      section: '6-7',
      credits: 2,
      color: '#a35f22',
    },
    {
      id: 'slot-swim-fri',
      courseId: 'pe202',
      courseCode: 'PE202',
      courseTitle: '體育：游泳',
      instructor: '黃思齊',
      classroom: '體育館游泳池',
      day: 5,
      startsAt: '08:10',
      endsAt: '10:00',
      section: '1-2',
      credits: 1,
      color: '#1976a3',
    },
  ],
}

export const mockGrades: Grade[] = [
  {
    id: 'grade-ds',
    courseId: 'cs220',
    courseTitle: '資料結構',
    semester: '114-1',
    credits: 3,
    score: 91,
    letter: 'A',
    required: true,
    category: '專業必修',
  },
  {
    id: 'grade-db',
    courseId: 'cs330',
    courseTitle: '資料庫系統',
    semester: '114-1',
    credits: 3,
    score: 88,
    letter: 'A-',
    required: true,
    category: '專業必修',
  },
  {
    id: 'grade-eng',
    courseId: 'en201',
    courseTitle: '英文閱讀與表達',
    semester: '114-1',
    credits: 2,
    score: 84,
    letter: 'B+',
    required: false,
    category: '共同教育',
  },
  {
    id: 'grade-service',
    courseId: 'sl101',
    courseTitle: '服務學習',
    semester: '114-1',
    credits: 0,
    score: null,
    letter: '通過',
    required: true,
    category: '服務學習',
  },
]

export const mockCredits: CreditSummary = {
  requiredEarned: 48,
  requiredTotal: 72,
  electiveEarned: 24,
  electiveTotal: 36,
  generalEarned: 18,
  generalTotal: 28,
  serviceEarned: 1,
  serviceTotal: 2,
  totalEarned: 91,
  totalRequired: 138,
}

export const mockCourseFiles: Record<string, CourseFile[]> = {
  cs301: [
    {
      id: 'algo-01',
      courseId: 'cs301',
      title: '第 1 週：複雜度與遞迴',
      type: 'PDF',
      size: '2.4 MB',
      updatedAt: '2026-02-23',
      url: 'https://tronclass.ntou.edu.tw/',
    },
    {
      id: 'algo-hw1',
      courseId: 'cs301',
      title: '作業一：Divide and Conquer',
      type: 'DOCX',
      size: '136 KB',
      updatedAt: '2026-03-02',
      url: 'https://tronclass.ntou.edu.tw/',
    },
  ],
  cs410: [
    {
      id: 'ai-syllabus',
      courseId: 'cs410',
      title: '課程大綱與評分方式',
      type: 'PDF',
      size: '980 KB',
      updatedAt: '2026-02-20',
      url: 'https://tronclass.ntou.edu.tw/',
    },
  ],
}

export const mockAnnouncements: Announcement[] = [
  {
    id: 'ann-academic-calendar',
    title: '114 學年度第 2 學期行事曆更新',
    source: '教務處',
    publishedAt: '2026-07-20',
    pinned: true,
    url: 'https://academic.ntou.edu.tw/',
  },
  {
    id: 'ann-library',
    title: '暑期圖書館開放時間調整',
    source: '圖書暨資訊處',
    publishedAt: '2026-07-18',
    pinned: false,
    url: 'https://li.ntou.edu.tw/',
  },
  {
    id: 'ann-scholarship',
    title: '生活助學金申請提醒',
    source: '生活輔導組',
    publishedAt: '2026-07-12',
    pinned: false,
    url: 'https://stu.ntou.edu.tw/',
  },
]

export const mockCalendar: CalendarEvent[] = [
  { id: 'cal-start', title: '開學日', startsOn: '2026-09-14', category: '教務' },
  { id: 'cal-mid', title: '期中考週', startsOn: '2026-11-02', endsOn: '2026-11-06', category: '考試' },
  { id: 'cal-sport', title: '校慶運動會', startsOn: '2026-11-21', category: '活動' },
  { id: 'cal-final', title: '期末考週', startsOn: '2027-01-04', endsOn: '2027-01-08', category: '考試' },
]

export const mockCampusLinks: CampusLink[] = [
  {
    id: 'ais',
    title: '教學務系統',
    subtitle: '課務、成績、學籍入口',
    url: 'https://ais.ntou.edu.tw/',
    group: '學務',
  },
  {
    id: 'tronclass',
    title: 'TronClass',
    subtitle: '課程公告與教材',
    url: 'https://tronclass.ntou.edu.tw/',
    group: '課程',
  },
  {
    id: 'calendar',
    title: '海大行事曆',
    subtitle: '學期重要日期',
    url: 'https://academic.ntou.edu.tw/',
    group: '校園',
  },
  {
    id: 'library',
    title: '圖書資訊服務',
    subtitle: '館藏、電子資源、授權軟體',
    url: 'https://li.ntou.edu.tw/',
    group: '圖資',
  },
  {
    id: 'dining',
    title: '餐飲資訊',
    subtitle: '校園生活圈',
    url: 'https://olife.ntou.edu.tw/',
    group: '生活',
  },
]

export const mockTraffic: TrafficInfo[] = [
  {
    id: 'bus',
    title: '交通資訊',
    subtitle: '公車、客運與校區交通',
    url: 'https://ga.ntou.edu.tw/',
  },
  {
    id: 'kingbus',
    title: '國光客運',
    subtitle: '基隆往返台北路線',
    url: 'https://www.kingbus.com.tw/',
  },
  {
    id: 'campus-map',
    title: '校園地圖',
    subtitle: '北寧路校區與建築位置',
    url: 'https://www.ntou.edu.tw/',
  },
]

export const emergencyContacts: EmergencyContact[] = [
  { id: 'guard', title: '校安中心', phone: '02-2462-9976', subtitle: '緊急事故通報' },
  { id: 'main', title: '海大總機', phone: '02-2462-2192', subtitle: '校內單位轉接' },
  { id: 'fax', title: '行政聯絡', phone: '02-2462-0724', subtitle: '校務聯絡電話' },
]
