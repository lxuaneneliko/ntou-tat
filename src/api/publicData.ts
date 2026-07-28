import type { CampusLink, CreditSummary, EmergencyContact, TrafficInfo } from '../types'

export const emptyCredits: CreditSummary = {
  requiredEarned: 0,
  requiredTotal: 0,
  electiveEarned: 0,
  electiveTotal: 0,
  generalEarned: 0,
  generalTotal: 0,
  serviceEarned: 0,
  serviceTotal: 0,
  totalEarned: 0,
  totalRequired: 0,
}

export const campusLinks: CampusLink[] = [
  {
    id: 'ais',
    title: '教學務系統',
    subtitle: '課務、成績與學籍',
    url: 'https://ais.ntou.edu.tw/',
    group: '校務',
  },
  {
    id: 'tronclass',
    title: 'TronClass',
    subtitle: '教材、作業與課程公告',
    url: 'https://tronclass.ntou.edu.tw/',
    group: '學習',
  },
  {
    id: 'library',
    title: '海大圖書館',
    subtitle: '館藏、電子資源與空間',
    url: 'https://li.ntou.edu.tw/',
    group: '學習',
  },
  {
    id: 'academic',
    title: '教務處',
    subtitle: '校務公告與學期行事',
    url: 'https://academic.ntou.edu.tw/',
    group: '校務',
  },
  {
    id: 'ntou',
    title: '海大全球資訊網',
    subtitle: '學校首頁與校園資訊',
    url: 'https://www.ntou.edu.tw/',
    group: '校園',
  },
]

export const trafficInfo: TrafficInfo[] = [
  {
    id: 'campus-map',
    title: '校園地圖',
    subtitle: '校區與建築位置',
    url: 'https://www.ntou.edu.tw/',
  },
  {
    id: 'transport',
    title: '校區交通',
    subtitle: '公車、客運與停車資訊',
    url: 'https://ga.ntou.edu.tw/',
  },
]

export const emergencyContacts: EmergencyContact[] = [
  { id: 'guard', title: '校安中心', phone: '02-2462-9976', subtitle: '緊急事故通報' },
  { id: 'main', title: '海大總機', phone: '02-2462-2192', subtitle: '校內單位轉接' },
]
