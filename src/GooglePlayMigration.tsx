import { useLayoutEffect, useRef, useState } from 'react'
import { ExternalLink, Heart } from 'lucide-react'
import './GooglePlayMigration.css'

export const googlePlayUrl = 'https://play.google.com/store/apps/details?id=com.lxuan.ntou_tat'

export function GooglePlayMigration() {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(true)

  useLayoutEffect(() => {
    const node = dialog.current
    if (!open || !node) return
    const previousFocus = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    node.showModal()
    return () => {
      node.close()
      document.body.style.overflow = overflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [open])

  if (!open) return null

  return (
    <dialog ref={dialog} className="play-migration update-sheet" aria-labelledby="play-migration-title" onCancel={event => { event.preventDefault(); setOpen(false) }}>
      <div className="play-migration-brand"><img src={`${import.meta.env.BASE_URL}tat-mark.png`} alt="海大 TAT" /><span>海大 TAT<small>Google Play 正式版已上架</small></span></div>
      <p className="update-eyebrow"><Heart size={15} aria-hidden="true" /> 謝謝一路支持 TAT 的你</p>
      <h2 id="play-migration-title">我們在 Google Play 見</h2>
      <p className="play-migration-thanks">謝謝你下載、參與封測、回報問題，也謝謝每一個讓 TAT 變得更好的建議。</p>
      <p className="play-migration-thanks">GitHub 版更新到這裡告一段落。接下來，請透過 Google Play 安裝與更新海大 TAT，繼續一起用下去。</p>
      <div className="play-migration-data">
        <strong>移轉前，先保留需要的資料</strong>
        <p>請先截圖或記下自訂課表、課程備註與設定。如果安裝時遇到套件衝突，請先保存資料，再移除舊版。移除 App 會清除本機資料。</p>
      </div>
      <div className="update-actions">
        <a className="update-download" href={googlePlayUrl} target="_blank" rel="noreferrer"><ExternalLink size={19} aria-hidden="true" />前往 Google Play</a>
        <button className="update-later" type="button" onClick={() => setOpen(false)}>稍後再說</button>
      </div>
      <p className="play-migration-footnote">安裝後登入 AIS，使用信箱時再登入 Mail2000。</p>
    </dialog>
  )
}
