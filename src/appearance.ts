export type NavigationKey = 'timetable' | 'activities' | 'calendar' | 'grades' | 'mail' | 'more' | 'portal' | 'announcements' | 'administration' | 'departments' | 'industry' | 'competitions' | 'school-song' | 'traffic' | 'emergency' | 'important-dates' | 'settings'
export const navigationLabels: Record<NavigationKey, string> = {
  timetable: '課表', activities: '活動', calendar: '行事曆', grades: '成績', mail: '信箱', more: '其他',
  portal: '校務系統', announcements: '校務公告', administration: '行政單位', departments: '各系系網',
  industry: '產學中心', competitions: '校外競賽', 'school-song': '校歌', traffic: '交通', emergency: '緊急聯絡', 'important-dates': '重要日期', settings: '外觀設定',
}
export type Appearance = { mode: 'dark' | 'light'; layout: 'classic' | 'soft' | 'compact'; brand: string; background: string; text: string; button: string; navigation: NavigationKey[]; preset?: string; navigationRevision?: number; bulletinAutoRotate?: boolean }
export const defaultAppearance: Appearance = { mode: 'dark', layout: 'classic', preset: 'harbor', brand: '#19252e', background: '#111b23', text: '#e8eff2', button: '#83d8f3', navigation: ['timetable', 'activities', 'grades', 'mail', 'more'], navigationRevision: 2, bulletinAutoRotate: true }
export const appearancePresets = [
  { id: 'harbor', label: '霧港藍', dark: '#83d8f3', light: '#087d9f' },
  { id: 'coral', label: '珊瑚映夜', dark: '#ff6662', light: '#c83f43' },
  { id: 'honey', label: '蜂蜜琥珀', dark: '#f9bf61', light: '#a66513' },
  { id: 'violet', label: '暮光藤', dark: '#b6a2ff', light: '#7954c7' },
  { id: 'lemon', label: '檸檬微光', dark: '#e7cf36', light: '#88750a' },
  { id: 'tide', label: '潮汐青', dark: '#57c4b7', light: '#218779' },
  { id: 'ink', label: '墨頁靛', dark: '#7f9aec', light: '#4668c6' },
]
export const presetAppearance = (id: string, mode: Appearance['mode'], current: Appearance = defaultAppearance): Appearance => {
  const preset = appearancePresets.find((item) => item.id === id) || appearancePresets[0]
  return { ...current, preset: preset.id, mode, brand: mode === 'dark' ? '#19252e' : '#ffffff', background: mode === 'dark' ? '#111b23' : '#f7f9fc', text: mode === 'dark' ? '#e8eff2' : '#20313d', button: preset[mode] }
}
export const normalizeNavigation = (raw: unknown): NavigationKey[] => {
  const chosen: NavigationKey[] = Array.isArray(raw) ? [...new Set(raw.filter((key): key is NavigationKey => typeof key === 'string' && key !== 'more' && Object.hasOwn(navigationLabels, key)))].slice(0, 4) : []
  for (const key of defaultAppearance.navigation) if (key !== 'more' && chosen.length < 4 && !chosen.includes(key)) chosen.push(key)
  return [...chosen, 'more']
}
const KEY = 'ntou-appearance-v3'
const isHex = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
export const parseAppearance = (value: unknown): Appearance => {
  const raw = value && typeof value === 'object' ? value as Partial<Appearance> : {}
  // One-time upgrade: replace Calendar in its saved slot, without changing colors
  // or other custom pins. Later explicit user choices remain editable.
  const oldNavigation = raw.navigationRevision !== 2 && Array.isArray(raw.navigation)
    ? raw.navigation.includes('activities') ? raw.navigation.filter((key) => key !== 'calendar') : raw.navigation.map((key) => key === 'calendar' ? 'activities' : key)
    : raw.navigation
  const navigation = normalizeNavigation(oldNavigation)
  return {
    mode: raw.mode === 'light' ? 'light' : 'dark',
    layout: raw.layout === 'soft' || raw.layout === 'compact' ? raw.layout : 'classic',
    brand: isHex(raw.brand) ? raw.brand : defaultAppearance.brand,
    background: isHex(raw.background) ? raw.background : defaultAppearance.background,
    text: isHex(raw.text) ? raw.text : defaultAppearance.text,
    button: isHex(raw.button) ? raw.button : defaultAppearance.button,
    navigation,
    navigationRevision: 2,
    bulletinAutoRotate: raw.bulletinAutoRotate !== false,
    preset: typeof raw.preset === 'string' ? raw.preset : value ? 'custom' : defaultAppearance.preset,
  }
}
export const readAppearance = (): Appearance => { try { return parseAppearance(JSON.parse(localStorage.getItem(KEY) || 'null')) } catch { return { ...defaultAppearance, navigation: [...defaultAppearance.navigation] } } }
const mix = (hex: string, target: string, amount: number) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount) + parseInt(target.slice(i, i + 2), 16) * amount).toString(16).padStart(2, '0')).join('')
export const contrastText = (hex: string) => {
  const components = [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4 })
  return components[0] * .2126 + components[1] * .7152 + components[2] * .0722 > .179 ? '#10212b' : '#ffffff'
}
export const applyAppearance = (settings: Appearance) => {
  const root = document.documentElement
  const light = settings.mode === 'light'
  const toward = '#ffffff'
  const tokens: Record<string, string> = {
    'app-bg': settings.background, ink: settings.text, accent: settings.button, active: settings.button,
    brand: settings.brand, 'brand-strong': mix(settings.brand, '#000000', .18), 'on-brand': contrastText(settings.brand), 'on-active': contrastText(settings.button),
    surface: mix(settings.background, toward, light ? .65 : .045), 'surface-raised': mix(settings.background, toward, light ? .8 : .09), 'surface-soft': mix(settings.background, light ? '#000000' : '#ffffff', .10),
    muted: mix(settings.text, settings.background, .35), line: mix(settings.text, settings.background, .84), 'line-strong': mix(settings.text, settings.background, .65),
    success: light ? '#16745b' : '#51d6ae', danger: light ? '#b42d40' : '#ff7676', 'danger-soft': light ? '#fbe5e9' : '#3b1e28',
    shadow: light ? '0 12px 40px rgba(20,40,50,.12)' : '0 20px 56px rgba(0,0,0,.42)',
    'control-radius': settings.layout === 'soft' ? '18px' : settings.layout === 'compact' ? '4px' : '8px',
    'row-space': settings.layout === 'compact' ? '8px' : '14px',
  }
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty('--' + name, value)
  root.dataset.layout = settings.layout
  root.dataset.mode = settings.mode
  root.style.colorScheme = settings.mode
}
export const saveAppearance = (settings: Appearance) => { try { localStorage.setItem(KEY, JSON.stringify({ ...settings, navigationRevision: 2 })) } catch { /* Live theme still works when storage is full. */ } applyAppearance(settings) }
