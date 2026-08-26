import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  AlertCircle,
  Building2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  RefreshCw,
  Search,
} from 'lucide-react'
import {
  DEPARTMENT_COLLEGES,
  DEPARTMENT_SITES,
  fetchDepartmentCategory,
  fetchDepartmentOverview,
} from './api/departmentSites'
import type {
  DepartmentCategory,
  DepartmentCollege,
  DepartmentOverview,
  DepartmentPost,
  DepartmentSite,
} from './api/departmentSites'
import {
  readDepartmentCacheStore,
  writeDepartmentCacheStore,
} from './storage/departmentSitesStorage'
import type { DepartmentSiteCache } from './storage/departmentSitesStorage'

export type DepartmentSitesScreenHandle = {
  goBack: () => boolean
}

const collegeAccents: Record<DepartmentCollege, string> = {
  海運暨管理學院: '#4fb6e9',
  生命科學院: '#57c7a4',
  海洋科學與資源學院: '#4d9ee8',
  工學院: '#f0b45a',
  電機資訊學院: '#aa8df4',
  人文社會科學院: '#ef8fa1',
  海洋法律與政策學院: '#77b5ba',
}

const messageFromError = (error: unknown) => error instanceof Error ? error.message : '系網暫時無法連線'

const timeLabel = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export const DepartmentSitesScreen = forwardRef<DepartmentSitesScreenHandle>(function DepartmentSitesScreen(_, ref) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<DepartmentSite | null>(null)
  const [overview, setOverview] = useState<DepartmentOverview | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState('')
  const [posts, setPosts] = useState<DepartmentPost[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef(readDepartmentCacheStore())
  const requestSerial = useRef(0)

  const storeCache = (siteId: string, cache: DepartmentSiteCache) => {
    cacheRef.current = { ...cacheRef.current, [siteId]: cache }
    writeDepartmentCacheStore(cacheRef.current)
  }

  const loadPosts = async (
    site: DepartmentSite,
    nextOverview: DepartmentOverview,
    category: DepartmentCategory,
    serial: number,
    previousCache?: DepartmentSiteCache,
  ) => {
    const cachedPosts = previousCache?.postsByCategory[category.id] ?? []
    const immediatePosts = category.initialPosts ?? cachedPosts
    setActiveCategoryId(category.id)
    setPosts(immediatePosts)

    try {
      const nextPosts = await fetchDepartmentCategory(site.id, category)
      if (serial !== requestSerial.current) return
      setPosts(nextPosts)
      storeCache(site.id, {
        overview: nextOverview,
        postsByCategory: {
          ...(previousCache?.postsByCategory ?? {}),
          [category.id]: nextPosts,
        },
        savedAt: new Date().toISOString(),
      })
    } catch (loadError) {
      if (serial !== requestSerial.current) return
      setError(cachedPosts.length ? `更新失敗，暫時顯示上次資料：${messageFromError(loadError)}` : messageFromError(loadError))
    }
  }

  const loadDepartment = async (site: DepartmentSite, preferredCategoryId?: string) => {
    const serial = ++requestSerial.current
    const cached = cacheRef.current[site.id]
    setSelected(site)
    setError(null)
    setLoading(!cached)
    setRefreshing(Boolean(cached))

    if (cached) {
      const cachedCategory = cached.overview.categories.find((category) => category.id === preferredCategoryId)
        ?? cached.overview.categories[0]
      setOverview(cached.overview)
      if (cachedCategory) {
        setActiveCategoryId(cachedCategory.id)
        setPosts(cachedCategory.initialPosts ?? cached.postsByCategory[cachedCategory.id] ?? [])
      }
    } else {
      setOverview(null)
      setActiveCategoryId('')
      setPosts([])
    }

    try {
      const nextOverview = await fetchDepartmentOverview(site.id)
      if (serial !== requestSerial.current) return
      const category = nextOverview.categories.find((item) => item.id === preferredCategoryId)
        ?? nextOverview.categories[0]
      setOverview(nextOverview)
      if (!category) {
        setPosts([])
        return
      }
      await loadPosts(site, nextOverview, category, serial, cached)
    } catch (loadError) {
      if (serial !== requestSerial.current) return
      setError(cached ? `更新失敗，暫時顯示上次資料：${messageFromError(loadError)}` : messageFromError(loadError))
    } finally {
      if (serial === requestSerial.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  const selectCategory = async (category: DepartmentCategory) => {
    if (!selected || !overview || category.id === activeCategoryId) return
    const serial = ++requestSerial.current
    const cached = cacheRef.current[selected.id]
    setError(null)
    setRefreshing(true)
    try {
      await loadPosts(selected, overview, category, serial, cached)
    } finally {
      if (serial === requestSerial.current) setRefreshing(false)
    }
  }

  const goBack = () => {
    if (!selected) return false
    requestSerial.current += 1
    setSelected(null)
    setOverview(null)
    setPosts([])
    setError(null)
    setLoading(false)
    setRefreshing(false)
    return true
  }

  useImperativeHandle(ref, () => ({ goBack }))

  const visibleGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return DEPARTMENT_COLLEGES.map((college) => ({
      college,
      sites: DEPARTMENT_SITES.filter((site) => site.college === college && (
        !normalizedQuery || `${site.name}${site.shortName}${site.college}`.toLowerCase().includes(normalizedQuery)
      )),
    })).filter((group) => group.sites.length)
  }, [query])

  if (!selected) {
    return (
      <section className="department-directory">
        <div className="department-directory-hero">
          <span className="department-directory-count">22</span>
          <div>
            <strong>海大學系情報站</strong>
            <span>依七個學院整理，消息分類完全沿用各系網站</span>
          </div>
        </div>
        <label className="department-search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋學系或學院" aria-label="搜尋學系或學院" />
        </label>
        <div className="department-college-list">
          {visibleGroups.map(({ college, sites }) => (
            <section className="department-college" key={college} style={{ '--college-accent': collegeAccents[college] } as CSSProperties}>
              <header><span /><strong>{college}</strong><small>{sites.length} 系</small></header>
              <div className="department-grid">
                {sites.map((site, index) => (
                  <button key={site.id} type="button" onClick={() => void loadDepartment(site)} style={{ '--department-index': index } as CSSProperties}>
                    <span className="department-monogram">{site.shortName.slice(0, 2)}</span>
                    <span><strong>{site.shortName}</strong><small>{site.name}</small></span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </div>
            </section>
          ))}
          {!visibleGroups.length ? <div className="inline-empty compact"><Search size={22} /><span>找不到符合的學系</span></div> : null}
        </div>
      </section>
    )
  }

  const activeCategory = overview?.categories.find((category) => category.id === activeCategoryId)
  const cached = cacheRef.current[selected.id]
  const accent = collegeAccents[selected.college]

  return (
    <section className="department-feed" style={{ '--college-accent': accent } as CSSProperties}>
      <div className="department-feed-heading">
        <button type="button" aria-label="返回各系列表" onClick={goBack}><ChevronLeft size={22} /></button>
        <span className="department-feed-monogram">{selected.shortName.slice(0, 2)}</span>
        <div><strong>{selected.name}</strong><span>{selected.college}</span></div>
        <a href={selected.url} target="_blank" rel="noreferrer" aria-label={`開啟${selected.name}官方網站`}><ExternalLink size={18} /></a>
      </div>

      {overview?.categories.length ? (
        <div className="department-category-strip" role="tablist" aria-label={`${selected.shortName}消息分類`}>
          {overview.categories.map((category) => (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={category.id === activeCategoryId}
              className={category.id === activeCategoryId ? 'active' : undefined}
              onClick={() => void selectCategory(category)}
            >
              {category.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="department-feed-summary">
        <Building2 size={18} />
        <span><b>{activeCategory?.label ?? '最新資訊'}</b><small>{cached ? `上次更新 ${timeLabel(cached.savedAt)}` : '正在讀取官方系網'}</small></span>
        <button type="button" aria-label="重新整理系所消息" disabled={loading || refreshing} onClick={() => void loadDepartment(selected, activeCategoryId)}>
          <RefreshCw className={loading || refreshing ? 'spin' : undefined} size={17} />
        </button>
      </div>

      {error ? <div className="department-feed-warning"><AlertCircle size={17} /><span>{error}</span></div> : null}

      {loading && !posts.length ? (
        <div className="inline-empty"><RefreshCw className="spin" size={24} /><span>正在讀取 {selected.shortName} 的官方消息</span></div>
      ) : posts.length ? (
        <div className="department-post-list">
          {posts.map((post) => (
            <a href={post.url} target="_blank" rel="noreferrer" key={post.id}>
              <span className="department-post-icon"><FileText size={18} /></span>
              <span><strong>{post.title}</strong><small>{post.publishedAt}</small></span>
              <ExternalLink size={16} />
            </a>
          ))}
        </div>
      ) : !loading ? (
        <div className="inline-empty"><FileText size={24} /><strong>這個分類目前沒有可讀取的消息</strong><span>可開啟右上角官方系網查看完整內容</span></div>
      ) : null}
    </section>
  )
})
