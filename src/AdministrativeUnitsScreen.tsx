import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  AlertCircle,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  RefreshCw,
  Search,
} from 'lucide-react'
import {
  ADMINISTRATIVE_GROUPS,
  ADMINISTRATIVE_UNITS,
  fetchAdministrativeCategory,
  fetchAdministrativeOverview,
} from './api/administrativeUnits'
import type {
  AdministrativeCategory,
  AdministrativeGroup,
  AdministrativeNavigationItem,
  AdministrativeOverview,
  AdministrativePost,
  AdministrativeUnit,
} from './api/administrativeUnits'
import {
  readAdministrativeCacheStore,
  writeAdministrativeCacheStore,
} from './storage/administrativeUnitsStorage'
import type { AdministrativeUnitCache } from './storage/administrativeUnitsStorage'
import type { CampusLink } from './types'

export type AdministrativeUnitsScreenHandle = {
  goBack: () => boolean
}

const groupAccents: Record<AdministrativeGroup, string> = {
  校級單位: '#7ab7e8',
  行政處室: '#54c3a7',
  行政中心: '#f0b45a',
  附屬學校: '#e38fa5',
}

const messageFromError = (error: unknown) => error instanceof Error ? error.message : '行政單位網站暫時無法連線'

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

const navigationLinkCount = (items: AdministrativeNavigationItem[]): number =>
  items.reduce((count, item) => count + (item.url ? 1 : 0) + navigationLinkCount(item.children), 0)

function AdministrativeNavigationList({
  items,
  depth = 0,
}: {
  items: AdministrativeNavigationItem[]
  depth?: number
}) {
  return (
    <div className="administrative-navigation-list" data-depth={depth}>
      {items.map((item) => item.children.length ? (
        <details key={item.id} className="administrative-navigation-group">
          <summary>
            <span className="administrative-navigation-icon"><LinkIcon size={17} /></span>
            <span><strong>{item.label}</strong><small>{navigationLinkCount(item.children)} 個連結</small></span>
            <ChevronDown size={18} />
          </summary>
          <div>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer">
                <span className="administrative-navigation-icon"><ExternalLink size={16} /></span>
                <span><strong>開啟{item.label}</strong><small>官方頁面</small></span>
                <ExternalLink size={15} />
              </a>
            ) : null}
            <AdministrativeNavigationList items={item.children} depth={depth + 1} />
          </div>
        </details>
      ) : item.url ? (
        <a href={item.url} target="_blank" rel="noreferrer" key={item.id}>
          <span className="administrative-navigation-icon"><LinkIcon size={16} /></span>
          <span><strong>{item.label}</strong><small>官方網站連結</small></span>
          <ExternalLink size={15} />
        </a>
      ) : null)}
    </div>
  )
}

export const AdministrativeUnitsScreen = forwardRef<AdministrativeUnitsScreenHandle, { links: CampusLink[] }>(
  function AdministrativeUnitsScreen({ links }, ref) {
    const [query, setQuery] = useState('')
    const [selectedParent, setSelectedParent] = useState<AdministrativeUnit | null>(null)
    const [selectedUnit, setSelectedUnit] = useState<AdministrativeUnit | null>(null)
    const [overview, setOverview] = useState<AdministrativeOverview | null>(null)
    const [activeCategoryId, setActiveCategoryId] = useState('')
    const [posts, setPosts] = useState<AdministrativePost[]>([])
    const [contentMode, setContentMode] = useState<'news' | 'links'>('news')
    const [loading, setLoading] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const cacheRef = useRef(readAdministrativeCacheStore())
    const requestSerial = useRef(0)

    const storeCache = (unitId: string, cache: AdministrativeUnitCache) => {
      cacheRef.current = { ...cacheRef.current, [unitId]: cache }
      writeAdministrativeCacheStore(cacheRef.current)
    }

    const loadPosts = async (
      unit: AdministrativeUnit,
      nextOverview: AdministrativeOverview,
      category: AdministrativeCategory,
      serial: number,
      previousCache?: AdministrativeUnitCache,
    ) => {
      const cachedPosts = previousCache?.postsByCategory[category.id] ?? []
      setActiveCategoryId(category.id)
      setPosts(category.initialPosts ?? cachedPosts)

      try {
        const nextPosts = await fetchAdministrativeCategory(unit.id, category)
        if (serial !== requestSerial.current) return
        setPosts(nextPosts)
        storeCache(unit.id, {
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

    const loadUnit = async (unit: AdministrativeUnit, preferredCategoryId?: string) => {
      const serial = ++requestSerial.current
      const cached = cacheRef.current[unit.id]
      setSelectedUnit(unit)
      setContentMode(cached && !cached.overview.categories.length && cached.overview.navigation.length ? 'links' : 'news')
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
        const nextOverview = await fetchAdministrativeOverview(unit.id)
        if (serial !== requestSerial.current) return
        const category = nextOverview.categories.find((item) => item.id === preferredCategoryId)
          ?? nextOverview.categories[0]
        setOverview(nextOverview)
        if (!category) {
          if (nextOverview.navigation.length) setContentMode('links')
          setPosts([])
          return
        }
        await loadPosts(unit, nextOverview, category, serial, cached)
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

    const selectCategory = async (category: AdministrativeCategory) => {
      if (!selectedUnit || !overview || category.id === activeCategoryId) return
      const serial = ++requestSerial.current
      const cached = cacheRef.current[selectedUnit.id]
      setError(null)
      setRefreshing(true)
      try {
        await loadPosts(selectedUnit, overview, category, serial, cached)
      } finally {
        if (serial === requestSerial.current) setRefreshing(false)
      }
    }

    const resetFeed = () => {
      requestSerial.current += 1
      setSelectedUnit(null)
      setOverview(null)
      setActiveCategoryId('')
      setPosts([])
      setContentMode('news')
      setError(null)
      setLoading(false)
      setRefreshing(false)
    }

    const goBack = () => {
      if (selectedUnit) {
        resetFeed()
        return true
      }
      if (selectedParent) {
        setSelectedParent(null)
        return true
      }
      return false
    }

    useImperativeHandle(ref, () => ({ goBack }))

    const visibleGroups = useMemo(() => {
      const normalizedQuery = query.trim().toLowerCase()
      return ADMINISTRATIVE_GROUPS.map((group) => ({
        group,
        units: ADMINISTRATIVE_UNITS.filter((unit) => unit.group === group && (
          !normalizedQuery || `${unit.name}${unit.shortName}${unit.children?.map((item) => `${item.name}${item.shortName}`).join('') ?? ''}`
            .toLowerCase()
            .includes(normalizedQuery)
        )),
      })).filter((section) => section.units.length)
    }, [query])

    if (selectedUnit) {
      const activeCategory = overview?.categories.find((category) => category.id === activeCategoryId)
      const cached = cacheRef.current[selectedUnit.id]
      const accent = groupAccents[selectedParent?.group ?? selectedUnit.group]
      const navigationCount = navigationLinkCount(overview?.navigation ?? [])

      return (
        <section className="department-feed administrative-feed" style={{ '--college-accent': accent } as CSSProperties}>
          <div className="department-feed-heading">
            <button type="button" aria-label="返回行政單位列表" onClick={goBack}><ChevronLeft size={22} /></button>
            <span className="department-feed-monogram">{selectedUnit.shortName.slice(0, 2)}</span>
            <div>
              <strong>{selectedUnit.name}</strong>
              <span>{selectedParent?.name ?? selectedUnit.group}</span>
            </div>
            <a href={selectedUnit.url} target="_blank" rel="noreferrer" aria-label={`開啟${selectedUnit.name}官方網站`}><ExternalLink size={18} /></a>
          </div>

          {overview?.navigation.length ? (
            <div className="administrative-content-tabs" role="tablist" aria-label={`${selectedUnit.shortName}內容類型`}>
              <button
                type="button"
                role="tab"
                aria-selected={contentMode === 'news'}
                className={contentMode === 'news' ? 'active' : undefined}
                disabled={!overview.categories.length}
                onClick={() => setContentMode('news')}
              >
                <FileText size={16} />公告資訊<small>{overview.categories.length}</small>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={contentMode === 'links'}
                className={contentMode === 'links' ? 'active' : undefined}
                onClick={() => setContentMode('links')}
              >
                <LinkIcon size={16} />網站連結<small>{navigationCount}</small>
              </button>
            </div>
          ) : null}

          {contentMode === 'news' && overview?.categories.length ? (
            <div className="department-category-strip" role="tablist" aria-label={`${selectedUnit.shortName}消息分類`}>
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

          {contentMode === 'news' ? (
            <div className="department-feed-summary">
              <Building2 size={18} />
              <span><b>{activeCategory?.label ?? '最新資訊'}</b><small>{cached ? `上次更新 ${timeLabel(cached.savedAt)}` : '正在讀取官方單位網站'}</small></span>
              <button type="button" aria-label="重新整理行政單位消息" disabled={loading || refreshing} onClick={() => void loadUnit(selectedUnit, activeCategoryId)}>
                <RefreshCw className={loading || refreshing ? 'spin' : undefined} size={17} />
              </button>
            </div>
          ) : (
            <div className="department-feed-summary administrative-navigation-summary">
              <LinkIcon size={18} />
              <span><b>官方網站導覽</b><small>依原網站順序保留群組與子連結</small></span>
              <button type="button" aria-label="重新整理行政單位連結" disabled={loading || refreshing} onClick={() => void loadUnit(selectedUnit, activeCategoryId)}>
                <RefreshCw className={loading || refreshing ? 'spin' : undefined} size={17} />
              </button>
            </div>
          )}

          {error ? <div className="department-feed-warning"><AlertCircle size={17} /><span>{error}</span></div> : null}

          {contentMode === 'links' ? (
            overview?.navigation.length ? (
              <AdministrativeNavigationList items={overview.navigation} />
            ) : !loading ? (
              <div className="inline-empty"><LinkIcon size={24} /><strong>這個單位網站沒有可讀取的連結區</strong><span>仍可開啟右上角官方網站</span></div>
            ) : null
          ) : loading && !posts.length ? (
            <div className="inline-empty"><RefreshCw className="spin" size={24} /><span>正在讀取 {selectedUnit.shortName} 的官方消息</span></div>
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
            <div className="inline-empty"><FileText size={24} /><strong>這個分類目前沒有可讀取的消息</strong><span>可開啟右上角官方網站查看完整內容</span></div>
          ) : null}
        </section>
      )
    }

    if (selectedParent) {
      return (
        <section className="administrative-children" style={{ '--college-accent': groupAccents[selectedParent.group] } as CSSProperties}>
          <div className="administrative-children-heading">
            <button type="button" aria-label="返回行政單位" onClick={goBack}><ChevronLeft size={22} /></button>
            <span className="department-feed-monogram">{selectedParent.shortName.slice(0, 2)}</span>
            <div><strong>{selectedParent.name}</strong><span>{selectedParent.children?.length ?? 0} 個所屬單位</span></div>
            <a href={selectedParent.url} target="_blank" rel="noreferrer" aria-label={`開啟${selectedParent.name}官方網站`}><ExternalLink size={18} /></a>
          </div>
          <div className="administrative-child-list">
            {selectedParent.children?.map((unit, index) => (
              <button key={unit.id} type="button" onClick={() => void loadUnit(unit)} style={{ '--administrative-index': index } as CSSProperties}>
                <span className="administrative-child-monogram">{unit.shortName.slice(0, 2)}</span>
                <span><strong>{unit.name}</strong><small>查看官方消息</small></span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        </section>
      )
    }

    return (
      <section className="department-directory administrative-directory">
        <div className="department-directory-hero">
          <span className="department-directory-count">20</span>
          <div>
            <strong>海大行政單位</strong>
            <span>依學校組織整理 45 個所屬單位，點入即可查看官方消息</span>
          </div>
        </div>

        {links.length ? (
          <section className="administrative-links">
            <header><LinkIcon size={17} /><strong>常用入口</strong><small>{links.length} 項</small></header>
            <div>
              {links.map((link) => (
                <a key={link.id} href={link.url} target="_blank" rel="noreferrer">
                  <span><strong>{link.title}</strong><small>{link.subtitle}</small></span>
                  <ExternalLink size={16} />
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <label className="department-search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋處室、中心或所屬單位" aria-label="搜尋行政單位" />
        </label>

        <div className="department-college-list">
          {visibleGroups.map(({ group, units }) => (
            <section className="department-college" key={group} style={{ '--college-accent': groupAccents[group] } as CSSProperties}>
              <header><span /><strong>{group}</strong><small>{units.length} 個</small></header>
              <div className="administrative-unit-list">
                {units.map((unit, index) => (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => unit.children?.length ? setSelectedParent(unit) : void loadUnit(unit)}
                    style={{ '--administrative-index': index } as CSSProperties}
                  >
                    <span className="administrative-unit-icon"><Building2 size={18} /></span>
                    <span>
                      <strong>{unit.name}</strong>
                      <small>{unit.children?.length ? `${unit.children.length} 個所屬單位` : '查看官方消息'}</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </div>
            </section>
          ))}
          {!visibleGroups.length ? <div className="inline-empty compact"><Search size={22} /><span>找不到符合的行政單位</span></div> : null}
        </div>
      </section>
    )
  },
)
