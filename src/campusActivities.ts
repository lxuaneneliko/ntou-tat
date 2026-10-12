import { activeBulletins, type CampusBulletinItem } from './campusBulletinData'
export type ActivityScope = 'all' | 'campus' | 'club'
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('zh-TW').trim()
export function filterCampusActivities(items: CampusBulletinItem[], scope: ActivityScope, category: string, query: string, now = Date.now()) {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  return activeBulletins(items, now).filter((item) => {
    if (scope === 'club' && !item.clubId) return false
    if (scope === 'campus' && item.clubId !== null) return false
    if (category && item.category !== category) return false
    const haystack = normalize([item.title, item.organizer, item.location, item.description].join(' '))
    return words.every((word) => haystack.includes(word))
  }).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id))
}
