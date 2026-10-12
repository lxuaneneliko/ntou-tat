import { useState } from 'react'
import { activityImage, type ActivityImage } from './campusActivityMedia'
import type { CampusBulletinItem } from './campusBulletinData'

export function ActivityPoster({ item, detail = false }: { item: CampusBulletinItem; detail?: boolean }) {
  const image = activityImage(item)
  return image ? <PosterImage key={image.url} image={image} detail={detail} /> : null
}
function PosterImage({ image, detail }: { image: ActivityImage; detail: boolean }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return <span className={`activity-poster${detail ? ' detail' : ''}`}>
    <img src={image.url} alt={image.alt} loading={detail ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" crossOrigin="anonymous" onError={() => setFailed(true)} />
    {detail && image.credit ? <small className="activity-poster-credit">{image.credit}</small> : null}
  </span>
}
