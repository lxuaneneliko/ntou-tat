import media from './data/campusEventMedia.json'
import { CAMPUS_SITE } from './campusBulletinData'

type ActivitySource = { sourceUrl: string; title: string }
export type ActivityImage = { url: string; alt: string; credit: string }
const imageFile = /^[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/
const sourceKey = (value: string) => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    if (['instagram.com', 'www.instagram.com'].includes(url.hostname)) {
      const match = url.pathname.match(/^\/(?:[a-zA-Z0-9_.]+\/)?(p|reel|tv)\/([a-zA-Z0-9_-]+)\/?$/)
      return match ? { key: `www.instagram.com/${match[1]}/${match[2]}/`, instagramCode: match[2] } : null
    }
    return { key: url.hostname + decodeURI(url.pathname), instagramCode: null }
  } catch { return null }
}
const knownMedia = new Map(media.flatMap((row) => {
  const source = sourceKey(`https://${row.host}${row.sourcePath}`)
  return source && imageFile.test(row.file) ? [[source.key, row] as const] : []
}))

export function activityImage(item: ActivitySource): ActivityImage | null {
  const source = sourceKey(item.sourceUrl)
  if (!source) return null
  const image = knownMedia.get(source.key)
  if (image) return { url: `${CAMPUS_SITE}/media/${image.file}`, alt: image.alt || item.title, credit: image.credit }
  // The platform stores captured public IG covers at this stable path. New
  // captured posts can appear without rebuilding the App; 404 hides the cover.
  return source.instagramCode ? { url: `${CAMPUS_SITE}/media/ig-${source.instagramCode}.webp`, alt: `${item.title} · IG 原貼文圖片`, credit: 'IG 原貼文' } : null
}
